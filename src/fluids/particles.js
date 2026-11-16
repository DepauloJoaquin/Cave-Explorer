// =====================================================================
// ★ NÚCLEO LIQUIDFUN · PARTÍCULAS (líquidos, polvos y gases)
// =====================================================================
// Este archivo es la capa entre el juego y los sistemas de partículas
// de LiquidFun. Hace 5 cosas:
//   1. Crea los sistemas de partículas.
//   2. Crea partículas (spawnParticle, createFluidPool).
//   3. Da acceso rápido a sus buffers en memoria (view).
//   4. Las dibuja cada frame (renderParticles) y calcula sus luces.
//   5. Guarda/recupera las que quedan fuera de los chunks cargados.
//
// Cómo funciona LiquidFun por dentro (resumen):
//   Cada partícula es un círculo de radio fijo con posición y
//   velocidad. En cada world.Step() el motor calcula la PRESIÓN entre
//   partículas vecinas (si están muy juntas se empujan), la
//   viscosidad, la gravedad y los choques contra las fixtures del
//   terreno. Con miles de partículas eso se comporta como un fluido
//   (método parecido a SPH, "smoothed particle hydrodynamics").
//   Los "flags" cambian el comportamiento de cada partícula:
//     b2_waterParticle    agua normal
//     b2_viscousParticle  viscosa (lava, petróleo)
//     b2_powderParticle   polvo: no tiene presión, se apila (arena)
//
// Hay dos sistemas de partículas:
//   0 = materia densa (líquidos y polvos): cae con la gravedad y todos
//       sus elementos chocan entre sí (el agua empuja a la lava, etc.).
//   1 = gases: sin gravedad; cada gas recibe su propio empuje
//       (vapor sube, CO2 baja) en applyGasForces().
//
// El estado de cada partícula se guarda dentro de su color de LiquidFun
// (que viaja con la partícula aunque el buffer se reordene):
//   r     = id del elemento (0 = partícula destruida)
//   g, b  = temperatura en 16 bits ((°C + 300) * 10)
//   a     = progreso del cambio de fase (calor latente acumulado)
// =====================================================================

import { Container, Graphics, BlurFilter } from 'pixi.js';
import { Box2D, METER, world } from '../physics/world.js';
import { ELEMENTS, byId, byKey, incandescentColor } from '../elements/elements.js';
import { CHUNK_PIXELS } from '../terrain/config.js';

// Radio de las partículas: 0.08 m = 8 px (igual a una celda)
export const PARTICLE_RADIUS = 0.08;
export const RADIUS_PX = PARTICLE_RADIUS * METER;

// Máximo de partículas por sistema [densas, gases] (rendimiento)
const MAX_COUNT = [3500, 1800];

// -------------------------------------
// SISTEMAS
// -------------------------------------

// Crear un sistema de partículas dentro del mundo de LiquidFun.
// gravityScale: 1 = gravedad normal, 0 = flotan.
function createSystem(gravityScale, max) {
    const system = world.CreateParticleSystem(
        new Box2D.b2ParticleSystemDef()
    );
    system.SetRadius(PARTICLE_RADIUS);
    system.SetGravityScale(gravityScale);
    system.SetMaxParticleCount(max);
    return system;
}

export const SYSTEMS = [
    createSystem(1, MAX_COUNT[0]),
    createSystem(0, MAX_COUNT[1])
];

// En qué sistema va cada elemento
export function systemIndex(element) {
    return element.state === 'gas' ? 1 : 0;
}

// Flag de comportamiento de LiquidFun según el elemento
export function particleFlags(element) {
    switch (element.flags) {
        case 'viscous': return Box2D.b2_viscousParticle;
        case 'powder': return Box2D.b2_powderParticle;
        default: return Box2D.b2_waterParticle;
    }
}

// -------------------------------------
// TEMPERATURA CODIFICADA
// -------------------------------------

export function encodeTemp(t) {
    const v = Math.round((t + 300) * 10);
    return v < 0 ? 0 : v > 65535 ? 65535 : v;
}

export function decodeTemp(hi, lo) {
    return ((hi << 8) | lo) / 10 - 300;
}

// -------------------------------------
// ACCESO A LOS BUFFERS
// -------------------------------------

// Devuelve offsets dentro de Box2D.HEAPF32 / HEAPU8. Son válidos hasta
// que se cree una partícula nueva o se ejecute world.Step().
//
// Cómo leer la partícula i con lo que devuelve:
//   x   = HEAPF32[pos + i*2]     * METER   (en píxeles)
//   y   = HEAPF32[pos + i*2 + 1] * METER
//   vx  = HEAPF32[vel + i*2]               (en metros/segundo)
//   vy  = HEAPF32[vel + i*2 + 1]
//   r,g,b,a = HEAPU8[col + i*4 + 0..3]     (elemento, temp, temp, latente)
// pos y vel están divididos por 4 (>> 2) porque HEAPF32 se indexa de
// a floats (4 bytes) y getPointer devuelve una dirección en bytes.
export function view(index) {
    const sys = SYSTEMS[index];
    const count = sys.GetParticleCount();

    if (count === 0) {
        return { sys, count: 0 };
    }

    return {
        sys,
        count,
        pos: Box2D.getPointer(sys.GetPositionBuffer()) >> 2,
        vel: Box2D.getPointer(sys.GetVelocityBuffer()) >> 2,
        col: Box2D.getPointer(sys.GetColorBuffer())
    };
}

// Destruir una partícula y marcarla (r = 0) para que nadie la lea
export function killParticle(v, i) {
    Box2D.HEAPU8[v.col + i * 4] = 0;
    v.sys.DestroyParticle(i);
}

export function particleCount() {
    return SYSTEMS[0].GetParticleCount() + SYSTEMS[1].GetParticleCount();
}

// -------------------------------------
// CREACIÓN
// -------------------------------------

// Objetos reutilizables: crear objetos de Box2D reserva memoria en
// WebAssembly que JavaScript no libera solo, así que se crean una vez.
const tmpPos = new Box2D.b2Vec2(0, 0);
const tmpVel = new Box2D.b2Vec2(0, 0);
const tmpColor = new Box2D.b2ParticleColor(1, 0, 0, 0);
const particleDef = new Box2D.b2ParticleDef();

// Crear UNA partícula del elemento en (x, y) píxeles.
// Devuelve su índice, o -1 si no se pudo (sólido o sistema lleno).
export function spawnParticle(keyOrElement, x, y, temperature, vx = 0, vy = 0) {
    const element = typeof keyOrElement === 'string'
        ? byKey[keyOrElement]
        : keyOrElement;

    if (!element || element.state === 'solid') return -1;

    const s = systemIndex(element);
    const sys = SYSTEMS[s];

    if (sys.GetParticleCount() >= MAX_COUNT[s]) return -1;

    const t = encodeTemp(temperature ?? element.temp);

    tmpPos.Set(x / METER, y / METER);
    tmpVel.Set(vx, vy);
    tmpColor.Set(element.id, t >> 8, t & 255, 0);

    particleDef.set_position(tmpPos);
    particleDef.set_velocity(tmpVel);
    particleDef.set_color(tmpColor);
    particleDef.set_flags(particleFlags(element));

    return sys.CreateParticle(particleDef);
}

// Pileta: { type, positions:[{x,y}] } o { type, x, y, width, height }
export function createFluidPool(pool) {
    const element = byKey[pool.type];
    if (!element) return 0;

    let positions = pool.positions;

    // Prueba manual (tecla P): generar posiciones en una cuadrícula
    if (!Array.isArray(positions)) {
        positions = [];
        const spacing = 13;
        for (let py = pool.y + spacing / 2; py < pool.y + pool.height; py += spacing) {
            for (let px = pool.x + spacing / 2; px < pool.x + pool.width; px += spacing) {
                positions.push({ x: px, y: py });
            }
        }
    }

    const s = systemIndex(element);
    if (positions.length > MAX_COUNT[s] - SYSTEMS[s].GetParticleCount()) {
        console.warn('No hay capacidad para este depósito:', pool.id);
        return 0;
    }

    for (const p of positions) {
        spawnParticle(element, p.x, p.y);
    }

    return positions.length;
}

export function createWaterPool(x, y) {
    return createFluidPool({
        type: 'water',
        x,
        y,
        width: 156,
        height: 104
    });
}

// -------------------------------------
// FUERZAS DE LOS GASES (cada paso de física)
// -------------------------------------

// El sistema de gases no tiene gravedad: acá se escribe directo en el
// buffer de velocidades de LiquidFun para que cada gas suba o baje
// según su "buoyancy" (flotación), con un poco de movimiento aleatorio
// (difusión) y rozamiento con el aire.
export function applyGasForces(dt) {
    const v = view(1);
    if (v.count === 0) return;

    const F = Box2D.HEAPF32;
    const U = Box2D.HEAPU8;
    const drag = Math.max(0, 1 - 1.6 * dt);

    for (let i = 0; i < v.count; i++) {
        const element = byId[U[v.col + i * 4]];
        if (!element) continue;

        const vi = v.vel + i * 2;

        F[vi] = (F[vi] + (Math.random() - 0.5) * 6 * dt) * drag;
        F[vi + 1] = (F[vi + 1] - element.buoyancy * 10 * dt) * drag;
    }
}

// -------------------------------------
// CONGELAR PARTÍCULAS FUERA DE LA ZONA CARGADA
// -------------------------------------
// Si una partícula queda en un chunk descargado (sin colisiones) se
// guarda y se elimina; cuando el chunk vuelve a cargarse, reaparece.

const frozen = new Map(); // "cx,cy" -> [{ id, x, y, temp }]

export function updateStreaming(terrain) {
    const U = Box2D.HEAPU8;
    const F = Box2D.HEAPF32;

    for (let s = 0; s < 2; s++) {
        const v = view(s);

        for (let i = 0; i < v.count; i++) {
            const base = v.col + i * 4;
            const id = U[base];
            if (id === 0) continue;

            const x = F[v.pos + i * 2] * METER;
            const y = F[v.pos + i * 2 + 1] * METER;

            if (terrain.isLoadedAt(x, y)) continue;

            const key = `${Math.floor(x / CHUNK_PIXELS)},${Math.floor(y / CHUNK_PIXELS)}`;

            if (!frozen.has(key)) frozen.set(key, []);

            frozen.get(key).push({
                id,
                x,
                y,
                temp: decodeTemp(U[base + 1], U[base + 2])
            });

            killParticle(v, i);
        }
    }

    for (const [key, list] of frozen) {
        if (!terrain.chunks.has(key)) continue;

        for (const p of list) {
            spawnParticle(byId[p.id], p.x, p.y, p.temp);
        }

        frozen.delete(key);
    }
}

// -------------------------------------
// RENDER
// -------------------------------------

// LiquidFun no dibuja nada: solo calcula posiciones. Cada frame se
// leen las posiciones y se dibuja un círculo por partícula en un
// Graphics de PixiJS (uno por elemento, para darle a cada uno su
// filtro: metaballs a los líquidos, desenfoque a los gases).
export const particleContainer = new Container();
export const liquidGraphics = [];
const graphicsById = [];

const ORDER = { liquid: 0, powder: 1, gas: 2 };

for (const element of [...ELEMENTS]
    .filter((e) => e.state !== 'solid')
    .sort((a, b) => ORDER[a.state] - ORDER[b.state])) {

    const graphics = new Graphics();
    graphicsById[element.id] = graphics;

    if (element.state === 'liquid') {
        liquidGraphics.push(graphics);
    } else if (element.state === 'gas') {
        graphics.filters = [new BlurFilter({ strength: 7, quality: 2 })];
        if (element.blend === 'add') graphics.blendMode = 'add';
    }

    particleContainer.addChild(graphics);
}

export function renderParticles() {
    for (const graphics of graphicsById) {
        graphics?.clear();
    }

    const F = Box2D.HEAPF32;
    const U = Box2D.HEAPU8;

    for (let s = 0; s < 2; s++) {
        const v = view(s);

        for (let i = 0; i < v.count; i++) {
            const base = v.col + i * 4;
            const element = byId[U[base]];
            if (!element) continue;

            const graphics = graphicsById[element.id];
            const x = F[v.pos + i * 2] * METER;
            const y = F[v.pos + i * 2 + 1] * METER;

            let color = element.color;

            if (element.incandescent) {
                color = incandescentColor(decodeTemp(U[base + 1], U[base + 2]));
            }

            if (element.state === 'powder') {
                graphics.rect(x - 3.5, y - 3.5, 7, 7).fill(color);
            } else if (element.state === 'gas') {
                graphics.circle(x, y, RADIUS_PX * 1.15)
                    .fill({ color, alpha: element.alpha ?? 0.5 });
            } else {
                graphics.circle(x, y, RADIUS_PX).fill(color);
            }
        }
    }
}

// -------------------------------------
// LUCES
// -------------------------------------

// Las partículas que emiten luz (lava, ácido, fuego...) se agrupan en
// una grilla de 100 px y cada grupo produce UNA luz en su centro, para
// no dibujar una luz por partícula. lighting.js las dibuja.
export function getFluidLights(playerX, playerY) {
    const GRID_SIZE = 100;
    const MAX_LIGHTS = 18;
    const MAX_DISTANCE = 1100;

    const groups = new Map();
    const F = Box2D.HEAPF32;
    const U = Box2D.HEAPU8;

    for (let s = 0; s < 2; s++) {
        const v = view(s);

        for (let i = 0; i < v.count; i++) {
            const element = byId[U[v.col + i * 4]];
            if (!element?.light) continue;

            const x = F[v.pos + i * 2] * METER;
            const y = F[v.pos + i * 2 + 1] * METER;

            if (
                Math.abs(x - playerX) > MAX_DISTANCE ||
                Math.abs(y - playerY) > MAX_DISTANCE
            ) {
                continue;
            }

            const key = `${element.id},${Math.floor(x / GRID_SIZE)},${Math.floor(y / GRID_SIZE)}`;

            let group = groups.get(key);
            if (!group) {
                group = { element, sumX: 0, sumY: 0, count: 0 };
                groups.set(key, group);
            }

            group.sumX += x;
            group.sumY += y;
            group.count++;
        }
    }

    const lights = [];

    for (const group of groups.values()) {
        const x = group.sumX / group.count;
        const y = group.sumY / group.count;

        lights.push({
            x,
            y,
            color: group.element.light.color,
            intensity: group.element.light.intensity,
            radius: Math.min(200, 95 + Math.sqrt(group.count) * 7),
            distance: Math.hypot(x - playerX, y - playerY)
        });
    }

    lights.sort((a, b) => a.distance - b.distance);

    return lights.slice(0, MAX_LIGHTS);
}

export function getParticleCount() {
    return particleCount();
}
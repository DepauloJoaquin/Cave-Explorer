import { Container, Graphics } from 'pixi.js';

import {
    Box2D,
    METER,
    world
} from '../physics/world.js';

import { FLUID_TYPES } from './fluidTypes.js';

const MAX_PARTICLES = 2000;
const PARTICLE_RADIUS = 0.08;

// -------------------------------------
// UN SISTEMA DE PARTÍCULAS POR LÍQUIDO
// -------------------------------------

const systems = {};
const fluidContainer = new Container();
const fluidGraphics = {};

for (const type of Object.keys(FLUID_TYPES)) {
    const system = world.CreateParticleSystem(
        new Box2D.b2ParticleSystemDef()
    );
    system.SetRadius(PARTICLE_RADIUS);
    systems[type] = system;

    const graphics = new Graphics();
    fluidGraphics[type] = graphics;
    fluidContainer.addChild(graphics);
}

// Piletas registradas: id -> { type, bounds, active, saved }
const pools = new Map();
let manualCount = 0;

function getFluidParticleCount() {
    let total = 0;
    for (const system of Object.values(systems)) {
        total += system.GetParticleCount();
    }
    return total;
}

// -------------------------------------
// CREACIÓN DE PARTÍCULAS
// -------------------------------------

function spawn(type, positions) {
    const definition = new Box2D.b2ParticleDef();

    for (const p of positions) {
        definition.position = new Box2D.b2Vec2(
            p.x / METER,
            p.y / METER
        );
        systems[type].CreateParticle(definition);
    }
}

function createFluidParticle(x, y, type) {
    if (!FLUID_TYPES[type]) return false;
    spawn(type, [{ x, y }]);
    return true;
}

function createFluidPool(pool) {
    const { type } = pool;

    if (!FLUID_TYPES[type]) return 0;

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

    if (positions.length > MAX_PARTICLES - getFluidParticleCount()) {
        console.warn('No hay capacidad para este depósito:', pool.id);
        return 0;
    }

    const id = pool.id ?? `manual_${manualCount++}`;

    pools.set(id, {
        type,
        bounds: pool.bounds ?? null, // sin bounds = nunca duerme
        active: true,
        saved: null
    });

    spawn(type, positions);

    return positions.length;
}

function createWaterPool(x, y) {
    return createFluidPool({
        type: 'water',
        x,
        y,
        width: 156,
        height: 104
    });
}

// -------------------------------------
// DORMIR Y DESPERTAR PILETAS
// -------------------------------------

function sleepPool(pool) {
    const system = systems[pool.type];
    const count = system.GetParticleCount();

    const buffer = Box2D.HEAPF32;
    const offset =
        Box2D.getPointer(system.GetPositionBuffer()) >> 2;

    const b = pool.bounds;
    pool.saved = [];

    for (let i = 0; i < count; i++) {
        const x = buffer[offset + i * 2] * METER;
        const y = buffer[offset + i * 2 + 1] * METER;

        if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) {
            pool.saved.push({ x, y });
            system.DestroyParticle(i);
        }
    }

    pool.active = false;
}

function wakePool(pool) {
    spawn(pool.type, pool.saved);
    pool.saved = null;
    pool.active = true;
}

// Llamar cada frame DESPUÉS de terrain.update() y terrain.syncPhysics()
function updateFluidStreaming(terrain) {
    for (const pool of pools.values()) {
        if (!pool.bounds) continue;

        const b = pool.bounds;
        const loaded = terrain.areChunksLoaded(
            b.left, b.right, b.top, b.bottom
        );

        if (pool.active && !loaded) sleepPool(pool);
        else if (!pool.active && loaded) wakePool(pool);
    }
}

// -------------------------------------
// ACTUALIZACIÓN GRÁFICA
// -------------------------------------

function updateFluidGraphics() {
    const buffer = Box2D.HEAPF32;

    for (const type of Object.keys(systems)) {
        const graphics = fluidGraphics[type];
        const system = systems[type];

        graphics.clear();

        const count = system.GetParticleCount();
        if (count === 0) continue;

        const offset =
            Box2D.getPointer(system.GetPositionBuffer()) >> 2;

        for (let i = 0; i < count; i++) {
            const x = buffer[offset + i * 2] * METER;
            const y = buffer[offset + i * 2 + 1] * METER;

            graphics
                .circle(x, y, PARTICLE_RADIUS * METER)
                .fill(FLUID_TYPES[type].color);
        }
    }
}





function getFluidLights(playerX, playerY) {

    const GRID_SIZE = 100;
    const MAX_LIGHTS = 18;
    const MAX_DISTANCE = 1100;

    const groups = new Map();
    const positions = Box2D.HEAPF32;

    // Recorrer cada sistema de partículas
    for (const [type, system] of Object.entries(systems)) {

        const fluid = FLUID_TYPES[type];

        // Ignorar líquidos que no emiten luz
        if (
            !fluid ||
            !fluid.emitsLight ||
            fluid.lightIntensity <= 0
        ) {
            continue;
        }

        const count = system.GetParticleCount();

        if (count === 0) continue;

        const offset = Box2D.getPointer(
            system.GetPositionBuffer()
        ) >> 2;

        // Recorrer las partículas del líquido
        for (let i = 0; i < count; i++) {

            const index = offset + i * 2;

            const x = positions[index] * METER;
            const y = positions[index + 1] * METER;

            // Ignorar partículas alejadas del jugador
            if (
                Math.abs(x - playerX) > MAX_DISTANCE ||
                Math.abs(y - playerY) > MAX_DISTANCE
            ) {
                continue;
            }

            // Agrupar partículas por cuadrícula
            const gridX = Math.floor(x / GRID_SIZE);
            const gridY = Math.floor(y / GRID_SIZE);

            const key = `${type},${gridX},${gridY}`;

            if (!groups.has(key)) {
                groups.set(key, {
                    type,
                    sumX: 0,
                    sumY: 0,
                    count: 0
                });
            }

            const group = groups.get(key);

            group.sumX += x;
            group.sumY += y;
            group.count++;
        }
    }

    const lights = [];

    // Crear una luz por cada grupo
    for (const group of groups.values()) {

        const fluid = FLUID_TYPES[group.type];

        const x = group.sumX / group.count;
        const y = group.sumY / group.count;

        lights.push({
            x,
            y,
            color: fluid.lightColor,
            intensity: fluid.lightIntensity,

            radius: Math.min(
                200,
                95 + Math.sqrt(group.count) * 7
            ),

            distance: Math.hypot(
                x - playerX,
                y - playerY
            )
        });
    }

    // Priorizar luces cercanas al jugador
    lights.sort((a, b) => a.distance - b.distance);

    return lights.slice(0, MAX_LIGHTS);
}

export {
    systems,
    fluidContainer,
    fluidGraphics,
    createFluidParticle,
    createFluidPool,
    createWaterPool,
    updateFluidGraphics,
    updateFluidStreaming,
    getFluidParticleCount,
    getFluidLights
};
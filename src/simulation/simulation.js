// =====================================================================
// SIMULACIÓN DE TEMPERATURA, CAMBIOS DE FASE Y REACCIONES
// =====================================================================
// Cada tick:
//   1. Lee todas las partículas (posición, elemento, temperatura).
//   2. Las agrupa en una grilla espacial para encontrar vecinos.
//   3. Partícula-partícula: intercambian calor y, si existe una regla
//      en reactions.js, reaccionan.
//   4. Partícula-celda: lo mismo contra las celdas sólidas que toca.
//   5. Cada partícula pierde/gana calor con el ambiente y se evalúan
//      sus cambios de fase (con calor latente) y su desaparición.
//   6. Escribe los resultados en LiquidFun.
//   7. Difunde el calor entre celdas del terreno y evalúa sus cambios
//      de fase (hielo que se derrite, roca que se funde, etc.).
//   8. Crea las partículas nuevas y aplica explosiones.
// =====================================================================

import { Box2D, METER } from '../physics/world.js';
import { byId, byKey, AMBIENT } from '../elements/elements.js';
import { REACTION_MAP } from '../elements/reactions.js';
import {
    view,
    spawnParticle,
    killParticle,
    decodeTemp,
    encodeTemp,
    systemIndex,
    particleFlags,
    RADIUS_PX
} from '../fluids/particles.js';
import { CELL_SIZE, MATERIAL } from '../terrain/config.js';
import { cellKey, cellFromKey ,chunkId} from '../terrain/terrainManager.js';

const CONTACT = RADIUS_PX * 2 + 1;
const CONTACT2 = CONTACT * CONTACT;
const GRID = CONTACT;

// Constantes de transferencia de calor
const K_PP = 6;            // partícula - partícula
const K_PC = 3;            // partícula - celda
const K_CC = 2;            // celda - celda
const CELL_AMBIENT = 0.02; // celda - ambiente
const MAX_FRACTION = 0.15; // estabilidad numérica

// Cuántas celdas ocupa una partícula al solidificarse
const CELLS_PER_PARTICLE = 2;

const MIN_TEMP = -273;
const MAX_TEMP = 3500;

const SAMPLE_DIST = RADIUS_PX + 2;
const SAMPLE = [
    [SAMPLE_DIST, 0], [-SAMPLE_DIST, 0],
    [0, SAMPLE_DIST], [0, -SAMPLE_DIST]
];
const NEIGHBORS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const PLACE_ORDER = [
    [0, 0], [0, 1], [1, 0], [-1, 0], [0, -1],
    [1, 1], [-1, 1], [1, -1], [-1, -1]
];

const WET = new Set([byKey.water.id, byKey.brine.id]);

function happens(rate, dt) {
    return Math.random() < 1 - Math.exp(-rate * dt);
}

// undefined -> sin cambio, null -> desaparece, elemento -> se convierte
function resolve(spec) {
    if (spec === undefined) return undefined;
    if (spec === null) return null;
    if (typeof spec === 'string') return byKey[spec];
    if (Math.random() < (spec.chance ?? 1)) {
        return spec.to === null ? null : byKey[spec.to];
    }
    return undefined;
}

// Temperatura dentro del rango estable del producto
function stableTemp(element, t) {
    if (!element) return t;
    if (element.sustain && t < element.sustain) t = element.sustain;
    if (element.below && t <= element.below.temp) t = element.below.temp + 1;
    if (element.above && t >= element.above.temp) t = element.above.temp - 1;
    return t;
}

function gridKey(gx, gy) {
    return (gx + 32768) * 65536 + (gy + 32768);
}

export class Simulation {
    constructor(terrain) {
        this.terrain = terrain;
        this.capacity = 0;
        this.spawnQueue = [];
        this.explosions = [];
        this.grid = new Map();
        this.spawnCarry = 0;
        this.cellValues = new Float64Array(1024);
        this.useOptimizedBuffer = true;
        this.lastThermalCellCount = 0;
        this.lastNeighborChecks = 0;
        this.ensure(4096);
    }

    ensure(n) {
        if (n <= this.capacity) return;
        const c = Math.max(n, this.capacity * 2);
        this.X = new Float32Array(c);
        this.Y = new Float32Array(c);
        this.T = new Float32Array(c);
        this.D = new Float32Array(c);
        this.L = new Float32Array(c);
        this.NT = new Float32Array(c);
        this.E = new Uint8Array(c);
        this.NE = new Int16Array(c);
        this.S = new Uint8Array(c);
        this.I = new Int32Array(c);
        this.FL = new Uint8Array(c);
        this.NEXT = new Int32Array(c);
        this.GX = new Int32Array(c);
        this.GY = new Int32Array(c);

        this.capacity = c;
    }

    // =================================================================
    // TICK PRINCIPAL
    // =================================================================

    tick(dt) {
        const terrain = this.terrain;
        const F = Box2D.HEAPF32;
        const U = Box2D.HEAPU8;
        const views = [view(0), view(1)];

        this.ensure(views[0].count + views[1].count);

        const { X, Y, T, D, L, NT, E, NE, S, I, FL, NEXT, GX, GY } = this;

        // 1. Leer partículas
        let n = 0;

        for (let s = 0; s < 2; s++) {
            const v = views[s];

            for (let i = 0; i < v.count; i++) {
                const base = v.col + i * 4;
                const id = U[base];
                if (id === 0 || !byId[id]) continue;

                X[n] = F[v.pos + i * 2] * METER;
                Y[n] = F[v.pos + i * 2 + 1] * METER;
                E[n] = id;
                T[n] = decodeTemp(U[base + 1], U[base + 2]);
                L[n] = U[base + 3] / 255;
                S[n] = s;
                I[n] = i;
                NE[n] = -1;
                D[n] = 0;
                NT[n] = 0;
                FL[n] = 0;
                n++;
            }
        }

        // 2. Grilla espacial
        const grid = this.grid;
        grid.clear();

        for (let k = 0; k < n; k++) {
        const gx = Math.floor(X[k] / GRID);
        const gy = Math.floor(Y[k] / GRID);

        GX[k] = gx;
        GY[k] = gy;

        const key = gridKey(gx, gy);

        const head = grid.get(key);

        NEXT[k] = head === undefined ? -1 : head;
        grid.set(key, k);
        }

        
 // 3. Partícula - partícula
    this.benchmark.measure('Sim - Particulas', () => {

    for (let k = 0; k < n; k++) {

        const gx = GX[k];
        const gy = GY[k];

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {

                let j = grid.get(
                    gridKey(gx + dx, gy + dy)
                );

                if (j === undefined) continue;

                while (j !== -1) {
                    if (j > k) {
                        this.pair(k, j, dt);
                    }

                    j = NEXT[j];
                }
            }
        }
    }
});


        // 4. Partícula - celda
        for (let k = 0; k < n; k++) {
            if (NE[k] !== -1) continue;

            const ek = byId[E[k]];
            let lastKey = -1;

            for (const [ox, oy] of SAMPLE) {
                const cx = Math.floor((X[k] + ox) / CELL_SIZE);
                const cy = Math.floor((Y[k] + oy) / CELL_SIZE);
                const ck = cellKey(cx, cy);

                if (ck === lastKey) continue;
                lastKey = ck;

                const mat = terrain.getLoadedCell(cx, cy);
                if (mat <= 0) continue;

                const ec = byId[mat];
                if (!ec) continue;

                // Calor
                const tc = terrain.cellTemp.get(ck) ?? AMBIENT;
                const diff = tc - T[k];

                if (diff > 0.3 || diff < -0.3) {
                    let f = K_PC * Math.min(ek.cond, ec.cond) * dt;
                    if (f > MAX_FRACTION) f = MAX_FRACTION;
                    const hc = ek.cap * ec.cap / (ek.cap + ec.cap);
                    const q = f * diff * hc;
                    D[k] += q / ek.cap;
                    terrain.setCellTemp(cx, cy, tc - q / ec.cap);
                }

                // Reacción por contacto
                const entry = REACTION_MAP.get(E[k] * 256 + mat);

                if (entry && happens(entry.r.rate, dt)) {
                    const r = entry.r;
                    this.particleOutcome(
                        k,
                        entry.swap ? r.bTo : r.aTo,
                        entry.swap ? r.heatB : r.heatA
                    );
                    this.cellOutcome(cx, cy, entry.swap ? r.aTo : r.bTo, tc);
                    this.extras(r.extra, X[k], Y[k], T[k]);
                    if (r.explode) this.explosions.push({ x: X[k], y: Y[k], power: r.explode });
                    break;
                }
            }
        }

        // 5. Ambiente, cambios de fase y desaparición
        for (let k = 0; k < n; k++) {
            if (NE[k] !== -1) continue;

            const e = byId[E[k]];
            let t = T[k] + D[k];

            if (e.ambient) {
                t += (AMBIENT - t) * Math.min(1, e.ambient * dt);
            }

            if (e.sustain && t < e.sustain) t = e.sustain;
            if (t < MIN_TEMP) t = MIN_TEMP;
            if (t > MAX_TEMP) t = MAX_TEMP;

            let lat = L[k];
            let phase = null;

            if (e.above && t > e.above.temp) {
                if (!e.above.latent) {
                    phase = e.above;
                } else {
                    lat += (t - e.above.temp) / e.above.latent;
                    t = e.above.temp;
                    if (lat >= 1) phase = e.above;
                }
            } else if (e.below && t < e.below.temp) {
                if (!e.below.latent) {
                    phase = e.below;
                } else {
                    lat += (e.below.temp - t) / e.below.latent;
                    t = e.below.temp;
                    if (lat >= 1) phase = e.below;
                }
            } else if (lat > 0) {
                lat = Math.max(0, lat - dt * 0.3);
            }

            T[k] = t;
            L[k] = lat;

            if (phase) {
                const out = byKey[phase.to];
                NE[k] = out.id;
                NT[k] = stableTemp(out, t);
                this.extras(phase.extra, X[k], Y[k], t);
                if (phase.explode) this.explosions.push({ x: X[k], y: Y[k], power: phase.explode });
                continue;
            }

            if (e.decay && happens(e.decay.rate, dt)) {
                const to = e.decay.to && Math.random() < (e.decay.chance ?? 1)
                    ? byKey[e.decay.to]
                    : null;
                NE[k] = to ? to.id : 0;
                NT[k] = stableTemp(to, t);
            }
        }

        // 6. Escribir resultados
        for (let k = 0; k < n; k++) {
            const v = views[S[k]];
            const i = I[k];
            const base = v.col + i * 4;

            if (NE[k] === -1) {
                const enc = encodeTemp(T[k]);
                U[base + 1] = enc >> 8;
                U[base + 2] = enc & 255;
                const lb = Math.floor(L[k] * 255 + Math.random());
                U[base + 3] = lb > 255 ? 255 : lb;

                // Flotación (aceite sobre agua)
                const e = byId[E[k]];
                if (e.floats && (FL[k] & 1)) {
                    F[v.vel + i * 2 + 1] -= e.floats * 10 * dt;
                }
                continue;
            }

            if (NE[k] === 0) {
                killParticle(v, i);
                continue;
            }

            const out = byId[NE[k]];

            if (out.state === 'solid') {
                killParticle(v, i);
                this.placeCells(X[k], Y[k], out, NT[k]);
                continue;
            }

            if (systemIndex(out) === S[k]) {
                // Mismo sistema: se transforma en el lugar
                const enc = encodeTemp(NT[k]);
                U[base] = out.id;
                U[base + 1] = enc >> 8;
                U[base + 2] = enc & 255;
                U[base + 3] = 0;
                v.sys.SetParticleFlags(i, particleFlags(out));
                continue;
            }

            const vx = F[v.vel + i * 2];
            const vy = F[v.vel + i * 2 + 1];
            killParticle(v, i);
            this.spawnQueue.push({ element: out, x: X[k], y: Y[k], temp: NT[k], vx, vy });
        }

        // 7. Calor de las celdas
        this.benchmark.measure('Sim - Terreno termico', () => {
        this.updateCells(dt);
        });

        // 8. Partículas nuevas y explosiones
        this.flushSpawns();

        for (const ex of this.explosions) {
            this.applyImpulse(ex.x, ex.y, 20 * ex.power, ex.power * 3);
            terrain.destroyCircle(ex.x, ex.y, ex.power * 4);
        }

        this.explosions.length = 0;
    }

    pair(k, j, dt) {
        const { X, Y, T, D, E, NE, FL } = this;
        const ddx = X[j] - X[k];
        const ddy = Y[j] - Y[k];

        if (ddx * ddx + ddy * ddy > CONTACT2) return;

        const ek = byId[E[k]];
        const ej = byId[E[j]];

        // Calor
        const diff = T[j] - T[k];

        if (diff > 0.3 || diff < -0.3) {
            let f = K_PP * Math.min(ek.cond, ej.cond) * dt;
            if (f > MAX_FRACTION) f = MAX_FRACTION;
            const hc = ek.cap * ej.cap / (ek.cap + ej.cap);
            const q = f * diff * hc;
            D[k] += q / ek.cap;
            D[j] -= q / ej.cap;
        }

        if (WET.has(E[j])) FL[k] |= 1;
        if (WET.has(E[k])) FL[j] |= 1;

        // Reacción
        const entry = REACTION_MAP.get(E[k] * 256 + E[j]);

        if (!entry || NE[k] !== -1 || NE[j] !== -1) return;
        if (!happens(entry.r.rate, dt)) return;

        const r = entry.r;
        const a = entry.swap ? j : k;
        const b = entry.swap ? k : j;

        this.particleOutcome(a, r.aTo, r.heatA);
        this.particleOutcome(b, r.bTo, r.heatB);
        this.extras(r.extra, X[a], Y[a], T[a]);

        if (r.explode) {
            this.explosions.push({ x: X[b], y: Y[b], power: r.explode });
        }
    }

    particleOutcome(k, spec, heat) {
        if (heat) this.D[k] += heat;

        const out = resolve(spec);
        if (out === undefined) return;

        this.NE[k] = out === null ? 0 : out.id;
        this.NT[k] = stableTemp(out, this.T[k] + this.D[k]);
    }

    cellOutcome(cx, cy, spec, temp) {
        const out = resolve(spec);
        if (out === undefined) return;

        const terrain = this.terrain;

        if (out === null) {
            terrain.setCell(cx, cy, MATERIAL.EMPTY);
            return;
        }

        this.transformCell(cx, cy, out, temp);
    }

    transformCell(cx, cy, out, temp) {
        const terrain = this.terrain;

        if (out.state === 'solid') {
            terrain.setCell(cx, cy, out.id);
            terrain.setCellTemp(cx, cy, stableTemp(out, temp));
            return;
        }

        terrain.setCell(cx, cy, MATERIAL.EMPTY);

        if (Math.random() < out.fromCell) {
            this.spawnQueue.push({
                element: out,
                x: (cx + 0.5) * CELL_SIZE,
                y: (cy + 0.5) * CELL_SIZE,
                temp: stableTemp(out, temp)
            });
        }
    }

    extras(list, x, y, temp) {
        if (!list) return;

        for (const item of list) {
            if (Math.random() >= (item.chance ?? 1)) continue;

            const element = byKey[item.to];

            if (element.state === 'solid') {
                this.placeCells(x, y, element, stableTemp(element, temp));
            } else {
                this.spawnQueue.push({
                    element,
                    x: x + (Math.random() - 0.5) * 6,
                    y: y + (Math.random() - 0.5) * 6,
                    temp: stableTemp(element, temp)
                });
            }
        }
    }

    placeCells(x, y, element, temp) {
        const terrain = this.terrain;
        const cx0 = Math.floor(x / CELL_SIZE);
        const cy0 = Math.floor(y / CELL_SIZE);
        let placed = 0;

        for (const [dx, dy] of PLACE_ORDER) {
            if (placed >= CELLS_PER_PARTICLE) break;

            const cx = cx0 + dx;
            const cy = cy0 + dy;

            if (terrain.getLoadedCell(cx, cy) !== MATERIAL.EMPTY) continue;

            terrain.setCell(cx, cy, element.id);
            terrain.setCellTemp(cx, cy, temp);
            placed++;
        }
    }

    flushSpawns() {
        for (const p of this.spawnQueue) {
            spawnParticle(p.element, p.x, p.y, p.temp, p.vx ?? 0, p.vy ?? 0);
        }

        this.spawnQueue.length = 0;
    }

    // =================================================================
    // CALOR EN EL TERRENO
    // =================================================================

   
updateCells(dt) {

    const terrain = this.terrain;
    const temps = terrain.cellTemp;

    // Reiniciar métricas de este tick térmico
    this.lastThermalCellCount = 0;
    this.lastNeighborChecks = 0;
    this.lastSkippedThermalCells = 0; // NUEVO
    this.lastEmptyThermalCells = 0;
    this.lastUnloadedThermalCells = 0;

    if (temps.size === 0 && terrain.glowing.size === 0) {
        return;
    }

    // -------------------------------------
    // PREPARACIÓN DE DATOS
    // -------------------------------------

    
    const keys = [];

    // Recorrer solo los chunks actualmente cargados
    for (const chunk of terrain.chunkIndex.values()) {

        const id = chunkId(
            chunk.chunkX,
            chunk.chunkY
        );

        const bucket = temps.byChunk.get(id);

        if (!bucket) {
            continue;
        }

        for (const key of bucket) {
            keys.push(key);
        }
    }


    // Cantidad de celdas térmicas procesadas
    this.lastThermalCellCount = keys.length;

    let values;

    if (this.useOptimizedBuffer) {

        // Reutilizar memoria entre ticks
        if (keys.length > this.cellValues.length) {

            const newCapacity = Math.max(
                keys.length,
                this.cellValues.length * 2
            );

            this.cellValues = new Float64Array(newCapacity);
        }

        values = this.cellValues;

    } else {

        // Versión original para pruebas A/B
        values = new Float64Array(keys.length);
    }

    const adds = new Map();

    let neighborChecks = 0;

    // -------------------------------------
    // 1. DIFUSIÓN DEL CALOR
    // -------------------------------------

    for (let idx = 0; idx < keys.length; idx++) {

        const key = keys[idx];
        const tc = temps.get(key);
        const [cx, cy] = cellFromKey(key);

        const mat = terrain.getLoadedCell(cx, cy);

       if (mat <= 0) {

        this.lastSkippedThermalCells++;

        if (mat === -1) {
            // Chunk descargado: conservar su temperatura
            this.lastUnloadedThermalCells++;
        } else if (mat === MATERIAL.EMPTY) {
            // Celda vacía: no realiza difusión
            this.lastEmptyThermalCells++;
        }

        values[idx] = NaN;
        continue;
        }

        const ec = byId[mat];

        let d = (AMBIENT - tc) *
            Math.min(1, CELL_AMBIENT * dt);

        // Revisar los cuatro vecinos
        for (const [dx, dy] of NEIGHBORS4) {

            neighborChecks++;

            const nm = terrain.getLoadedCell(
                cx + dx,
                cy + dy
            );

            if (nm <= 0) continue;

            const en = byId[nm];

            const nk = cellKey(
                cx + dx,
                cy + dy
            );

            const tn = temps.get(nk) ?? AMBIENT;
            const diff = tn - tc;

            if (diff < 0.3 && diff > -0.3) {
                continue;
            }

            let f = K_CC *
                Math.min(ec.cond, en.cond) * dt;

            if (f > 0.12) f = 0.12;

            d += f * diff;

            if (!temps.has(nk)) {

                adds.set(
                    nk,
                    (adds.get(nk) ?? 0) -
                    f * diff * ec.cap / en.cap
                );
            }
        }

        values[idx] = tc + d;
    }

    // Registrar las consultas realizadas
    this.lastNeighborChecks = neighborChecks;

    // -------------------------------------
    // 2. APLICAR CALOR A CELDAS NUEVAS
    // -------------------------------------

    for (const [nk, delta] of adds) {

        if (Math.abs(delta) > 0.3) {
            temps.set(nk, AMBIENT + delta);
        }
    }

    // -------------------------------------
    // 3. CAMBIOS DE FASE Y BRILLO
    // -------------------------------------

    for (let idx = 0; idx < keys.length; idx++) {

        const key = keys[idx];
        const [cx, cy] = cellFromKey(key);

        let t = values[idx];

        if (Number.isNaN(t)) {

            // Celda vacía: eliminar temperatura.
            // Chunk descargado: conservar estado.
            if (
                terrain.getLoadedCell(cx, cy) === MATERIAL.EMPTY
            ) {
                temps.delete(key);
                terrain.cellLatent.delete(key);
                terrain.glowing.delete(key);
            }

            continue;
        }

        const ec = byId[
            terrain.getLoadedCell(cx, cy)
        ];

        let lat = terrain.cellLatent.get(key) ?? 0;
        let phase = null;

        if (ec.above && t > ec.above.temp) {

            if (!ec.above.latent) {

                phase = ec.above;

            } else {

                lat += (t - ec.above.temp) /
                    ec.above.latent;

                t = ec.above.temp;

                if (lat >= 1) {
                    phase = ec.above;
                }
            }

        } else if (ec.below && t < ec.below.temp) {

            if (!ec.below.latent) {

                phase = ec.below;

            } else {

                lat += (ec.below.temp - t) /
                    ec.below.latent;

                t = ec.below.temp;

                if (lat >= 1) {
                    phase = ec.below;
                }
            }

        } else if (lat > 0) {

            lat = Math.max(0, lat - dt * 0.3);
        }

        // Transformar material si cambia de fase
        if (phase) {

            const center = [
                (cx + 0.5) * CELL_SIZE,
                (cy + 0.5) * CELL_SIZE
            ];

            this.transformCell(
                cx,
                cy,
                byKey[phase.to],
                t
            );

            this.extras(
                phase.extra,
                center[0],
                center[1],
                t
            );

            if (phase.explode) {

                this.explosions.push({
                    x: center[0],
                    y: center[1],
                    power: phase.explode
                });
            }

            continue;
        }

        // Conservar calor latente
        if (lat > 0) {
            terrain.cellLatent.set(key, lat);
        } else {
            terrain.cellLatent.delete(key);
        }

        // Actualizar brillo del terreno caliente
        const glowing = terrain.glowing.has(key);

        if (t > 450) {

            terrain.tintCell(cx, cy, t);
            terrain.glowing.add(key);

        } else if (glowing) {

            terrain.tintCell(cx, cy, t);
            terrain.glowing.delete(key);
        }

        // Eliminar temperaturas próximas al ambiente
        if (Math.abs(t - AMBIENT) < 0.5 && lat === 0) {

            temps.delete(key);

        } else {

            temps.set(key, t);
        }
    }
}


    // =================================================================
    // HERRAMIENTAS
    // =================================================================

    forEachParticleInCircle(x, y, radius, callback) {
        const F = Box2D.HEAPF32;
        const U = Box2D.HEAPU8;
        const r2 = radius * radius;

        for (let s = 0; s < 2; s++) {
            const v = view(s);

            for (let i = 0; i < v.count; i++) {
                if (U[v.col + i * 4] === 0) continue;

                const px = F[v.pos + i * 2] * METER;
                const py = F[v.pos + i * 2 + 1] * METER;
                const dx = px - x;
                const dy = py - y;
                const d2 = dx * dx + dy * dy;

                if (d2 <= r2) callback(v, i, dx, dy, Math.sqrt(d2));
            }
        }
    }

    // Subir (delta > 0) o bajar (delta < 0) la temperatura de una zona
    heatArea(x, y, radius, delta) {
        const U = Box2D.HEAPU8;

        this.forEachParticleInCircle(x, y, radius, (v, i) => {
            const base = v.col + i * 4;
            let t = decodeTemp(U[base + 1], U[base + 2]) + delta;
            if (t < MIN_TEMP) t = MIN_TEMP;
            if (t > MAX_TEMP) t = MAX_TEMP;
            const enc = encodeTemp(t);
            U[base + 1] = enc >> 8;
            U[base + 2] = enc & 255;
        });

        const terrain = this.terrain;

        terrain.forEachCellInCircle(x, y, radius, (cx, cy) => {
            if (terrain.getLoadedCell(cx, cy) <= 0) return;
            let t = terrain.getCellTemp(cx, cy) + delta;
            if (t < MIN_TEMP) t = MIN_TEMP;
            if (t > MAX_TEMP) t = MAX_TEMP;
            terrain.setCellTemp(cx, cy, t);
        });
    }

    // Crear partículas de un elemento dentro del pincel
    spawnBrush(key, x, y, radius, count) {
        const element = byKey[key];
        if (!element) return;

        this.spawnCarry += count;
        const total = Math.floor(this.spawnCarry);
        this.spawnCarry -= total;

        for (let n = 0; n < total; n++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.sqrt(Math.random()) * Math.max(2, radius - RADIUS_PX);
            const px = x + Math.cos(angle) * dist;
            const py = y + Math.sin(angle) * dist;

            const mat = this.terrain.getLoadedCell(
                Math.floor(px / CELL_SIZE),
                Math.floor(py / CELL_SIZE)
            );

            if (mat !== MATERIAL.EMPTY) continue;

            spawnParticle(element, px, py);
        }
    }

    // Pintar celdas sólidas dentro del pincel
    paintBrush(key, x, y, radius) {
        const element = byKey[key];
        if (!element) return;

        const terrain = this.terrain;

        terrain.forEachCellInCircle(x, y, radius, (cx, cy) => {
            if (terrain.getLoadedCell(cx, cy) !== MATERIAL.EMPTY) return;
            terrain.setCell(cx, cy, element.id);
            terrain.setCellTemp(cx, cy, element.temp);
        });
    }

    // Borrar partículas y terreno
    eraseBrush(x, y, radius) {
        this.forEachParticleInCircle(x, y, radius, (v, i) => killParticle(v, i));
        this.terrain.destroyCircle(x, y, radius);
    }

    applyImpulse(x, y, radius, strength) {
        const F = Box2D.HEAPF32;

        this.forEachParticleInCircle(x, y, radius, (v, i, dx, dy, d) => {
            const k = strength * (1 - d / radius) / (d || 1);
            F[v.vel + i * 2] += dx * k;
            F[v.vel + i * 2 + 1] += dy * k;
        });
    }

    explode(x, y, power = 1) {
        this.terrain.destroyCircle(x, y, 30 * power);
        this.applyImpulse(x, y, 90 * power, 7 * power);
        this.heatArea(x, y, 45 * power, 650);

        for (let n = 0; n < 16; n++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 22 * power;
            spawnParticle(
                n % 2 ? byKey.fire : byKey.smoke,
                x + Math.cos(angle) * dist,
                y + Math.sin(angle) * dist,
                undefined,
                Math.cos(angle) * 3,
                Math.sin(angle) * 3
            );
        }
    }

    // Resumen para depurar: cantidad y temperatura media por elemento
    stats(x = 0, y = 0, radius = Infinity) {
        const U = Box2D.HEAPU8;
        const result = {};

        this.forEachParticleInCircle(x, y, radius, (v, i, dx, dy) => {
            const base = v.col + i * 4;
            const e = byId[U[base]];
            if (!e) return;
            const r = result[e.key] ??= { count: 0, temp: 0, y: 0 };
            r.count++;
            r.temp += decodeTemp(U[base + 1], U[base + 2]);
            r.y += y + dy;
        });

        for (const r of Object.values(result)) {
            r.temp = Math.round(r.temp / r.count);
            r.y = Math.round(r.y / r.count);
        }

        return result;
    }

    // Qué hay bajo el cursor
    probe(x, y) {
        const U = Box2D.HEAPU8;
        let best = null;
        let bestDist = RADIUS_PX + 3;

        this.forEachParticleInCircle(x, y, bestDist, (v, i, dx, dy, d) => {
            if (d < bestDist) {
                const base = v.col + i * 4;
                bestDist = d;
                best = {
                    element: byId[U[base]],
                    temp: decodeTemp(U[base + 1], U[base + 2])
                };
            }
        });

        if (best?.element) return best;

        const cx = Math.floor(x / CELL_SIZE);
        const cy = Math.floor(y / CELL_SIZE);
        const mat = this.terrain.getLoadedCell(cx, cy);

        if (mat > 0) {
            return { element: byId[mat], temp: this.terrain.getCellTemp(cx, cy) };
        }

        return { element: null, temp: AMBIENT };
    }
}

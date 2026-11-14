// =====================================================================
// ★ NÚCLEO · GENERADOR DE PILETAS (une terreno + LiquidFun)
// =====================================================================
// Cuando se carga un chunk, main.js le pregunta a esta clase si ese
// chunk es el "dueño" de la cámara de su región (poolGeometry.js).
// Si lo es, calcula una grilla de posiciones dentro de la mitad
// inferior de la cámara y elige qué líquido poner (según poolWeight
// de elements.js). main.js después crea esas partículas.
//
// Cada pileta se genera UNA sola vez (generatedChunks). Si después el
// jugador se aleja, las partículas se guardan y se recuperan con
// updateStreaming() en particles.js.
// =====================================================================

import {
    CHUNK_CELLS,
    CELL_SIZE,
    MATERIAL
} from '../terrain/config.js';

import { hash } from '../terrain/noise.js';

import {
    getPoolChamber,
    isInsideChamber
} from '../terrain/poolGeometry.js';

import { ELEMENTS } from '../elements/elements.js';

// Elementos que pueden aparecer en las piletas naturales
const POOL_TYPES = Object.fromEntries(
    ELEMENTS
        .filter((e) => e.poolWeight)
        .map((e) => [e.key, { weight: e.poolWeight }])
);

export class PoolGenerator {
    constructor(seed) {
        this.seed = seed;
        this.generatedChunks = new Set();
    }

    // Elegir el líquido de la región por sorteo con pesos
    // (determinista: usa hash, siempre sale el mismo para la región)
    selectFluid(rx, ry) {
        const entries = Object.entries(POOL_TYPES);

        const totalWeight = entries.reduce(
            (sum, [, fluid]) => sum + fluid.weight,
            0
        );

        let value = hash(
            rx,
            ry,
            this.seed + 1000
        ) * totalWeight;

        for (const [name, fluid] of entries) {
            value -= fluid.weight;

            if (value < 0) return name;
        }

        return entries[entries.length - 1][0];
    }

    // Comprobar que una partícula quepa en el espacio
    isClear(terrain, x, y) {
        const margin = 10;

        for (const dx of [-margin, margin]) {
            for (const dy of [-margin, margin]) {
                if (
                    terrain.getMaterialAt(x + dx, y + dy)
                    !== MATERIAL.EMPTY
                ) {
                    return false;
                }
            }
        }

        return true;
    }

    // Devuelve [] o una lista con una pileta:
    // { id, type, positions:[{x,y}], bounds }
    generateForChunk(terrain, chunkX, chunkY) {
        // Región de 3x3 chunks a la que pertenece este chunk
        const regionX = Math.floor(chunkX / 3);
        const regionY = Math.floor(chunkY / 3);

        const chamber = getPoolChamber(
            regionX,
            regionY,
            this.seed
        );

        const ownerX = Math.floor(
            chamber.centerX / CHUNK_CELLS
        );

        const ownerY = Math.floor(
            chamber.centerY / CHUNK_CELLS
        );

        // Solamente un chunk genera el depósito
        if (chunkX !== ownerX || chunkY !== ownerY) {
            return [];
        }

        const key = chamber.id;

        if (this.generatedChunks.has(key)) {
            return [];
        }

        const positions = [];

        const spacing = 13;

        // Altura de la superficie del líquido
        const surfaceY =
            (chamber.centerY + chamber.radiusY * 0.15)
            * CELL_SIZE;

        const left =
            (chamber.centerX - chamber.radiusX)
            * CELL_SIZE;

        const right =
            (chamber.centerX + chamber.radiusX)
            * CELL_SIZE;

        const bottom =
            (chamber.centerY + chamber.radiusY)
            * CELL_SIZE;

        // Llenar solamente la parte inferior
        for (let y = surfaceY; y <= bottom; y += spacing) {
            for (let x = left; x <= right; x += spacing) {

                const cellX = Math.floor(x / CELL_SIZE);
                const cellY = Math.floor(y / CELL_SIZE);

                // Comprobar la geometría de la cámara
                if (!isInsideChamber(chamber, cellX, cellY)) {
                    continue;
                }

                // Evitar crear partículas contra las paredes
                if (!this.isClear(terrain, x, y)) {
                    continue;
                }

                positions.push({ x, y });
            }
        }

        if (positions.length < 15) {
            return [];
        }

        this.generatedChunks.add(key);

        const wall = 4;

        return [{
            id: key,
            type: this.selectFluid(regionX, regionY),
            positions,
            bounds: {
                left:   (chamber.centerX - chamber.radiusX - wall) * CELL_SIZE,
                right:  (chamber.centerX + chamber.radiusX + wall) * CELL_SIZE,
                top:    (chamber.centerY - chamber.radiusY - wall) * CELL_SIZE,
                bottom: (chamber.centerY + chamber.radiusY + wall) * CELL_SIZE
            }
        }];
    }
}

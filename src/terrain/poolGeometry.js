
import { CHUNK_CELLS, MATERIAL } from './config.js';
import { hash } from './noise.js';

const REGION_SIZE = CHUNK_CELLS * 3;
const WALL_THICKNESS = 4;

// Parámetros reproducibles de cada cámara
export function getPoolChamber(rx, ry, seed) {
    const randomX = hash(rx, ry, seed + 700);
    const randomY = hash(rx, ry, seed + 701);

    return {
        id: `${rx},${ry}`,
        centerX: rx * REGION_SIZE +
            REGION_SIZE / 2 + Math.floor((randomX - 0.5) * 12),

        centerY: ry * REGION_SIZE +
            REGION_SIZE / 2 + Math.floor((randomY - 0.5) * 12),

        radiusX: 23 + Math.floor(hash(rx, ry, seed + 702) * 7),
        radiusY: 17 + Math.floor(hash(rx, ry, seed + 703) * 5),

        variation: hash(rx, ry, seed + 704) * 6.28
    };
}

// Calcular el techo y el fondo para una columna
function getBounds(chamber, x, extra = 0) {
    const radiusX = chamber.radiusX + extra;
    const radiusY = chamber.radiusY + extra;

    const normalizedX = (x - chamber.centerX) / radiusX;

    if (Math.abs(normalizedX) >= 1) {
        return null;
    }

    const curve = Math.sqrt(1 - normalizedX * normalizedX);

    const wave = Math.sin(
        x * 0.23 + chamber.variation
    ) * 1.3;

    const detail = Math.sin(
        x * 0.51 + chamber.variation * 2
    ) * 0.5;

    return {
        top: chamber.centerY - radiusY * curve + wave + detail,
        bottom: chamber.centerY + radiusY * curve + wave * 0.6
    };
}

// Determinar si una celda está dentro de una cámara
export function isInsideChamber(chamber, x, y) {
    const bounds = getBounds(chamber, x);

    if (!bounds) return false;

    return y >= bounds.top && y <= bounds.bottom;
}

// Alterar el terreno procedural
export function getPoolTerrainOverride(x, y, seed) {
    const rx = Math.floor(x / REGION_SIZE);
    const ry = Math.floor(y / REGION_SIZE);

    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const chamber = getPoolChamber(
                rx + dx,
                ry + dy,
                seed
            );

            if (isInsideChamber(chamber, x, y)) {
                return MATERIAL.EMPTY;
            }

            // Crear una pared que contenga el líquido
            const outer = getBounds(
                chamber,
                x,
                WALL_THICKNESS
            );

            if (
                outer &&
                y >= outer.top &&
                y <= outer.bottom
            ) {
                return MATERIAL.ROCK;
            }
        }
    }

    return null;
}

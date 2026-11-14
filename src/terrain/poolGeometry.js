// =====================================================================
// ★ NÚCLEO DEL TERRENO · CÁMARAS DE LAS PILETAS
// =====================================================================
// El mundo se divide en "regiones" de 3x3 chunks. Cada región tiene
// UNA cámara con forma de elipse irregular donde después
// poolGenerator.js vuelca un líquido.
//
// Igual que el resto del terreno, todo se calcula con hash(seed):
// la misma región siempre da la misma cámara, sin guardar nada.
//
// La cámara modifica el terreno de dos formas:
//   - adentro: vacío (el hueco donde va el líquido),
//   - un anillo de WALL_THICKNESS celdas alrededor: roca, para que el
//     líquido no se escape por un túnel del ruido.
// =====================================================================

import { CHUNK_CELLS, MATERIAL } from './config.js';
import { hash } from './noise.js';

// Tamaño de una región, en celdas (3 chunks)
const REGION_SIZE = CHUNK_CELLS * 3;

// Grosor de la pared de roca que rodea la cámara
const WALL_THICKNESS = 4;

// Parámetros reproducibles de la cámara de la región (rx, ry)
export function getPoolChamber(rx, ry, seed) {
    const randomX = hash(rx, ry, seed + 700);
    const randomY = hash(rx, ry, seed + 701);

    return {
        id: `${rx},${ry}`,

        // Centro: el medio de la región con un pequeño desplazamiento
        centerX: rx * REGION_SIZE +
            REGION_SIZE / 2 + Math.floor((randomX - 0.5) * 12),

        centerY: ry * REGION_SIZE +
            REGION_SIZE / 2 + Math.floor((randomY - 0.5) * 12),

        // Radios de la elipse (en celdas)
        radiusX: 23 + Math.floor(hash(rx, ry, seed + 702) * 7),
        radiusY: 17 + Math.floor(hash(rx, ry, seed + 703) * 5),

        // Fase de las ondulaciones del borde
        variation: hash(rx, ry, seed + 704) * 6.28
    };
}

// Calcular el techo y el fondo de la cámara en la columna x.
// `extra` agranda la elipse (se usa para calcular la pared).
// Devuelve null si la columna queda fuera de la elipse.
function getBounds(chamber, x, extra = 0) {
    const radiusX = chamber.radiusX + extra;
    const radiusY = chamber.radiusY + extra;

    // -1..1 a lo ancho de la elipse
    const normalizedX = (x - chamber.centerX) / radiusX;

    if (Math.abs(normalizedX) >= 1) {
        return null;
    }

    // Altura de la elipse en esta columna
    const curve = Math.sqrt(1 - normalizedX * normalizedX);

    // Ondulaciones para que no sea una elipse perfecta
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

// Usado por worldGenerator: ¿esta celda pertenece a alguna cámara?
//   EMPTY -> está adentro de una cámara
//   ROCK  -> está en la pared de una cámara
//   null  -> no tiene nada que ver con cámaras (decide el ruido)
export function getPoolTerrainOverride(x, y, seed) {
    const rx = Math.floor(x / REGION_SIZE);
    const ry = Math.floor(y / REGION_SIZE);

    // Revisar la región propia y las 8 vecinas (una cámara puede
    // asomarse a la región de al lado)
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

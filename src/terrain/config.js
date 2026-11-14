// =====================================================================
// ★ NÚCLEO DEL TERRENO · CONFIGURACIÓN
// =====================================================================
// Unidades del mundo:
//   píxel  -> unidad de dibujo de PixiJS.
//   celda  -> el "vóxel" del juego: un cuadrado de CELL_SIZE píxeles
//             con un único material (roca, hielo, vacío...).
//   chunk  -> bloque de CHUNK_CELLS x CHUNK_CELLS celdas. Es la unidad
//             que se carga/descarga, se dibuja (una textura) y tiene su
//             propio cuerpo de colisiones en LiquidFun.
//
// Una celda = 8 píxeles; cada chunk = 32x32 celdas = 256x256 píxeles.
// =====================================================================

export const CELL_SIZE = 8;
export const CHUNK_CELLS = 32;
export const CHUNK_PIXELS = CELL_SIZE * CHUNK_CELLS;

// Ids de los materiales que genera el mundo. Coinciden con los ids
// definidos en src/elements/elements.js (allí está la lista completa).
export const MATERIAL = Object.freeze({ EMPTY: 0, ROCK: 1, DEEP_ROCK: 2, ORE: 3, CRYSTAL: 4 });

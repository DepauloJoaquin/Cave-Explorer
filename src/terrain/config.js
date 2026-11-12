// Una celda = 8 píxeles; cada chunk = 32x32 celdas = 256x256 píxeles.
export const CELL_SIZE = 8;
export const CHUNK_CELLS = 32;
export const CHUNK_PIXELS = CELL_SIZE * CHUNK_CELLS;
export const MATERIAL = Object.freeze({ EMPTY: 0, ROCK: 1, DEEP_ROCK: 2, ORE: 3, CRYSTAL: 4 });

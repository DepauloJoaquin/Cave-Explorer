import { Sprite, Texture } from 'pixi.js';
import { CHUNK_CELLS, CHUNK_PIXELS, CELL_SIZE, MATERIAL } from './config.js';
import { getMaterial } from './worldGenerator.js';
import { hash } from './noise.js';

const COLORS = {
  [MATERIAL.ROCK]: ['#263341', '#2c3947', '#324253', '#384858'],
  [MATERIAL.DEEP_ROCK]: ['#182333', '#1c2838', '#223044', '#293649'],
  [MATERIAL.ORE]: ['#536b81', '#668399', '#8d9fb1', '#b4bfc6'],
  [MATERIAL.CRYSTAL]: ['#246e8b', '#3299b5', '#66d4e7', '#9af8fa']
};
function toRGB(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
const PALETTE = Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [k, v.map(toRGB)]));

export function createChunk(chunkX, chunkY, seed, destroyedCells = new Set()) {
  const canvas = document.createElement('canvas');
  canvas.width = CHUNK_CELLS;
  canvas.height = CHUNK_CELLS;
  const ctx = canvas.getContext('2d', { alpha: true });
  const image = ctx.createImageData(CHUNK_CELLS, CHUNK_CELLS);
  const materials = new Uint8Array(CHUNK_CELLS * CHUNK_CELLS);
  for (let y = 0; y < CHUNK_CELLS; y++) {
    for (let x = 0; x < CHUNK_CELLS; x++) {
      const gx = chunkX * CHUNK_CELLS + x;
      const gy = chunkY * CHUNK_CELLS + y;

      const idx = y * CHUNK_CELLS + x;
      const type = destroyedCells.has(idx) ? MATERIAL.EMPTY : getMaterial(gx, gy, seed);
      materials[idx] = type;
      if (type === MATERIAL.EMPTY) continue;
      const variation = Math.floor(hash(gx, gy, seed + 943) * PALETTE[type].length);
      const [r, g, b] = PALETTE[type][variation];
      image.data[idx * 4] = r;
      image.data[idx * 4 + 1] = g;
      image.data[idx * 4 + 2] = b;
      image.data[idx * 4 + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  const sprite = new Sprite(texture);
  sprite.position.set(chunkX * CHUNK_PIXELS, chunkY * CHUNK_PIXELS);
  sprite.scale.set(CELL_SIZE);
  sprite.eventMode = 'none';
  return { sprite, texture, materials, canvas, ctx, image };
}



export function destroyChunkCell(chunk, localX, localY) {
  if (
    localX < 0 || localX >= CHUNK_CELLS ||
    localY < 0 || localY >= CHUNK_CELLS
  ) {
    return false;
  }

  const index = localY * CHUNK_CELLS + localX;

  if (chunk.materials[index] === MATERIAL.EMPTY) {
    return false;
  }

  // Vaciar la celda del terreno
  chunk.materials[index] = MATERIAL.EMPTY;

  // Hacer transparente su píxel
  const pixel = index * 4;

  chunk.image.data[pixel] = 0;
  chunk.image.data[pixel + 1] = 0;
  chunk.image.data[pixel + 2] = 0;
  chunk.image.data[pixel + 3] = 0;

  // Actualizar la textura de PixiJS
  chunk.ctx.putImageData(chunk.image, 0, 0);
  chunk.texture.source.update();

  return true;
}

// =====================================================================
// ★ NÚCLEO DEL TERRENO · CHUNK (datos + imagen de 32x32 celdas)
// =====================================================================
// Un chunk guarda dos cosas en paralelo:
//   materials  Uint8Array de 32*32: el id del material de cada celda.
//              Es la "verdad" que usan la física, el jugador y la
//              simulación.
//   image      ImageData de 32x32 PÍXELES: un píxel por celda con su
//              color. Se sube a la GPU como textura y el Sprite se
//              escala x8 (CELL_SIZE) con filtro "nearest" -> estilo
//              pixel art sin dibujar 1024 cuadrados por chunk.
//
// Modificar una celda = cambiar materials[i] + el píxel i de la imagen.
// La subida a la GPU se hace una sola vez por frame (flushChunkTexture)
// aunque cambien muchas celdas.
// =====================================================================

import { Sprite, Texture } from 'pixi.js';
import { CHUNK_CELLS, CHUNK_PIXELS, CELL_SIZE, MATERIAL } from './config.js';
import { getMaterial } from './worldGenerator.js';
import { hash } from './noise.js';
import { ELEMENTS, incandescentColor } from '../elements/elements.js';

// '#rrggbb' o '#rrggbbaa' -> [r, g, b, a]
function toRGBA(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
    hex.length >= 9 ? parseInt(hex.slice(7, 9), 16) : 255
  ];
}

// Paleta de cada material sólido, tomada del registro de elementos
const PALETTE = [];
for (const e of ELEMENTS) {
  if (e.state === 'solid' && e.palette) {
    PALETTE[e.id] = e.palette.map(toRGBA);
  }
}

// Color base (sin calor) de una celda. Cada material tiene 4 tonos y
// el hash de la posición elige uno: así la roca tiene textura "ruidosa"
// pero siempre la misma en el mismo lugar.
export function cellColor(material, gx, gy, seed) {
  const palette = PALETTE[material];
  if (!palette) return [0, 0, 0, 0];
  const variation = Math.floor(hash(gx, gy, seed + 943) * palette.length);
  return palette[variation];
}

// Crear un chunk: recorre sus 32x32 celdas, decide el material de cada
// una (modificación guardada o, si no hay, el generador procedural),
// y pinta su píxel. `modifications` es un Map(índice -> material).
export function createChunk(chunkX, chunkY, seed, modifications = null) {
  // Canvas 2D de 32x32 donde se arma la imagen del chunk
  const canvas = document.createElement('canvas');
  canvas.width = CHUNK_CELLS;
  canvas.height = CHUNK_CELLS;
  const ctx = canvas.getContext('2d', { alpha: true });
  const image = ctx.createImageData(CHUNK_CELLS, CHUNK_CELLS);
  const materials = new Uint8Array(CHUNK_CELLS * CHUNK_CELLS);
  for (let y = 0; y < CHUNK_CELLS; y++) {
    for (let x = 0; x < CHUNK_CELLS; x++) {
      // Coordenadas globales de la celda (en celdas, no en píxeles)
      const gx = chunkX * CHUNK_CELLS + x;
      const gy = chunkY * CHUNK_CELLS + y;

      // Índice en los arrays planos (fila por fila)
      const idx = y * CHUNK_CELLS + x;

      // Si el jugador o la simulación cambió esta celda, manda eso
      const modified = modifications?.get(idx);
      const type = modified ?? getMaterial(gx, gy, seed);
      materials[idx] = type;
      if (type === MATERIAL.EMPTY) continue;
      const [r, g, b, a] = cellColor(type, gx, gy, seed);
      image.data[idx * 4] = r;
      image.data[idx * 4 + 1] = g;
      image.data[idx * 4 + 2] = b;
      image.data[idx * 4 + 3] = a;
    }
  }
  ctx.putImageData(image, 0, 0);

  // Textura de PixiJS a partir del canvas. 'nearest' = sin suavizar,
  // cada celda se ve como un cuadrado nítido al escalar.
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';

  // Sprite ubicado en la posición del chunk y escalado x8
  const sprite = new Sprite(texture);
  sprite.position.set(chunkX * CHUNK_PIXELS, chunkY * CHUNK_PIXELS);
  sprite.scale.set(CELL_SIZE);
  sprite.eventMode = 'none'; // no recibe clics (los maneja el canvas)
  return { sprite, texture, materials, canvas, ctx, image, chunkX, chunkY };
}

// Cambiar el material de una celda del chunk (no sube la textura:
// TerrainManager.flushTextures() lo hace una vez por frame)
export function setChunkCell(chunk, localX, localY, material, seed) {
  if (
    localX < 0 || localX >= CHUNK_CELLS ||
    localY < 0 || localY >= CHUNK_CELLS
  ) {
    return false;
  }

  const index = localY * CHUNK_CELLS + localX;

  if (chunk.materials[index] === material) {
    return false;
  }

  chunk.materials[index] = material;

  const gx = chunk.chunkX * CHUNK_CELLS + localX;
  const gy = chunk.chunkY * CHUNK_CELLS + localY;
  const [r, g, b, a] = cellColor(material, gx, gy, seed);

  const pixel = index * 4;
  chunk.image.data[pixel] = r;
  chunk.image.data[pixel + 1] = g;
  chunk.image.data[pixel + 2] = b;
  chunk.image.data[pixel + 3] = a;

  return true;
}

// Teñir una celda según su temperatura (brillo incandescente)
export function tintChunkCell(chunk, localX, localY, temperature, seed) {
  const index = localY * CHUNK_CELLS + localX;
  const material = chunk.materials[index];
  if (material === MATERIAL.EMPTY) return;

  const gx = chunk.chunkX * CHUNK_CELLS + localX;
  const gy = chunk.chunkY * CHUNK_CELLS + localY;
  const [r, g, b, a] = cellColor(material, gx, gy, seed);

  const pixel = index * 4;
  const data = chunk.image.data;

  if (temperature <= 450) {
    data[pixel] = r;
    data[pixel + 1] = g;
    data[pixel + 2] = b;
    data[pixel + 3] = a;
    return;
  }

  const glow = incandescentColor(temperature);
  const f = Math.min(1, (temperature - 450) / 500) * 0.9;

  data[pixel] = Math.round(r + (((glow >> 16) & 255) - r) * f);
  data[pixel + 1] = Math.round(g + (((glow >> 8) & 255) - g) * f);
  data[pixel + 2] = Math.round(b + ((glow & 255) - b) * f);
  data[pixel + 3] = 255;
}

// Copiar la imagen modificada al canvas y avisar a PixiJS que la
// textura cambió (la vuelve a subir a la GPU)
export function flushChunkTexture(chunk) {
  chunk.ctx.putImageData(chunk.image, 0, 0);
  chunk.texture.source.update();
}

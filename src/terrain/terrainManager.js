
import { Container } from 'pixi.js';

import {
  CHUNK_PIXELS,
  CHUNK_CELLS,
  CELL_SIZE,
  MATERIAL
} from './config.js';

import {
  createChunk,
  destroyChunkCell
} from './chunk.js';

import { getMaterial } from './worldGenerator.js';

import {
    createChunkPhysics,
    destroyChunkPhysics
} from './terrainPhysics.js';

export class TerrainManager {
  constructor(seed) {
    this.seed = seed;
    this.container = new Container();

    this.chunks = new Map();

    // Guarda las celdas destruidas por chunk
    this.destroyedChunks = new Map();

    // Chunks cuyas colisiones necesitan actualizarse
    this.physicsDirtyChunks = new Set();
  }

  getCell(cellX, cellY) {
    const chunkX = Math.floor(cellX / CHUNK_CELLS);
    const chunkY = Math.floor(cellY / CHUNK_CELLS);

    const localX = cellX - chunkX * CHUNK_CELLS;
    const localY = cellY - chunkY * CHUNK_CELLS;

    const key = `${chunkX},${chunkY}`;
    const index = localY * CHUNK_CELLS + localX;

    const destroyed = this.destroyedChunks.get(key);

    if (destroyed?.has(index)) {
      return MATERIAL.EMPTY;
    }

    return getMaterial(cellX, cellY, this.seed);
  }

  // Consultar terreno desde coordenadas de píxeles
  getMaterialAt(x, y) {
    const cellX = Math.floor(x / CELL_SIZE);
    const cellY = Math.floor(y / CELL_SIZE);

    return this.getCell(cellX, cellY);
  }

  destroyCell(cellX, cellY) {
    const chunkX = Math.floor(cellX / CHUNK_CELLS);
    const chunkY = Math.floor(cellY / CHUNK_CELLS);

    const localX = cellX - chunkX * CHUNK_CELLS;
    const localY = cellY - chunkY * CHUNK_CELLS;

    const key = `${chunkX},${chunkY}`;

    const index = localY * CHUNK_CELLS + localX;

    if (this.getCell(cellX, cellY) === MATERIAL.EMPTY) {
      return false;
    }

    // Registrar la destrucción permanentemente
    if (!this.destroyedChunks.has(key)) {
      this.destroyedChunks.set(key, new Set());
    }

    this.destroyedChunks.get(key).add(index);

    // Modificar el chunk visible
    const chunk = this.chunks.get(key);

    if (chunk) {
      destroyChunkCell(chunk, localX, localY);
      // Avisar que las colisiones cambiaron
      this.physicsDirtyChunks.add(key);
    }

    return true;
  }

  // Destruir un área circular
  destroyCircle(x, y, radius) {
    const minX = Math.floor((x - radius) / CELL_SIZE);
    const maxX = Math.floor((x + radius) / CELL_SIZE);

    const minY = Math.floor((y - radius) / CELL_SIZE);
    const maxY = Math.floor((y + radius) / CELL_SIZE);

    let destroyed = 0;

    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {

        const centerX = (cx + 0.5) * CELL_SIZE;
        const centerY = (cy + 0.5) * CELL_SIZE;

        const dx = centerX - x;
        const dy = centerY - y;

        if (dx * dx + dy * dy > radius * radius) {
          continue;
        }

        if (this.destroyCell(cx, cy)) {
          destroyed++;
        }
      }
    }

    return destroyed;
  }

  update(centerX, centerY, screenWidth, screenHeight) {
    const margin = 1;

    const left = Math.floor(
      (centerX - screenWidth / 2) / CHUNK_PIXELS
    ) - margin;

    const right = Math.floor(
      (centerX + screenWidth / 2) / CHUNK_PIXELS
    ) + margin;

    const top = Math.floor(
      (centerY - screenHeight / 2) / CHUNK_PIXELS
    ) - margin;

    const bottom = Math.floor(
      (centerY + screenHeight / 2) / CHUNK_PIXELS
    ) + margin;

    const needed = new Set();

    for (let cy = top; cy <= bottom; cy++) {
      for (let cx = left; cx <= right; cx++) {
        const key = `${cx},${cy}`;

        needed.add(key);

        if (!this.chunks.has(key)) {
          const destroyed = this.destroyedChunks.get(key);

          const chunk = createChunk(
            cx,
            cy,
            this.seed,
            destroyed
          );
          // Crear las colisiones del terreno
          chunk.physicsBody = createChunkPhysics( chunk, cx, cy );
          this.chunks.set(key, chunk);
          this.container.addChild(chunk.sprite);
        }
      }
    }

    // Descargar chunks lejanos
    for (const [key, chunk] of this.chunks) {
      if (!needed.has(key)) {

        // Eliminar el cuerpo físico
        destroyChunkPhysics(chunk.physicsBody);
        this.physicsDirtyChunks.delete(key);
        this.container.removeChild(chunk.sprite);

        chunk.sprite.destroy();
        chunk.texture.destroy(true);

        this.chunks.delete(key);
      }
    }
  }



  syncPhysics() {

      // Actualizar solamente chunks modificados
      for (const key of this.physicsDirtyChunks) {

          const chunk = this.chunks.get(key);

          if (!chunk) continue;

          // Eliminar las colisiones anteriores
          destroyChunkPhysics(chunk.physicsBody);

          const [cx, cy] = key.split(',').map(Number);

          // Crear las nuevas colisiones
          chunk.physicsBody = createChunkPhysics(
              chunk,
              cx,
              cy
          );
      }

      this.physicsDirtyChunks.clear();
  }


  // ¿Están cargados todos los chunks de esta zona?
  areChunksLoaded(left, right, top, bottom) {
    const x0 = Math.floor(left / CHUNK_PIXELS);
    const x1 = Math.floor(right / CHUNK_PIXELS);
    const y0 = Math.floor(top / CHUNK_PIXELS);
    const y1 = Math.floor(bottom / CHUNK_PIXELS);

    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!this.chunks.has(`${cx},${cy}`)) return false;
      }
    }

    return true;
  }


  get count() {
    return this.chunks.size;
  }
}

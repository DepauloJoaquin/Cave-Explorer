// =====================================================================
// ★ NÚCLEO DEL TERRENO · TERRAIN MANAGER
// =====================================================================
// Es el "dueño" del terreno. Todo el resto del juego le pregunta o le
// pide cambios a esta clase:
//
//   update()        carga los chunks que la cámara ve (+1 de margen)
//                   y descarga los lejanos. Cada chunk cargado tiene
//                   sprite (imagen) + cuerpo de colisiones (LiquidFun).
//   getCell()       ¿qué material hay en una celda? (cargada o no)
//   setCell()       cambiar el material de una celda (excavar, congelar,
//                   colocar hielo...). Queda guardado para siempre en
//                   this.modified, así al volver a cargar el chunk se ve
//                   igual.
//   syncPhysics()   rehace las colisiones de los chunks modificados.
//   flushTextures() sube a la GPU las imágenes de los chunks modificados.
//   cellTemp        temperatura de las celdas que NO están a 20 °C
//                   (mapa disperso: solo se guardan las "interesantes").
//
// Patrón importante: los cambios se marcan como "sucios" y se aplican
// una vez por frame/paso. Así 100 celdas excavadas en un frame cuestan
// una sola reconstrucción de física y una sola subida de textura.
// =====================================================================

import { Container } from 'pixi.js';

import {
  CHUNK_PIXELS,
  CHUNK_CELLS,
  CELL_SIZE,
  MATERIAL
} from './config.js';

import {
  createChunk,
  setChunkCell,
  tintChunkCell,
  flushChunkTexture
} from './chunk.js';

import { getMaterial } from './worldGenerator.js';

import {
    createChunkPhysics,
    destroyChunkPhysics
} from './terrainPhysics.js';

import { AMBIENT } from '../elements/elements.js';

// Clave numérica de un chunk (evita crear strings en los bucles calientes).
// Desplaza las coordenadas para que sean positivas y las "empaqueta"
// en un solo número: (cx, cy) -> cx * 65536 + cy.
export function chunkId(cx, cy) {
  return (cx + 32768) * 65536 + (cy + 32768);
}

// Clave numérica de una celda global
export function cellKey(cx, cy) {
  return (cx + 1048576) * 2097152 + (cy + 1048576);
}

export function cellFromKey(key) {
  const cx = Math.floor(key / 2097152) - 1048576;
  const cy = key - (cx + 1048576) * 2097152 - 1048576;
  return [cx, cy];
}


class IndexedTemperatureMap extends Map {

    constructor() {
        super();
        this.byChunk = new Map();
    }

    getChunkId(key) {
        const [cellX, cellY] = cellFromKey(key);

        const cx = Math.floor(cellX / CHUNK_CELLS);
        const cy = Math.floor(cellY / CHUNK_CELLS);

        return chunkId(cx, cy);
    }

      set(key, value) {

      // Si la celda ya está indexada, solo actualizar su temperatura
      if (super.has(key)) {
          return super.set(key, value);
      }

      const id = this.getChunkId(key);

      let bucket = this.byChunk.get(id);

      if (!bucket) {
          bucket = new Set();
          this.byChunk.set(id, bucket);
      }

      bucket.add(key);

      return super.set(key, value);
  }

    delete(key) {
        if (!this.has(key)) {
            return false;
        }

        const id = this.getChunkId(key);
        const bucket = this.byChunk.get(id);

        if (bucket) {
            bucket.delete(key);

            if (bucket.size === 0) {
                this.byChunk.delete(id);
            }
        }

        return super.delete(key);
    }

    clear() {
        super.clear();
        this.byChunk.clear();
    }
}


export class TerrainManager {
  constructor(seed) {
    this.seed = seed;
    this.container = new Container();

    this.chunks = new Map();      // "cx,cy" -> chunk
    this.chunkIndex = new Map();  // chunkId -> chunk

    // Celdas modificadas por chunk: "cx,cy" -> Map(index -> material)
    this.modified = new Map();

    // Chunks cuyas colisiones necesitan actualizarse
    this.physicsDirtyChunks = new Set();

    // Chunks cuya textura cambió en este frame
    this.textureDirtyChunks = new Set();

    // Temperatura de las celdas que no están a temperatura ambiente
    this.cellTemp = new IndexedTemperatureMap();   // cellKey -> °C
    this.cellLatent = new Map();  // cellKey -> progreso del cambio de fase (0-1)
    this.glowing = new Set();     // celdas dibujadas incandescentes
  }

  // -------------------------------------------------------------------
  // CONSULTAS
  // -------------------------------------------------------------------

  // Material de una celda global. Busca en este orden:
  //   1. chunk cargado (lo más rápido)
  //   2. modificación guardada de un chunk descargado
  //   3. generador procedural
  getCell(cellX, cellY) {
    // A qué chunk pertenece la celda
    const chunkX = Math.floor(cellX / CHUNK_CELLS);
    const chunkY = Math.floor(cellY / CHUNK_CELLS);

    const chunk = this.chunkIndex.get(chunkId(chunkX, chunkY));

    // Posición dentro del chunk (0..31) e índice en los arrays planos
    const localX = cellX - chunkX * CHUNK_CELLS;
    const localY = cellY - chunkY * CHUNK_CELLS;
    const index = localY * CHUNK_CELLS + localX;

    if (chunk) {
      return chunk.materials[index];
    }

    const modified = this.modified.get(`${chunkX},${chunkY}`)?.get(index);

    if (modified !== undefined) {
      return modified;
    }

    return getMaterial(cellX, cellY, this.seed);
  }

  // Igual que getCell pero devuelve -1 si el chunk no está cargado
  getLoadedCell(cellX, cellY) {
    const chunkX = Math.floor(cellX / CHUNK_CELLS);
    const chunkY = Math.floor(cellY / CHUNK_CELLS);
    const chunk = this.chunkIndex.get(chunkId(chunkX, chunkY));

    if (!chunk) return -1;

    return chunk.materials[
      (cellY - chunkY * CHUNK_CELLS) * CHUNK_CELLS +
      (cellX - chunkX * CHUNK_CELLS)
    ];
  }

  isLoadedAt(x, y) {
    return this.chunkIndex.has(chunkId(
      Math.floor(x / CHUNK_PIXELS),
      Math.floor(y / CHUNK_PIXELS)
    ));
  }

  // Consultar terreno desde coordenadas de píxeles
  getMaterialAt(x, y) {
    const cellX = Math.floor(x / CELL_SIZE);
    const cellY = Math.floor(y / CELL_SIZE);

    return this.getCell(cellX, cellY);
  }

  // -------------------------------------------------------------------
  // TEMPERATURA DE CELDAS
  // -------------------------------------------------------------------

  getCellTemp(cellX, cellY) {
    return this.cellTemp.get(cellKey(cellX, cellY)) ?? AMBIENT;
  }

  setCellTemp(cellX, cellY, temperature) {
    const key = cellKey(cellX, cellY);

    if (Math.abs(temperature - AMBIENT) < 0.5) {
      this.cellTemp.delete(key);
    } else {
      this.cellTemp.set(key, temperature);
    }
  }

  tintCell(cellX, cellY, temperature) {
    const chunkX = Math.floor(cellX / CHUNK_CELLS);
    const chunkY = Math.floor(cellY / CHUNK_CELLS);
    const chunk = this.chunkIndex.get(chunkId(chunkX, chunkY));

    if (!chunk) return;

    tintChunkCell(
      chunk,
      cellX - chunkX * CHUNK_CELLS,
      cellY - chunkY * CHUNK_CELLS,
      temperature,
      this.seed
    );

    this.textureDirtyChunks.add(chunk);
  }

  // -------------------------------------------------------------------
  // MODIFICACIONES
  // -------------------------------------------------------------------

  setCell(cellX, cellY, material) {
    const chunkX = Math.floor(cellX / CHUNK_CELLS);
    const chunkY = Math.floor(cellY / CHUNK_CELLS);

    const localX = cellX - chunkX * CHUNK_CELLS;
    const localY = cellY - chunkY * CHUNK_CELLS;

    const key = `${chunkX},${chunkY}`;
    const index = localY * CHUNK_CELLS + localX;

    if (this.getCell(cellX, cellY) === material) {
      return false;
    }

    // Registrar el cambio permanentemente
    if (!this.modified.has(key)) {
      this.modified.set(key, new Map());
    }

    this.modified.get(key).set(index, material);

    // Una celda nueva empieza sin historial de temperatura
    const ck = cellKey(cellX, cellY);
    this.cellTemp.delete(ck);
    this.cellLatent.delete(ck);
    this.glowing.delete(ck);

    // Modificar el chunk visible
    const chunk = this.chunks.get(key);

    if (chunk) {
      setChunkCell(chunk, localX, localY, material, this.seed);
      this.textureDirtyChunks.add(chunk);
      // Avisar que las colisiones cambiaron
      this.physicsDirtyChunks.add(key);
    }

    return true;
  }

  destroyCell(cellX, cellY) {
    if (this.getCell(cellX, cellY) === MATERIAL.EMPTY) {
      return false;
    }

    return this.setCell(cellX, cellY, MATERIAL.EMPTY);
  }

  // Recorrer las celdas dentro de un círculo
  forEachCellInCircle(x, y, radius, callback) {
    const minX = Math.floor((x - radius) / CELL_SIZE);
    const maxX = Math.floor((x + radius) / CELL_SIZE);

    const minY = Math.floor((y - radius) / CELL_SIZE);
    const maxY = Math.floor((y + radius) / CELL_SIZE);

    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {

        const centerX = (cx + 0.5) * CELL_SIZE;
        const centerY = (cy + 0.5) * CELL_SIZE;

        const dx = centerX - x;
        const dy = centerY - y;

        if (dx * dx + dy * dy > radius * radius) {
          continue;
        }

        callback(cx, cy);
      }
    }
  }

  // Destruir un área circular
  destroyCircle(x, y, radius) {
    let destroyed = 0;

    this.forEachCellInCircle(x, y, radius, (cx, cy) => {
      if (this.destroyCell(cx, cy)) {
        destroyed++;
      }
    });

    return destroyed;
  }

  // Carga/descarga de chunks según la cámara ("streaming" del mundo).
  // Devuelve las claves de los chunks recién creados (main.js las usa
  // para generar las piletas una sola vez).
  update(centerX, centerY, screenWidth, screenHeight) {
    // Chunks extra alrededor de la pantalla, para que nunca se vea
    // aparecer el terreno y las partículas tengan colisiones fuera de vista
    const margin = 1;
    const created = [];

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

    // Chunks que tienen que estar cargados en este frame
    const needed = new Set();

    for (let cy = top; cy <= bottom; cy++) {
      for (let cx = left; cx <= right; cx++) {
        const key = `${cx},${cy}`;

        needed.add(key);

        if (!this.chunks.has(key)) {
          const chunk = createChunk(
            cx,
            cy,
            this.seed,
            this.modified.get(key)
          );
          // Crear las colisiones del terreno
          chunk.physicsBody = createChunkPhysics( chunk, cx, cy );
          this.chunks.set(key, chunk);
          this.chunkIndex.set(chunkId(cx, cy), chunk);
          this.container.addChild(chunk.sprite);
          created.push(key);
        }
      }
    }

    // Descargar chunks lejanos
    for (const [key, chunk] of this.chunks) {
      if (!needed.has(key)) {

        // Eliminar el cuerpo físico
        destroyChunkPhysics(chunk.physicsBody);
        this.physicsDirtyChunks.delete(key);
        this.textureDirtyChunks.delete(chunk);
        this.container.removeChild(chunk.sprite);

        chunk.sprite.destroy();
        chunk.texture.destroy(true);

        this.chunks.delete(key);
        this.chunkIndex.delete(chunkId(chunk.chunkX, chunk.chunkY));
      }
    }

    return created;
  }

  // Subir a la GPU las texturas que cambiaron
  flushTextures() {
    for (const chunk of this.textureDirtyChunks) {
      flushChunkTexture(chunk);
    }

    this.textureDirtyChunks.clear();
  }

  // Se llama antes de cada world.Step() de LiquidFun: rehace las
  // colisiones de los chunks que cambiaron desde el paso anterior.
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


  // ¿Están cargados todos los chunks de esta zona? (en píxeles)
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

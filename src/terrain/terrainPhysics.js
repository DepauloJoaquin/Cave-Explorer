// =====================================================================
// ★ NÚCLEO · PUENTE ENTRE EL TERRENO Y LIQUIDFUN
// =====================================================================
// LiquidFun (Box2D) no sabe nada de celdas: para que las partículas
// choquen con el terreno hay que darle FORMAS. Este archivo convierte
// las celdas sólidas de un chunk en rectángulos estáticos de Box2D.
//
// Optimización "greedy meshing": en vez de crear un cuadrado por
// celda (hasta 1024 por chunk), junta celdas sólidas vecinas en
// rectángulos lo más grandes posible:
//   1. Busca la primera celda sólida no usada.
//   2. La extiende hacia la derecha mientras haya celdas sólidas.
//   3. Extiende esa fila hacia abajo mientras la fila entera sea sólida.
//   4. Marca esas celdas como usadas y crea UN rectángulo.
// Así un chunk lleno de roca se resuelve con pocos rectángulos.
//
// Cuando se excava o se coloca algo, TerrainManager marca el chunk
// como "sucio" y syncPhysics() destruye y recrea su cuerpo.
//
// Unidades: Box2D trabaja en METROS. METER = 100 px por metro.
// =====================================================================

import { Box2D, METER, world } from '../physics/world.js';

import { CELL_SIZE, CHUNK_CELLS, MATERIAL } from './config.js';

// Creamos las colisiones físicas de un chunk
export function createChunkPhysics(chunk, chunkX, chunkY) {

    // Un cuerpo estático (no se mueve) por chunk; cada rectángulo
    // será una "fixture" de ese cuerpo
    const bodyDef = new Box2D.b2BodyDef();
    const body = world.CreateBody(bodyDef);

    const cells = chunk.materials;

    // Celdas ya incluidas en algún rectángulo
    const visited = new Uint8Array(cells.length);

    for (let y = 0; y < CHUNK_CELLS; y++) {
        for (let x = 0; x < CHUNK_CELLS; x++) {

            const index = y * CHUNK_CELLS + x;

            if (
                cells[index] === MATERIAL.EMPTY ||
                visited[index]
            ) {
                continue;
            }

            // Buscar celdas sólidas consecutivas
            let width = 0;

            while (
                x + width < CHUNK_CELLS &&
                cells[y * CHUNK_CELLS + x + width] !== MATERIAL.EMPTY &&
                !visited[y * CHUNK_CELLS + x + width]
            ) {
                width++;
            }

            // Extender el rectángulo hacia abajo
            let height = 1;
            let canExpand = true;

            while (y + height < CHUNK_CELLS && canExpand) {

                for (let dx = 0; dx < width; dx++) {
                    const next =
                        (y + height) * CHUNK_CELLS + x + dx;

                    if (
                        cells[next] === MATERIAL.EMPTY ||
                        visited[next]
                    ) {
                        canExpand = false;
                        break;
                    }
                }

                if (canExpand) height++;
            }

            // Marcar las celdas agrupadas
            for (let dy = 0; dy < height; dy++) {
                for (let dx = 0; dx < width; dx++) {
                    visited[(y + dy) * CHUNK_CELLS + x + dx] = 1;
                }
            }

            const pixelWidth = width * CELL_SIZE;
            const pixelHeight = height * CELL_SIZE;

            // Centro del rectángulo en coordenadas globales
            const centerX =
                (chunkX * CHUNK_CELLS + x) * CELL_SIZE
                + pixelWidth / 2;

            const centerY =
                (chunkY * CHUNK_CELLS + y) * CELL_SIZE
                + pixelHeight / 2;

            const shape = new Box2D.b2PolygonShape();

            // SetAsBox recibe la MITAD del ancho/alto, en metros
            shape.SetAsBox(
                pixelWidth / (2 * METER),
                pixelHeight / (2 * METER),
                new Box2D.b2Vec2(
                    centerX / METER,
                    centerY / METER
                ),
                0
            );

            // Fixture estática: no necesita densidad
            body.CreateFixture(shape, 0);
        }
    }

    return body;
}

// Destruir las colisiones antiguas de un chunk
export function destroyChunkPhysics(body) {
    if (body) {
        world.DestroyBody(body);
    }
}


import { Box2D, METER, world } from '../physics/world.js';

import { CELL_SIZE, CHUNK_CELLS, MATERIAL } from './config.js';

// Creamos las colisiones físicas de un chunk
export function createChunkPhysics(chunk, chunkX, chunkY) {

    const bodyDef = new Box2D.b2BodyDef();
    const body = world.CreateBody(bodyDef);

    const cells = chunk.materials;
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

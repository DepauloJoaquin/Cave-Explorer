// =====================================================================
// VISTA DE DEPURACIÓN · GRILLA DE CELDAS Y CHUNKS
// =====================================================================
// Dibuja sobre el juego la estructura interna del terreno:
//   - Grilla de celdas: una línea cada CELL_SIZE (8 px). Cada cuadrado
//     es una celda = un elemento del array `materials` de su chunk.
//     La celda bajo el mouse se resalta con sus coordenadas.
//   - Chunks: un borde cada CHUNK_PIXELS (256 px) con su nombre "cx,cy".
//     Solo existen los chunks cargados alrededor de la cámara.
//
// Usa su propio <canvas> 2D encima de la iluminación, para que la
// grilla se vea aunque la cueva esté oscura. No recibe clics.
// =====================================================================

import { CELL_SIZE, CHUNK_CELLS, CHUNK_PIXELS } from '../terrain/config.js';

export class GridOverlay {
    constructor(gameContainer) {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');

        this.canvas.style.position = 'absolute';
        this.canvas.style.inset = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '3'; // encima de la iluminación (2)

        gameContainer.appendChild(this.canvas);

        // Qué se dibuja (los botones del panel cambian estos valores)
        this.showCells = false;
        this.showChunks = false;

        this.cleared = true;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        this.width = window.innerWidth;
        this.height = window.innerHeight;

        this.canvas.width = Math.round(this.width * dpr);
        this.canvas.height = Math.round(this.height * dpr);

        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Se llama una vez por frame.
    //   worldLayer: contenedor del mundo (su x/y es el desplazamiento
    //               de la cámara: pantalla = mundo + worldLayer.x/y)
    //   mouse:      [x, y] del mouse en coordenadas del mundo
    //   terrain:    para saber qué chunks están cargados
    draw(worldLayer, mouse, terrain) {
        const ctx = this.ctx;

        if (!this.showCells && !this.showChunks) {
            if (!this.cleared) {
                ctx.clearRect(0, 0, this.width, this.height);
                this.cleared = true;
            }
            return;
        }

        this.cleared = false;
        ctx.clearRect(0, 0, this.width, this.height);

        // Desplazamiento mundo -> pantalla
        const ox = worldLayer.x;
        const oy = worldLayer.y;

        // Rectángulo visible en coordenadas del mundo
        const left = -ox;
        const top = -oy;
        const right = left + this.width;
        const bottom = top + this.height;

        if (this.showCells) {
            this.drawLines(ctx, CELL_SIZE, left, top, right, bottom, ox, oy,
                'rgba(255, 255, 255, 0.16)', 1);

            this.drawHoveredCell(ctx, mouse, ox, oy);
        }

        if (this.showChunks) {
            this.drawLines(ctx, CHUNK_PIXELS, left, top, right, bottom, ox, oy,
                'rgba(255, 196, 61, 0.85)', 2);

            this.drawChunkLabels(ctx, left, top, right, bottom, ox, oy, terrain);
        }
    }

    // Líneas verticales y horizontales cada `step` píxeles del mundo
    drawLines(ctx, step, left, top, right, bottom, ox, oy, color, width) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();

        for (let x = Math.floor(left / step) * step; x <= right; x += step) {
            const sx = Math.round(x + ox) + 0.5;
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, this.height);
        }

        for (let y = Math.floor(top / step) * step; y <= bottom; y += step) {
            const sy = Math.round(y + oy) + 0.5;
            ctx.moveTo(0, sy);
            ctx.lineTo(this.width, sy);
        }

        ctx.stroke();
    }

    // Resaltar la celda bajo el mouse y mostrar cómo se ubica en la grilla
    drawHoveredCell(ctx, mouse, ox, oy) {
        const [mx, my] = mouse;

        // Celda global
        const cellX = Math.floor(mx / CELL_SIZE);
        const cellY = Math.floor(my / CELL_SIZE);

        // Chunk al que pertenece y posición dentro de él
        const chunkX = Math.floor(cellX / CHUNK_CELLS);
        const chunkY = Math.floor(cellY / CHUNK_CELLS);
        const localX = cellX - chunkX * CHUNK_CELLS;
        const localY = cellY - chunkY * CHUNK_CELLS;
        const index = localY * CHUNK_CELLS + localX;

        const sx = cellX * CELL_SIZE + ox;
        const sy = cellY * CELL_SIZE + oy;

        ctx.strokeStyle = '#5cf2ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, sy, CELL_SIZE, CELL_SIZE);

        const text =
            `celda ${cellX},${cellY} · chunk ${chunkX},${chunkY} · ` +
            `local ${localX},${localY} · índice ${index}`;

        this.label(ctx, text, sx + CELL_SIZE + 6, sy - 6, '#5cf2ff');
    }

    // Nombre de cada chunk en su esquina superior izquierda
    drawChunkLabels(ctx, left, top, right, bottom, ox, oy, terrain) {
        const x0 = Math.floor(left / CHUNK_PIXELS);
        const x1 = Math.floor(right / CHUNK_PIXELS);
        const y0 = Math.floor(top / CHUNK_PIXELS);
        const y1 = Math.floor(bottom / CHUNK_PIXELS);

        for (let cy = y0; cy <= y1; cy++) {
            for (let cx = x0; cx <= x1; cx++) {
                const loaded = terrain.chunks.has(`${cx},${cy}`);
                const sx = cx * CHUNK_PIXELS + ox;
                const sy = cy * CHUNK_PIXELS + oy;

                this.label(
                    ctx,
                    `chunk ${cx},${cy}${loaded ? '' : ' (sin cargar)'}`,
                    sx + 6,
                    sy + 16,
                    '#ffc43d'
                );
            }
        }
    }

    // Texto con fondo oscuro para que se lea sobre cualquier cosa
    label(ctx, text, x, y, color) {
        ctx.font = '600 11px Inter, ui-sans-serif, system-ui, sans-serif';
        const width = ctx.measureText(text).width;

        ctx.fillStyle = 'rgba(6, 11, 22, 0.8)';
        ctx.fillRect(x - 4, y - 12, width + 8, 17);

        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
    }
}

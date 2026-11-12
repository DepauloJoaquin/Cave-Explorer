# Cave Explorer — Etapa 1

Prototipo de cuevas procedurales 2D con **JavaScript + HTML + CSS + PixiJS 8**.

## Ejecutar

Requisitos: Node.js 20.19+ o 22.12+.

```bash
npm install
npm run dev
```

Abrir la dirección que indique Vite (normalmente `http://localhost:5173`). No abrir `index.html` directamente: usa imports de npm.

## Controles

- **WASD / flechas:** recorrer el mundo con la cámara.
- **Arrastrar el mouse:** desplazar la cámara.
- **F:** solicitar pantalla completa del navegador (también puedes usar F11).
- **Cambiar seed:** abre `http://localhost:5173/?seed=1234`.

El canvas **ocupa toda la ventana** y se adapta cuando cambias el tamaño.

## Qué incluye esta etapa

- Generación determinista por coordenadas globales (sin cortes entre chunks).
- Terreno pixelado con piedra, piedra profunda, vetas y cristales.
- Galerías horizontales y chimeneas verticales continuas para explorar.
- Carga y descarga de chunks alrededor de la cámara.
- Cámara de exploración y marcador del origen.

## Pendiente (intencionalmente)

- Personaje, movimiento físico, colisiones y destrucción (etapa 2).
- LiquidFun, líquidos y piscinas (etapa 3).
- Iluminación y sombras (etapa 4).
- Guardado de modificaciones al terreno (etapa 5).

El terreno se regenera al descargar un chunk: todavía no se modifican materiales.

### Archivos importantes

- `src/terrain/config.js`: tamaños y materiales.
- `src/terrain/noise.js`: ruido y hash deterministas.
- `src/terrain/worldGenerator.js`: forma de cuevas y túneles.
- `src/terrain/chunk.js`: datos y textura de cada chunk.
- `src/terrain/terrainManager.js`: carga y descarga según cámara.
- `src/core/camera.js`: movimiento y controles.
- `src/main.js`: configuración PixiJS y ciclo principal.

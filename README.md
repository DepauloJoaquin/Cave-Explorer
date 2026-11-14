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

## Elementos, temperatura y herramientas

- **Panel de herramientas** (arriba a la derecha): elegí un elemento o herramienta y usalo con **click derecho** sobre la pantalla (rueda del mouse = tamaño del pincel, `T` = ocultar panel).
- **Temperatura real** por partícula y por bloque, con conducción, calor latente y cambios de fase (agua ↔ hielo ↔ vapor, lava → basalto/obsidiana, rocas que se funden, etc.).
- **Reacciones por contacto** basadas en química real (ácido + caliza → CO2, ácido + hierro → hidrógeno, sal + hielo → agua salada, fuego + CO2 → se apaga, hidrógeno + fuego → explosión...).
- Lista completa de reacciones y cómo generarlas: [`REACCIONES.txt`](REACCIONES.txt).
- Para agregar elementos: `src/elements/elements.js`; reacciones: `src/elements/reactions.js`; herramientas: `src/tools/tools.js`. El panel se arma solo.
- Depuración: en la consola del navegador, `game.simulation.stats()` muestra cantidad y temperatura de cada elemento.

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
- `src/elements/`: registro de elementos y reacciones.
- `src/simulation/simulation.js`: temperatura, cambios de fase y reacciones.
- `src/fluids/particles.js`: partículas de LiquidFun (líquidos, polvos y gases).
- `src/tools/tools.js` y `src/ui/toolPanel.js`: herramientas y su panel.

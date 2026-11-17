// =====================================================================
// MAIN · PUNTO DE ENTRADA Y CICLO DEL JUEGO
// =====================================================================
// Mapa del proyecto (★ = núcleo del trabajo: terreno + LiquidFun):
//
//   ★ src/terrain/config.js         tamaños de celda y chunk
//   ★ src/terrain/noise.js          ruido determinista (hash, fbm)
//   ★ src/terrain/worldGenerator.js qué material hay en cada celda
//   ★ src/terrain/poolGeometry.js   cámaras donde van las piletas
//   ★ src/terrain/chunk.js          datos + imagen de cada chunk
//   ★ src/terrain/terrainManager.js carga/descarga y cambios del terreno
//   ★ src/terrain/terrainPhysics.js celdas -> colisiones de LiquidFun
//   ★ src/physics/world.js          inicializa LiquidFun (Box2D en wasm)
//   ★ src/fluids/particles.js       sistemas de partículas, dibujo y luces
//   ★ src/fluids/poolGenerator.js   llena las cámaras con líquido
//   ★ src/fluids/metaballs.js       efecto visual de líquido continuo
//
//     src/elements/elements.js      lista de elementos y sus propiedades
//     src/elements/reactions.js     reacciones por contacto
//     src/simulation/simulation.js  temperatura, cambios de fase, reacciones
//     src/tools/tools.js            herramientas del click derecho
//     src/ui/toolPanel.js           panel de herramientas
//     src/player/player.js          personaje y sus colisiones
//     src/core/camera.js            cámara
//     src/lighting/lighting.js      oscuridad y luces
//
// Orden de cada frame (ver app.ticker.add más abajo):
//   1. Pasos fijos de física a 60 Hz:
//        terrain.syncPhysics() -> applyGasForces() -> world.Step()
//        y cada 2 pasos simulation.tick() (calor y reacciones).
//   2. updateScene(): jugador, cámara, carga de chunks, piletas.
//   3. Herramienta del click derecho y excavación del click izquierdo.
//   4. Dibujo: texturas del terreno, partículas, pincel y luces.
// =====================================================================

import { Application, Container, Graphics } from 'pixi.js';
import { Camera } from './core/camera.js';
import { TerrainManager } from './terrain/terrainManager.js';
import { Player } from './player/player.js';
import { world } from './physics/world.js';
import { Lighting } from './lighting/lighting.js';

import { Benchmark } from './debug/benchmark.js';
import { GridOverlay } from './debug/gridOverlay.js';

import {
    particleContainer,
    liquidGraphics,
    createFluidPool,
    createWaterPool,
    renderParticles,
    applyGasForces,
    updateStreaming,
    getFluidLights,
    getParticleCount
} from './fluids/particles.js';

import { setupMetaballs } from './fluids/metaballs.js';
import { PoolGenerator } from './fluids/poolGenerator.js';
import { Simulation } from './simulation/simulation.js';
import { ToolPanel } from './ui/toolPanel.js';

// CONFIGURACIÓN DEL MUNDO

const params = new URLSearchParams(window.location.search);

const seed = Number.parseInt(
  params.get('seed') ?? '1739',
  10
) || 1739;

// PIXIJS (motor de dibujo 2D sobre WebGL)

const app = new Application();

await app.init({
  resizeTo: window,
  background: '#080d17',
  antialias: false,
  preference: 'webgl',
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true
});

document.querySelector('#game').appendChild(app.canvas);
const lighting = new Lighting( document.querySelector('#game') );
document.querySelector('#seed-label').textContent = seed;

// CAPAS DEL JUEGO
// worldLayer contiene todo lo que está "en el mundo". La cámara mueve
// este contenedor (no cada objeto) para desplazar la vista.
// Orden de dibujo: terreno -> partículas -> jugador -> pincel.

const worldLayer = new Container();
app.stage.addChild(worldLayer);

// TERRENO

const terrain = new TerrainManager(seed);
worldLayer.addChild(terrain.container);

const poolGenerator = new PoolGenerator(seed);

// SIMULACIÓN DE ELEMENTOS

const simulation = new Simulation(terrain);

// JUGADOR

const player = new Player(0, 0, terrain);

const benchmark = new Benchmark();

// Conectar el profiler
simulation.benchmark = benchmark;

// Capa de partículas
worldLayer.addChild(particleContainer);

// Efecto de Metaballs en los líquidos
setupMetaballs(liquidGraphics);

// Personaje delante del líquido
worldLayer.addChild(player.graphic);

// Indicador del pincel
const brushCursor = new Graphics();
worldLayer.addChild(brushCursor);

// CÁMARA

const camera = new Camera(player.x, player.y);

// INTERFAZ

const coordsEl = document.querySelector('#coordinates');
const chunksEl = document.querySelector('#chunk-count');
const toolPanel = new ToolPanel(document.body);

// Vista de depuración: grilla de celdas (G) y bordes de chunks (C)
const gridOverlay = new GridOverlay(document.querySelector('#game'));

toolPanel.addToggle('Grilla de celdas', 'g', (on) => {
  gridOverlay.showCells = on;
}, '#5cf2ff');

toolPanel.addToggle('Chunks', 'c', (on) => {
  gridOverlay.showChunks = on;
}, '#ffc43d');

let infoInterval = 0;
let streamingInterval = 0;

// Estado del mouse
let digging = false;
let usingTool = false;
let mouseX = 0;
let mouseY = 0;

// GAME LOOP

// Pedir piletas para los chunks recién cargados y crear sus partículas
function generatePools(chunkKeys) {
  for (const key of chunkKeys) {
    const [chunkX, chunkY] = key.split(',').map(Number);

    const pools = poolGenerator.generateForChunk(
        terrain,
        chunkX,
        chunkY
    );

    for (const pool of pools) {
        createFluidPool(pool);
    }
  }
}

// Todo lo que se actualiza una vez por frame (no a paso fijo)
function updateScene(dt) {

  // Actualizar personaje
  player.update(dt);

  // Seguir al jugador suavemente
  const followSpeed = Math.min(1, 8 * dt);

  camera.x += (player.x - camera.x) * followSpeed;
  camera.y += (player.y - camera.y) * followSpeed;

  // Dimensiones de pantalla
  const width = app.screen.width;
  const height = app.screen.height;

  // Generación procedural (las piletas solo en chunks nuevos)
    const created = benchmark.measure('Terreno procedural', () => {
      return terrain.update(
          camera.x,
          camera.y,
          width,
          height
      );
  });

  benchmark.measure('Generacion de piletas', () => { generatePools(created); });

  // Guardar o recuperar partículas fuera de la zona cargada
  streamingInterval += dt;
  if (streamingInterval > 0.25) {
    benchmark.measure('Streaming de fluidos', () => {
        updateStreaming(terrain);
    });

    streamingInterval = 0;
}

  // Desplazamiento visual del mundo
  camera.apply(worldLayer, width, height);

  // Actualizar información
  infoInterval += dt;

  if (infoInterval > 0.12) {
    coordsEl.textContent =
      `X ${Math.round(player.x)} · Y ${Math.round(player.y)}`;

    chunksEl.textContent =
      `${terrain.count} chunks`;

    toolPanel.showProbe(simulation.probe(...mouseWorld()));

    infoInterval = 0;
  }
}

updateScene(0);

// Acceso desde la consola del navegador para depurar
window.game = { simulation, terrain, player, toolPanel };

// PASO FIJO DE FÍSICA
// La física siempre avanza de a 1/60 s, aunque el juego corra a 30 o
// a 144 FPS. El "acumulador" junta el tiempo real transcurrido y se
// ejecutan tantos pasos fijos como entren. Así LiquidFun es estable y
// se comporta igual en cualquier computadora.
const FIXED_DT = 1 / 60;

// Subiteraciones del solver de partículas que LiquidFun recomienda
const particleIterations =
    world.CalculateReasonableParticleIterations(FIXED_DT);

let accumulator = 0;
let stepCount = 0;

let physicsStepsTotal = 0;
let physicsFrames = 0;
let physicsMaxSteps = 0;
let physicsReportTime = performance.now();


let physicsTimeTotal = 0;
let physicsStepTotal = 0;
let physicsReportStart = performance.now();

app.ticker.add((ticker) => {

    // Tiempo del frame
    const dt = Math.min(ticker.deltaMS / 1000, 0.05);

    accumulator += dt;

    let physicsSteps = 0;

    // -------------------------------------
    // FÍSICA A PASO FIJO
    // -------------------------------------

    while (accumulator >= FIXED_DT) {

        physicsSteps++;

        // Reconstrucción de colisiones del terreno
        benchmark.measure('Colisiones del terreno', () => {
            terrain.syncPhysics();
        });

        // Simulación de gases
        benchmark.measure('Fuerzas de gases', () => {
            applyGasForces(FIXED_DT);
        });

       const physicsStart = performance.now();

        benchmark.measure('LiquidFun', () => {
            world.Step(
                FIXED_DT,
                8,
                3,
                particleIterations
            );
        });

        physicsTimeTotal += performance.now() - physicsStart;
        physicsStepTotal++;

        // Temperatura y reacciones a 30 Hz
        stepCount++;

        if (stepCount % 2 === 0) {
            benchmark.measure('Temperatura y reacciones', () => {
                simulation.tick(FIXED_DT * 2);
            });
        }

        accumulator -= FIXED_DT;
    }



    if (performance.now() - physicsReportStart >= 5000) {

    console.table({
    'Pasos promedio por frame':
        physicsFrames > 0
            ? (physicsStepsTotal / physicsFrames).toFixed(2)
            : '0.00',

    'Máximo de pasos por frame': physicsMaxSteps,
    'Frames analizados': physicsFrames,

    'Celdas termicas activas':
        terrain.cellTemp.size,

    'Celdas termicas procesadas':
        simulation.lastThermalCellCount ?? 0,

    'Consultas a vecinos':
        simulation.lastNeighborChecks ?? 0,

    'Celdas termicas omitidas':
        simulation.lastSkippedThermalCells ?? 0,

    // NUEVAS MÉTRICAS
    'Celdas termicas vacias':
        simulation.lastEmptyThermalCells ?? 0,

    'Celdas termicas descargadas':
        simulation.lastUnloadedThermalCells ?? 0
});

    physicsTimeTotal = 0;
    physicsStepTotal = 0;
    physicsReportStart = performance.now();
}




    physicsStepsTotal += physicsSteps;
    physicsFrames++;

    physicsMaxSteps = Math.max(
        physicsMaxSteps,
        physicsSteps
    );

    const now = performance.now();

    if (now - physicsReportTime >= 5000) {

        console.table({
            'Pasos promedio por frame': (
                physicsStepsTotal / physicsFrames
            ).toFixed(2),

            'Máximo de pasos por frame': physicsMaxSteps,

            'Frames analizados': physicsFrames
        });

        physicsStepsTotal = 0;
        physicsFrames = 0;
        physicsMaxSteps = 0;
        physicsReportTime = now;
    }

    // -------------------------------------
    // ACTUALIZACIÓN DEL MUNDO
    // -------------------------------------

    benchmark.measure('Escena y jugador', () => {
        updateScene(dt);
    });

    // Herramientas
    benchmark.measure('Herramientas', () => {
        useTool(dt);
        digTerrain();
    });

    // Actualizar texturas modificadas
    benchmark.measure('Texturas del terreno', () => {
        terrain.flushTextures();
    });

    // Dibujar partículas
    benchmark.measure('Graficos de fluidos', () => {
        renderParticles();
    });

    // Dibujar indicador del pincel
    drawBrush();

    // -------------------------------------
    // ILUMINACIÓN
    // -------------------------------------

    benchmark.measure('Iluminacion', () => {

        const lights = getFluidLights(
            player.x,
            player.y
        );

        lighting.update(
            worldLayer,
            lights,
            player
        );
    });

    // Grilla de celdas y chunks (si están activadas)
    gridOverlay.draw(worldLayer, mouseWorld(), terrain);

    // -------------------------------------
    // REGISTRAR MÉTRICAS
    // -------------------------------------

    // Contar partículas de los sistemas de LiquidFun
    

      benchmark.recordFrame(
      ticker.elapsedMS,
      getParticleCount(),
      terrain.count
    );
});




// -------------------------------------
// MOUSE
// -------------------------------------

const canvas = app.canvas;

canvas.style.setProperty('cursor', 'crosshair', 'important');

// Radio de excavación en píxeles
const DIG_RADIUS = 20;

// Posición del mouse en píxeles de la pantalla del juego
function updateMouse(event) {
  const rect = canvas.getBoundingClientRect();

  mouseX = (event.clientX - rect.left) *
    (app.screen.width / rect.width);

  mouseY = (event.clientY - rect.top) *
    (app.screen.height / rect.height);
}

// Posición del mouse en coordenadas del mundo
function mouseWorld() {
  return [mouseX - worldLayer.x, mouseY - worldLayer.y];
}

// Click izquierdo: excavar
function digTerrain() {
  if (!digging) return;

  const [worldX, worldY] = mouseWorld();

  terrain.destroyCircle(
    worldX,
    worldY,
    DIG_RADIUS
  );
}

// Click derecho: herramienta seleccionada
function applyTool(dt) {
  const [x, y] = mouseWorld();

  toolPanel.active.apply({
    x,
    y,
    radius: toolPanel.radius,
    dt,
    sim: simulation,
    terrain
  });
}

function useTool(dt) {
  if (!usingTool || toolPanel.active.once) return;
  applyTool(dt);
}

// Círculo que muestra el área del pincel, del color de la herramienta
function drawBrush() {
  const [x, y] = mouseWorld();
  const color = Number.parseInt(toolPanel.active.color.slice(1), 16);

  brushCursor.clear()
    .circle(x, y, toolPanel.radius)
    .stroke({ width: 1.5, color, alpha: usingTool ? 0.9 : 0.45 });
}

// Evitar el menú del navegador al hacer click derecho
canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

canvas.addEventListener('pointerdown', (event) => {
  updateMouse(event);

  if (event.button === 0) {
    digging = true;
    digTerrain();
  } else if (event.button === 2) {
    usingTool = true;
    // Un click corto también hace efecto
    applyTool(toolPanel.active.once ? 0 : 1 / 15);
  } else {
    return;
  }

  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
  updateMouse(event);

  // Botones que se sueltan o se agregan mientras otro sigue apretado
  if (!(event.buttons & 1)) digging = false;
  if (!(event.buttons & 2)) usingTool = false;
  if ((event.buttons & 2) && !usingTool && canvas.hasPointerCapture(event.pointerId)) {
    usingTool = true;
  }
});

window.addEventListener('pointerup', (event) => {
  if (!(event.buttons & 1)) digging = false;
  if (!(event.buttons & 2)) usingTool = false;
});

window.addEventListener('blur', () => {
  digging = false;
  usingTool = false;
});

// Rueda del mouse: tamaño del pincel
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  toolPanel.changeRadius(event.deltaY < 0 ? 4 : -4);
}, { passive: false });


// -------------------------------------
// PRUEBA DE AGUA
// -------------------------------------

window.addEventListener('keydown', (event) => {

    if (event.key.toLowerCase() === 'p' && !event.repeat) {

        createWaterPool(
            player.x - 75,
            player.y - 150
        );
    }

});

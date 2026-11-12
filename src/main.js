import { Application, Container } from 'pixi.js';
import { Camera } from './core/camera.js';
import { TerrainManager } from './terrain/terrainManager.js';
import { Player } from './player/player.js';
import { Box2D, world } from './physics/world.js';
import { Lighting } from './lighting/lighting.js';

import {
    fluidContainer,
    fluidGraphics,
    createFluidPool,
    createWaterPool,
    updateFluidGraphics,
    updateFluidStreaming,
    getFluidLights
} from './fluids/fluids.js';

import {
    setupMetaballs
} from './fluids/metaballs.js';

import {
    PoolGenerator
} from './fluids/poolGenerator.js';

// CONFIGURACIÓN DEL MUNDO

const params = new URLSearchParams(window.location.search);

const seed = Number.parseInt(
  params.get('seed') ?? '1739',
  10
) || 1739;

// PIXIJS

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

const worldLayer = new Container();
app.stage.addChild(worldLayer);

// TERRENO

const terrain = new TerrainManager(seed);
worldLayer.addChild(terrain.container);

const poolGenerator = new PoolGenerator(seed);

// JUGADOR

const player = new Player(0, 0, terrain);

// Capa de partículas
worldLayer.addChild(fluidContainer);

// Efecto de Metaballs
setupMetaballs(fluidGraphics);

// Personaje delante del líquido
worldLayer.addChild(player.graphic);

// CÁMARA

const camera = new Camera(player.x, player.y);

// INTERFAZ

const coordsEl = document.querySelector('#coordinates');
const chunksEl = document.querySelector('#chunk-count');

let infoInterval = 0;

// GAME LOOP


console.log('LiquidFun inicializado correctamente');
console.log('Mundo físico:', world);

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

  // Generación procedural
  terrain.update(
    camera.x,
    camera.y,
    width,
    height
  );



  for (const key of terrain.chunks.keys()) {

    

    const [chunkX, chunkY] = key.split(',').map(Number);

    const pools = poolGenerator.generateForChunk(
        terrain,
        chunkX,
        chunkY
    );

    for (const pool of pools) {
       // Crear las partículas físicas del depósito
        const created = createFluidPool(pool);
        console.log( `Depósito ${pool.type}: ${created} partículas`);
    }
}
  // Dormir o despertar piletas según los chunks cargados
  updateFluidStreaming(terrain);


  // Desplazamiento visual del mundo
  camera.apply(worldLayer, width, height);

  // Actualizar información
  infoInterval += dt;

  if (infoInterval > 0.12) {
    coordsEl.textContent =
      `X ${Math.round(player.x)} · Y ${Math.round(player.y)}`;

    chunksEl.textContent =
      `${terrain.count} chunks`;

    infoInterval = 0;
  }
}

updateScene(0);

const FIXED_DT = 1 / 60;

const particleIterations =
    world.CalculateReasonableParticleIterations(FIXED_DT);

let accumulator = 0;

app.ticker.add((ticker) => {

    const dt = Math.min(ticker.deltaMS / 1000, 0.05);

    accumulator += dt;

    // Física de LiquidFun
    while (accumulator >= FIXED_DT) {
        terrain.syncPhysics();

        world.Step(
            FIXED_DT,
            8,
            3,
            particleIterations
        );

        accumulator -= FIXED_DT;
    }

    // Actualización visual y del personaje
    updateScene(dt);
    updateFluidGraphics();
    const lights = getFluidLights( player.x, player.y );

    lighting.update( worldLayer, lights, player );
});



// -------------------------------------
// DESTRUCCIÓN DEL TERRENO
// -------------------------------------

const canvas = app.canvas;

canvas.style.setProperty('cursor', 'crosshair', 'important');

let digging = false;

let mouseX = 0;
let mouseY = 0;

// Radio de excavación en píxeles
const DIG_RADIUS = 20;

// Distancia máxima desde el personaje
const DIG_RANGE = 110;

function updateMouse(event) {
  const rect = canvas.getBoundingClientRect();

  mouseX = (event.clientX - rect.left) *
    (app.screen.width / rect.width);

  mouseY = (event.clientY - rect.top) *
    (app.screen.height / rect.height);
}


function digTerrain() {
  if (!digging) return;

  // Convertir la posición del mouse a coordenadas del mundo
  const worldX = mouseX - worldLayer.x;
  const worldY = mouseY - worldLayer.y;

  // Destruir terreno sin límite de distancia
  terrain.destroyCircle(
    worldX,
    worldY,
    DIG_RADIUS
  );
}


canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;

  updateMouse(event);
  digging = true;

  canvas.setPointerCapture(event.pointerId);

  digTerrain();
});

canvas.addEventListener('pointermove', (event) => {
  updateMouse(event);
});

window.addEventListener('pointerup', () => {
  digging = false;
});

window.addEventListener('blur', () => {
  digging = false;
});

// Excavar continuamente al mantener el clic
app.ticker.add(() => {
  digTerrain();
});


// -------------------------------------
// PRUEBA DE AGUA
// -------------------------------------

window.addEventListener('keydown', (event) => {

    if (event.key.toLowerCase() === 'p' && !event.repeat) {

        createWaterPool(
            player.x - 75,
            player.y - 150
        );

        console.log('Pileta de agua generada');
    }

});
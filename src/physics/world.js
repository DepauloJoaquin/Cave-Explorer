// =====================================================================
// ★ NÚCLEO LIQUIDFUN · MUNDO FÍSICO
// =====================================================================
// LiquidFun es Box2D (motor de física 2D de cuerpos rígidos) + un
// sistema de PARTÍCULAS para simular fluidos. Está escrito en C++ y
// lo usamos compilado a WebAssembly (paquete liquidfun-wasm).
//
// Cosas importantes para entender el resto del código:
//   - Box2D trabaja en METROS, no en píxeles. METER = 100 significa
//     que 1 metro = 100 píxeles. Por eso en todos lados se divide o
//     multiplica por METER al pasar datos entre PixiJS y LiquidFun.
//   - Los datos de las partículas viven en la memoria de WebAssembly.
//     Se leen directo con Box2D.HEAPF32 (floats) y Box2D.HEAPU8
//     (bytes) en vez de pedir partícula por partícula: es mucho más
//     rápido.
//   - world.Step() avanza la simulación; se llama desde main.js a
//     60 pasos por segundo fijos.
//
// Este archivo usa "top-level await": el resto del juego no arranca
// hasta que el .wasm terminó de cargar.
// =====================================================================

import Box2DFactory from 'liquidfun-wasm';
import wasmUrl from 'liquidfun-wasm/dist/es/Box2D.wasm?url';

// Inicializamos LiquidFun. locateFile le dice dónde está el .wasm
// (Vite le da una URL propia al importarlo con ?url).
const Box2D = await Box2DFactory({
    locateFile: (path) => {
        if (path.endsWith('.wasm')) {
            return wasmUrl;
        }

        return path;
    }
});

// Escala entre píxeles y metros
const METER = 100;

// Gravedad vertical: 10 m/s² hacia abajo (en Box2D y+ es hacia abajo
// porque usamos las mismas coordenadas que la pantalla)
const gravity = new Box2D.b2Vec2(0, 10);

// Creamos el mundo físico. Contiene:
//   - los cuerpos estáticos del terreno (terrainPhysics.js)
//   - los sistemas de partículas (fluids/particles.js)
const world = new Box2D.b2World(gravity);

export {
    Box2D,
    METER,
    world
};

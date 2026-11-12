
import Box2DFactory from 'liquidfun-wasm';
import wasmUrl from 'liquidfun-wasm/dist/es/Box2D.wasm?url';

// Inicializamos LiquidFun
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

// Gravedad vertical
const gravity = new Box2D.b2Vec2(0, 10);

// Creamos el mundo físico
const world = new Box2D.b2World(gravity);

console.log('LiquidFun inicializado correctamente');

export {
    Box2D,
    METER,
    world
};

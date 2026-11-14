// =====================================================================
// ★ NÚCLEO LIQUIDFUN · EFECTO METABALLS (que las partículas se vean líquido)
// =====================================================================
// Las partículas se dibujan como círculos sueltos. Para que parezcan
// un líquido continuo se aplican dos filtros (shaders) al Graphics de
// cada líquido:
//   1. BlurFilter: desenfoca los círculos -> los cercanos se mezclan
//      en una mancha con bordes difusos.
//   2. metaball.frag: un umbral sobre la transparencia. Donde la
//      mancha es suficientemente opaca se pinta sólido; donde no,
//      transparente. Resultado: bordes nítidos y "gotas" que se unen
//      y se separan como un fluido real.
// =====================================================================

import {
    Filter,
    BlurFilter
} from 'pixi.js';

// Código GLSL del shader de umbral (archivo metaball.frag)
import fragmentShader from './metaball.frag?raw';

// Vertex shader estándar para filtros de PixiJS v8 (solo ubica el
// rectángulo del filtro en pantalla; no hay que tocarlo)
const vertexShader = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void)
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;

    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;

    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void)
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

// Recibe una lista (o un objeto) de Graphics y les pone los dos filtros
function setupMetaballs(fluidGraphics) {

    for (const graphics of Object.values(fluidGraphics)) {

        // Paso 1: desenfoque (más strength = gotas más "pegajosas")
        const blurFilter = new BlurFilter({
            strength: 6,
            quality: 3
        });

        // Paso 2: umbral. uThreshold = cuánta opacidad hace falta para
        // considerar que "hay líquido" (más alto = gotas más chicas)
        const metaballFilter = Filter.from({
            gl: {
                vertex: vertexShader,
                fragment: fragmentShader
            },

            resources: {
                metaballUniforms: {
                    uThreshold: {
                        value: 0.45,
                        type: 'f32'
                    }
                }
            }
        });

        // Margen extra para que el desenfoque no se corte en los bordes
        metaballFilter.padding = 16;

        graphics.filters = [
            blurFilter,
            metaballFilter
        ];
    }
}

export { setupMetaballs };

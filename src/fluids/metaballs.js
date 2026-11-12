import {
    Filter,
    BlurFilter
} from 'pixi.js';

import fragmentShader from './metaball.frag?raw';

// Vertex shader estándar para filtros de PixiJS v8
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

function setupMetaballs(fluidGraphics) {

    for (const graphics of Object.values(fluidGraphics)) {

        const blurFilter = new BlurFilter({
            strength: 6,
            quality: 3
        });

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

        metaballFilter.padding = 16;

        graphics.filters = [
            blurFilter,
            metaballFilter
        ];
    }
}

export { setupMetaballs };
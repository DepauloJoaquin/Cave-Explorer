// Shader de umbral para el efecto metaballs (ver metaballs.js).
// Se ejecuta en la GPU una vez por cada píxel del líquido desenfocado.

// Coordenada del píxel dentro de la textura
in vec2 vTextureCoord;

// Imagen ya desenfocada por el BlurFilter
uniform sampler2D uTexture;

// Opacidad mínima para considerar que "hay líquido"
uniform float uThreshold;

out vec4 finalColor;

void main(void) {

    vec4 sampleColor = texture(
        uTexture,
        vTextureCoord
    );

    // 0 por debajo del umbral, 1 por encima, con una transición
    // suave de ±0.08 para que el borde no se vea serruchado
    float alpha = smoothstep(
        uThreshold - 0.08,
        uThreshold + 0.08,
        sampleColor.a
    );

    // Recuperar el color original (PixiJS guarda el color
    // multiplicado por su opacidad: "alfa premultiplicado")
    vec3 color = sampleColor.a > 0.001
        ? sampleColor.rgb / sampleColor.a
        : vec3(0.0);

    // Salida con alfa premultiplicado
    finalColor = vec4(
        color * alpha,
        alpha
    );
}

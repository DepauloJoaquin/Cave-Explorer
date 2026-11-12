
in vec2 vTextureCoord;

uniform sampler2D uTexture;
uniform float uThreshold;

out vec4 finalColor;

void main(void) {

    vec4 sampleColor = texture(
        uTexture,
        vTextureCoord
    );

    float alpha = smoothstep(
        uThreshold - 0.08,
        uThreshold + 0.08,
        sampleColor.a
    );

    // Recuperar el color original
    vec3 color = sampleColor.a > 0.001
        ? sampleColor.rgb / sampleColor.a
        : vec3(0.0);

    // Salida con alfa premultiplicado
    finalColor = vec4(
        color * alpha,
        alpha
    );
}

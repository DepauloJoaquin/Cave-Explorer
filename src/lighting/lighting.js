
export class Lighting {
    constructor(gameContainer) {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');

        // La iluminación no recibe clics del mouse
        this.canvas.style.position = 'absolute';
        this.canvas.style.inset = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '2';

        gameContainer.style.position = 'relative';
        gameContainer.appendChild(this.canvas);

        // Oscuridad ambiental: de 0 a 1
        this.darkness = 0.82;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();

        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        this.width = rect.width || window.innerWidth;
        this.height = rect.height || window.innerHeight;

        this.canvas.width = Math.round(this.width * dpr);
        this.canvas.height = Math.round(this.height * dpr);

        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    drawLight(x, y, radius, color, intensity) {
        const ctx = this.ctx;

        // Abrir una zona iluminada sobre la oscuridad
        const mask = ctx.createRadialGradient(
            x, y, 0,
            x, y, radius
        );

        const power = Math.min(1, Math.max(0, intensity));

        mask.addColorStop(0, `rgba(0,0,0,${power})`);
        mask.addColorStop(0.35, `rgba(0,0,0,${power * 0.85})`);
        mask.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = mask;
        ctx.fillRect(
            x - radius,
            y - radius,
            radius * 2,
            radius * 2
        );

        // Agregar un brillo del color del líquido
        ctx.globalCompositeOperation = 'source-over';

        const rgb = {
            r: (color >> 16) & 255,
            g: (color >> 8) & 255,
            b: color & 255
        };

        const glow = ctx.createRadialGradient(
            x, y, 0,
            x, y, radius
        );

        glow.addColorStop(
            0,
            `rgba(${rgb.r},${rgb.g},${rgb.b},${power * 0.16})`
        );

        glow.addColorStop(
            1,
            `rgba(${rgb.r},${rgb.g},${rgb.b},0)`
        );

        ctx.fillStyle = glow;
        ctx.fillRect(
            x - radius,
            y - radius,
            radius * 2,
            radius * 2
        );
    }

    update(worldLayer, lights, player) {
        const ctx = this.ctx;

        ctx.clearRect(0, 0, this.width, this.height);

        // Oscurecer toda la escena
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(3,7,16,${this.darkness})`;
        ctx.fillRect(0, 0, this.width, this.height);

        // Luz suave alrededor del personaje
        this.drawLight(
            player.x + worldLayer.x,
            player.y + worldLayer.y,
            110,
            0xffe4ab,
            0.9
        );

        // Dibujar luces de líquidos
        for (const light of lights) {
            this.drawLight(
                light.x + worldLayer.x,
                light.y + worldLayer.y,
                light.radius,
                light.color,
                light.intensity
            );
        }

        ctx.globalCompositeOperation = 'source-over';
    }
}


import './benchmark.css';

export class Benchmark {
    constructor() {
        this.samples = [];
        this.maxSamples = 600;

        this.sections = {};
        this.currentSections = {};

        this.particles = 0;
        this.chunks = 0;

        this.visible = false;
        this.lastRefresh = 0;

        this.createUI();
        this.setupControls();
    }

    createUI() {
        this.fpsCounter = document.createElement('div');
        this.fpsCounter.id = 'fps-counter';
        document.body.appendChild(this.fpsCounter);

        this.panel = document.createElement('section');
        this.panel.id = 'benchmark-panel';
        this.panel.className = 'benchmark-hidden';

        this.panel.innerHTML = `
            <header>
                <h2>Performance Monitor</h2>
                <button id="benchmark-close">✕</button>
            </header>

            <div class="benchmark-stats">
                <div>FPS actual <strong id="bm-fps">--</strong></div>
                <div>FPS promedio <strong id="bm-avg">--</strong></div>
                <div>Frame medio <strong id="bm-frame">--</strong></div>
                <div>Frame P95 <strong id="bm-p95">--</strong></div>
                <div>Partículas <strong id="bm-particles">0</strong></div>
                <div>Chunks <strong id="bm-chunks">0</strong></div>
            </div>

            <h3>Tiempo por subsistema</h3>
            <div id="benchmark-sections"></div>

            <footer>
                <button id="benchmark-reset">Reiniciar</button>
                <button id="benchmark-export">Exportar JSON</button>
            </footer>

            <small>F10: mostrar / ocultar</small>
        `;

        document.body.appendChild(this.panel);

        this.panel.querySelector('#benchmark-close')
            .addEventListener('click', () => this.toggle());

        this.panel.querySelector('#benchmark-reset')
            .addEventListener('click', () => this.reset());

        this.panel.querySelector('#benchmark-export')
            .addEventListener('click', () => this.exportJSON());
    }

    setupControls() {
        window.addEventListener('keydown', (event) => {
            if (event.code === 'F10') {
                event.preventDefault();
                this.toggle();
            }
        });
    }

    toggle() {
        this.visible = !this.visible;

        this.panel.classList.toggle(
            'benchmark-hidden',
            !this.visible
        );

        if (this.visible) this.refresh();
    }

    // Medir el tiempo de una función
    measure(name, callback) {
        const start = performance.now();

        try {
            return callback();
        } finally {
            const duration = performance.now() - start;

            this.currentSections[name] =
                (this.currentSections[name] || 0) + duration;
        }
    }

    // Registrar un frame completo
    recordFrame(frameMS, particles, chunks) {
        if (!Number.isFinite(frameMS) || frameMS <= 0) {
            return;
        }

        this.particles = particles;
        this.chunks = chunks;

        this.samples.push({
            frameMS,
            sections: { ...this.currentSections }
        });

        if (this.samples.length > this.maxSamples) {
            this.samples.shift();
        }

        this.currentSections = {};

        const now = performance.now();

        if (now - this.lastRefresh >= 300) {
            this.refresh();
            this.lastRefresh = now;
        }
    }

    calculateStats() {
        if (this.samples.length === 0) return null;

        const frames = this.samples
            .map(sample => sample.frameMS)
            .sort((a, b) => a - b);

        const average = frames.reduce(
            (sum, value) => sum + value, 0
        ) / frames.length;

        const p95Index = Math.min(
            frames.length - 1,
            Math.ceil(frames.length * 0.95) - 1
        );

        const sections = {};

        for (const sample of this.samples) {
            for (const [name, value] of
                Object.entries(sample.sections)) {

                sections[name] =
                    (sections[name] || 0) + value;
            }
        }

        for (const name in sections) {
            sections[name] /= this.samples.length;
        }

        return {
            averageFPS: 1000 / average,
            averageFrameMS: average,
            p95FrameMS: frames[p95Index],
            sections
        };
    }

    refresh() {
        const stats = this.calculateStats();
        if (!stats) return;

        const latest = this.samples.at(-1);
        const fps = 1000 / latest.frameMS;

        this.fpsCounter.textContent =
            `${fps.toFixed(0)} FPS · ${latest.frameMS.toFixed(1)} ms`;

        this.fpsCounter.className =
            fps >= 55 ? 'fps-good' :
            fps >= 30 ? 'fps-medium' : 'fps-bad';

        if (!this.visible) return;

        const set = (id, value) => {
            this.panel.querySelector(id).textContent = value;
        };

        set('#bm-fps', fps.toFixed(1));
        set('#bm-avg', stats.averageFPS.toFixed(1));
        set('#bm-frame', stats.averageFrameMS.toFixed(2) + ' ms');
        set('#bm-p95', stats.p95FrameMS.toFixed(2) + ' ms');
        set('#bm-particles', this.particles.toLocaleString());
        set('#bm-chunks', this.chunks.toLocaleString());

        const container =
            this.panel.querySelector('#benchmark-sections');

        container.replaceChildren();

        for (const [name, duration] of
            Object.entries(stats.sections)) {

            const row = document.createElement('div');
            row.className = 'benchmark-section';

            const label = document.createElement('span');
            label.textContent = name;

            const value = document.createElement('strong');
            value.textContent = duration.toFixed(2) + ' ms';

            row.append(label, value);
            container.appendChild(row);
        }
    }

    reset() {
        this.samples = [];
        this.currentSections = {};
        this.lastRefresh = 0;
        this.refresh();
    }

    exportJSON() {
        const report = {
            timestamp: new Date().toISOString(),
            seed: new URLSearchParams(location.search).get('seed'),
            screen: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            particles: this.particles,
            chunks: this.chunks,
            stats: this.calculateStats(),
            samples: this.samples
        };

        const blob = new Blob(
            [JSON.stringify(report, null, 2)],
            { type: 'application/json' }
        );

        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'benchmark-cave-explorer.json';
        link.click();

        URL.revokeObjectURL(url);
    }
}

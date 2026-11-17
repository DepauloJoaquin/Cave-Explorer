// Panel de herramientas (arriba a la derecha). Se construye solo a
// partir de TOOLS y TOOL_GROUPS, así que no hay que tocarlo para sumar
// herramientas o elementos nuevos.

import { TOOLS, TOOL_GROUPS } from '../tools/tools.js';

export class ToolPanel {
    constructor(root) {
        this.active = TOOLS.find((t) => t.id === 'element:water') ?? TOOLS[0];
        this.radius = 24;
        this.buttons = new Map();

        const panel = document.createElement('aside');
        panel.className = 'tool-panel';
        panel.innerHTML = `
            <header class="tool-header">
                <b>HERRAMIENTAS</b>
                <button class="tool-collapse" type="button" title="Mostrar u ocultar (T)">–</button>
            </header>
            <div class="tool-body">
                <div class="tool-active">
                    <span class="tool-swatch"></span>
                    <div><b class="tool-active-name"></b><small class="tool-active-desc"></small></div>
                </div>
                <label class="tool-brush">
                    <span>Pincel</span>
                    <input type="range" min="8" max="96" step="2" value="${this.radius}">
                    <output>${this.radius}px</output>
                </label>
                <div class="tool-groups"></div>
                <div class="tool-probe"><span class="probe-label">Bajo el cursor</span><b class="probe-value">—</b></div>
                <p class="tool-hint">Click derecho: usar · Rueda: tamaño · T: ocultar</p>
            </div>
        `;

        root.appendChild(panel);
        this.panel = panel;

        const groups = panel.querySelector('.tool-groups');

        for (const group of TOOL_GROUPS) {
            const tools = TOOLS.filter((t) => t.group === group.id);
            if (tools.length === 0) continue;

            const section = document.createElement('section');
            section.innerHTML = `<h3>${group.name}</h3><div class="tool-grid"></div>`;
            const grid = section.querySelector('.tool-grid');

            for (const tool of tools) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'tool-button';
                button.title = tool.description ?? tool.name;
                button.style.setProperty('--tool-color', tool.color);
                button.innerHTML = `<span class="tool-dot">${tool.icon ?? ''}</span><span>${tool.name}</span>`;
                button.addEventListener('click', () => this.select(tool));
                grid.appendChild(button);
                this.buttons.set(tool.id, button);
            }

            groups.appendChild(section);
        }

        const range = panel.querySelector('input[type=range]');
        const output = panel.querySelector('output');
        range.addEventListener('input', () => {
            this.radius = Number(range.value);
            output.textContent = `${this.radius}px`;
        });
        this.range = range;
        this.output = output;

        panel.querySelector('.tool-collapse').addEventListener('click', () => this.toggle());

        window.addEventListener('keydown', (event) => {
            if (event.key.toLowerCase() === 't' && !event.repeat) this.toggle();
        });

        this.probeValue = panel.querySelector('.probe-value');
        this.select(this.active);
    }

    // Agregar un botón de encendido/apagado en la sección "Vista".
    // Sirve para cualquier opción de depuración futura.
    //   label     texto del botón
    //   key       tecla de atajo (ej: 'g')
    //   onChange  función que recibe true/false
    addToggle(label, key, onChange, color = '#5cf2ff') {
        if (!this.viewGrid) {
            const section = document.createElement('section');
            section.innerHTML = '<h3>Vista</h3><div class="tool-grid"></div>';
            this.viewGrid = section.querySelector('.tool-grid');

            // La sección va primera, arriba de las herramientas
            const groups = this.panel.querySelector('.tool-groups');
            groups.prepend(section);
        }

        let enabled = false;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tool-button';
        button.title = `${label} (tecla ${key.toUpperCase()})`;
        button.style.setProperty('--tool-color', color);
        button.innerHTML =
            `<span class="tool-dot">${key.toUpperCase()}</span><span>${label}</span>`;

        const set = (value) => {
            enabled = value;
            button.classList.toggle('active', enabled);
            onChange(enabled);
        };

        button.addEventListener('click', () => set(!enabled));

        window.addEventListener('keydown', (event) => {
            if (event.key.toLowerCase() === key && !event.repeat) set(!enabled);
        });

        this.viewGrid.appendChild(button);
    }

    toggle() {
        this.panel.classList.toggle('collapsed');
        this.panel.querySelector('.tool-collapse').textContent =
            this.panel.classList.contains('collapsed') ? '+' : '–';
    }

    select(tool) {
        this.active = tool;

        for (const [id, button] of this.buttons) {
            button.classList.toggle('active', id === tool.id);
        }

        this.panel.querySelector('.tool-swatch').style.background = tool.color;
        this.panel.querySelector('.tool-active-name').textContent = tool.name;
        this.panel.querySelector('.tool-active-desc').textContent = tool.description ?? '';
    }

    changeRadius(delta) {
        this.radius = Math.max(8, Math.min(96, this.radius + delta));
        this.range.value = this.radius;
        this.output.textContent = `${this.radius}px`;
    }

    showProbe(result) {
        const name = result.element ? result.element.name : 'Aire';
        this.probeValue.textContent = `${name} · ${Math.round(result.temp)} °C`;
    }
}

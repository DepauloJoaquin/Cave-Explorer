// =====================================================================
// REGISTRO DE HERRAMIENTAS
// =====================================================================
// Todo lo que aparece en el panel de herramientas sale de esta lista.
//
// AGREGAR UNA HERRAMIENTA NUEVA:
//
//   registerTool({
//     id: 'mi-tool',          // único
//     name: 'Mi herramienta',
//     group: 'tools',         // grupo del panel (ver TOOL_GROUPS)
//     color: '#ff00ff',       // color del botón y del pincel
//     icon: '★',              // símbolo opcional
//     description: 'Qué hace',
//     once: false,            // true = se aplica una vez por click
//     apply({ x, y, radius, dt, sim, terrain }) { ... }
//   });
//
// Los ELEMENTOS se agregan solos: cada elemento de elements.js crea
// automáticamente su herramienta para colocarlo con el click derecho.
// =====================================================================

import { ELEMENTS } from '../elements/elements.js';

export const TOOL_GROUPS = [
    { id: 'tools', name: 'Herramientas' },
    { id: 'liquid', name: 'Líquidos' },
    { id: 'powder', name: 'Polvos' },
    { id: 'gas', name: 'Gases' },
    { id: 'solid', name: 'Sólidos' }
];

export const TOOLS = [];

export function registerTool(tool) {
    if (TOOLS.some((t) => t.id === tool.id)) {
        throw new Error(`Herramienta repetida: ${tool.id}`);
    }
    TOOLS.push(tool);
    return tool;
}

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

// -------------------------------------
// HERRAMIENTAS GENERALES
// -------------------------------------

registerTool({
    id: 'heat',
    name: 'Calor',
    group: 'tools',
    color: '#ff6a2b',
    icon: '▲',
    description: 'Sube la temperatura (+900 °C/s) de todo lo que esté bajo el pincel',
    apply({ x, y, radius, dt, sim }) {
        sim.heatArea(x, y, radius, 900 * dt);
    }
});

registerTool({
    id: 'cold',
    name: 'Frío',
    group: 'tools',
    color: '#5cc8ff',
    icon: '▼',
    description: 'Baja la temperatura (-400 °C/s, mínimo -273 °C)',
    apply({ x, y, radius, dt, sim }) {
        sim.heatArea(x, y, radius, -400 * dt);
    }
});

registerTool({
    id: 'erase',
    name: 'Borrar',
    group: 'tools',
    color: '#e05d6f',
    icon: '✕',
    description: 'Elimina partículas y terreno bajo el pincel',
    apply({ x, y, radius, sim }) {
        sim.eraseBrush(x, y, radius);
    }
});

registerTool({
    id: 'explosion',
    name: 'Explosión',
    group: 'tools',
    color: '#ffc23d',
    icon: '✸',
    once: true,
    description: 'Una explosión por click: rompe terreno, empuja y calienta',
    apply({ x, y, radius, sim }) {
        sim.explode(x, y, Math.max(0.6, radius / 28));
    }
});

// -------------------------------------
// UNA HERRAMIENTA POR ELEMENTO (automático)
// -------------------------------------

for (const element of ELEMENTS) {
    if (!element.placeable) continue;

    const isSolid = element.state === 'solid';
    const color = isSolid ? element.palette[1].slice(0, 7) : hex(element.color);

    registerTool({
        id: `element:${element.key}`,
        name: element.name,
        group: element.state,
        color,
        element,
        description: isSolid
            ? `Coloca ${element.name.toLowerCase()} (${element.temp} °C)`
            : `Genera ${element.name.toLowerCase()} a ${element.temp} °C`,
        apply({ x, y, radius, dt, sim }) {
            if (isSolid) {
                sim.paintBrush(element.key, x, y, radius);
            } else {
                // Partículas por segundo, proporcional al tamaño del pincel
                const rate = 40 + radius * 2.5;
                sim.spawnBrush(element.key, x, y, radius, rate * dt);
            }
        }
    });
}

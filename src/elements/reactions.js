// =====================================================================
// REACCIONES POR CONTACTO
// =====================================================================
// Además de los cambios de fase por temperatura (definidos en
// elements.js), dos elementos que se TOCAN pueden reaccionar.
//
//   a, b     claves de los elementos. b puede ser una celda sólida.
//   rate     probabilidad por segundo de que reaccionen mientras se tocan.
//   aTo/bTo  en qué se convierte cada uno:
//              undefined -> no cambia
//              null      -> desaparece
//              'clave'   -> se convierte en ese elemento
//              { to, chance } -> se convierte solo con esa probabilidad
//   heatA/heatB  calor liberado (+) o absorbido (-) en °C.
//   extra    partículas adicionales que se generan: [{ to, chance }]
//   explode  fuerza de explosión (empuja partículas y rompe terreno).
//
// El orden no importa: lava+agua también cubre agua+lava.
// =====================================================================

import { byKey } from './elements.js';

export const REACTIONS = [
    // --- Lava y metales fundidos con agua: enfriamiento brusco ---
    { a: 'lava', b: 'water', rate: 8, aTo: 'obsidian', bTo: 'steam' },
    { a: 'lava', b: 'brine', rate: 8, aTo: 'obsidian', bTo: 'steam', extra: [{ to: 'salt', chance: 0.3 }] },
    { a: 'molten_iron', b: 'water', rate: 8, aTo: 'iron', bTo: 'steam' },
    { a: 'molten_glass', b: 'water', rate: 8, aTo: 'glass', bTo: 'steam' },

    // --- Ácido clorhídrico ---
    // Caliza: CaCO3 + 2HCl -> CaCl2 + H2O + CO2
    { a: 'acid', b: 'rock', rate: 0.5, aTo: { to: null, chance: 0.3 }, bTo: 'co2', heatA: 5 },
    { a: 'acid', b: 'basalt', rate: 0.35, aTo: { to: null, chance: 0.6 }, bTo: null },
    { a: 'acid', b: 'deep_rock', rate: 0.12, aTo: { to: null, chance: 0.6 }, bTo: null },
    // Hierro: Fe + 2HCl -> FeCl2 + H2
    { a: 'acid', b: 'ore', rate: 1, aTo: { to: null, chance: 0.5 }, bTo: 'hydrogen', heatA: 8 },
    { a: 'acid', b: 'iron', rate: 1, aTo: { to: null, chance: 0.5 }, bTo: 'hydrogen', heatA: 8 },
    { a: 'acid', b: 'wood', rate: 0.3, aTo: { to: null, chance: 0.3 }, bTo: null },
    // El ácido baja el punto de fusión del hielo
    { a: 'acid', b: 'ice', rate: 2, bTo: 'water' },
    // Dilución exotérmica
    { a: 'acid', b: 'water', rate: 0.25, aTo: 'water', heatA: 15, heatB: 15 },
    // El HCl gaseoso se disuelve en agua y forma ácido
    { a: 'acid_gas', b: 'water', rate: 3, aTo: null, bTo: 'acid' },
    { a: 'acid_gas', b: 'steam', rate: 1, aTo: null, bTo: 'acid' },

    // --- Sal ---
    { a: 'salt', b: 'water', rate: 2, aTo: null, bTo: 'brine' },
    { a: 'salt', b: 'ice', rate: 1.5, aTo: { to: null, chance: 0.5 }, bTo: 'brine' },
    { a: 'salt', b: 'steam', rate: 0.5, bTo: 'brine' },

    // --- Fuego ---
    { a: 'fire', b: 'water', rate: 12, aTo: null, heatB: 60 },
    { a: 'fire', b: 'brine', rate: 12, aTo: null, heatB: 60 },
    { a: 'fire', b: 'co2', rate: 10, aTo: null },
    { a: 'fire', b: 'oil', rate: 4, bTo: 'fire', extra: [{ to: 'smoke', chance: 0.4 }] },
    { a: 'fire', b: 'wood', rate: 1.5, bTo: 'fire', extra: [{ to: 'smoke', chance: 0.5 }, { to: 'ash', chance: 0.3 }] },
    // 2H2 + O2 -> 2H2O (explosivo)
    { a: 'fire', b: 'hydrogen', rate: 25, bTo: 'fire', extra: [{ to: 'steam', chance: 1 }], explode: 2.2 },
    { a: 'lava', b: 'hydrogen', rate: 25, bTo: 'fire', extra: [{ to: 'steam', chance: 1 }], explode: 2.2 },
    { a: 'fire', b: 'ice', rate: 3, aTo: null, bTo: 'water' }
];

// Mapa rápido: idA * 256 + idB -> { reaction, swap }
export const REACTION_MAP = new Map();

for (const r of REACTIONS) {
    const a = byKey[r.a];
    const b = byKey[r.b];

    if (!a || !b) {
        throw new Error(`Reacción con elemento inexistente: ${r.a} + ${r.b}`);
    }

    for (const spec of [r.aTo, r.bTo, ...(r.extra ?? [])]) {
        const target = typeof spec === 'object' && spec !== null ? spec.to : spec;
        if (target && !byKey[target]) {
            throw new Error(`Reacción ${r.a}+${r.b}: destino "${target}" no existe`);
        }
    }

    REACTION_MAP.set(a.id * 256 + b.id, { r, swap: false });
    REACTION_MAP.set(b.id * 256 + a.id, { r, swap: true });
}

// =====================================================================
// REGISTRO DE ELEMENTOS
// =====================================================================
// Cada elemento del juego (sólido del terreno, líquido, polvo o gas)
// se define UNA sola vez acá. El motor de simulación, el render, las
// luces, la UI de herramientas y el generador de piletas leen todo de
// este registro, así que para AGREGAR UN ELEMENTO NUEVO alcanza con:
//
//   1. Agregar un bloque define({...}) con un id libre.
//   2. (Opcional) Agregar sus reacciones de contacto en reactions.js.
//
// Campos:
//   id        número único (0-255). Sólidos 1-19, líquidos 20-29,
//             polvos 30-39, gases 40-59.
//   key       nombre interno. name: nombre visible.
//   state     'solid' (celda del terreno) | 'liquid' | 'powder' | 'gas'
//   color     color de render (partículas).
//   palette   variaciones de color (solo sólidos).
//   temp      temperatura con la que aparece (°C).
//   cap       capacidad calorífica relativa (cuánto cuesta calentarlo).
//   cond      conductividad térmica relativa (0-1).
//   ambient   velocidad con la que tiende a 20 °C (solo partículas).
//   above     cambio de fase al SUPERAR una temperatura:
//               { temp, to, latent, extra:[{to, chance}], explode }
//             latent = calor latente en "grados equivalentes": cuánto
//             calor extra hay que darle, ya en el punto de cambio, para
//             que cambie de fase (0 = instantáneo).
//   below     cambio de fase al BAJAR de una temperatura (mismo formato).
//   decay     { rate, to, chance } desaparición espontánea por segundo
//             (humo que se disipa, fuego que se apaga, etc.).
//   sustain   temperatura mínima mientras exista (combustión del fuego).
//   buoyancy  empuje vertical de los gases (+ sube, - baja).
//   floats    empuje hacia arriba cuando toca agua (aceites).
//   light     { color, intensity } si emite luz.
//   poolWeight  probabilidad de aparecer en las piletas naturales.
//   flags     comportamiento de LiquidFun: 'water' | 'viscous' | 'powder'
//   fromCell  probabilidad de crear una partícula cuando una celda
//             sólida se convierte en este elemento (conserva la masa).
//   placeable false para ocultarlo de la UI de herramientas.
// =====================================================================

export const AMBIENT = 20;

export const ELEMENTS = [];
export const byId = [];
export const byKey = {};

function define(element) {
    const e = {
        temp: AMBIENT,
        cap: 2,
        cond: 0.4,
        ambient: 0.01,
        buoyancy: 0,
        floats: 0,
        placeable: true,
        fromCell: 0.5,
        ...element
    };

    if (byId[e.id]) {
        throw new Error(`Id de elemento repetido: ${e.id}`);
    }

    ELEMENTS.push(e);
    byId[e.id] = e;
    byKey[e.key] = e;

    return e;
}

// ---------------------------------------------------------------------
// SÓLIDOS (celdas del terreno)
// ---------------------------------------------------------------------

define({
    id: 1, key: 'rock', name: 'Roca caliza', state: 'solid',
    palette: ['#263341', '#2c3947', '#324253', '#384858'],
    cap: 2.2, cond: 0.4,
    above: { temp: 1200, to: 'lava', latent: 200 }
});

define({
    id: 2, key: 'deep_rock', name: 'Granito', state: 'solid',
    palette: ['#182333', '#1c2838', '#223044', '#293649'],
    cap: 2.3, cond: 0.45,
    above: { temp: 1260, to: 'lava', latent: 220 }
});

define({
    id: 3, key: 'ore', name: 'Veta de hierro', state: 'solid',
    palette: ['#536b81', '#668399', '#8d9fb1', '#b4bfc6'],
    cap: 3, cond: 0.7,
    above: { temp: 1538, to: 'molten_iron', latent: 150 }
});

define({
    id: 4, key: 'crystal', name: 'Cuarzo', state: 'solid',
    palette: ['#246e8b', '#3299b5', '#66d4e7', '#9af8fa'],
    cap: 2, cond: 0.5,
    above: { temp: 1713, to: 'molten_glass', latent: 150 }
});

define({
    id: 5, key: 'ice', name: 'Hielo', state: 'solid',
    palette: ['#a9dcf0', '#b9e6f7', '#9fd2ea', '#c9eefa'],
    temp: -10, cap: 1.9, cond: 0.6,
    above: { temp: 0, to: 'water', latent: 80 }
});

define({
    id: 6, key: 'basalt', name: 'Basalto', state: 'solid',
    palette: ['#2b2b30', '#323238', '#26262b', '#3a3a40'],
    cap: 2.4, cond: 0.45,
    above: { temp: 1200, to: 'lava', latent: 200 }
});

define({
    id: 7, key: 'obsidian', name: 'Obsidiana', state: 'solid',
    palette: ['#140f1f', '#1c1530', '#100c18', '#251c3d'],
    cap: 2, cond: 0.35,
    above: { temp: 1100, to: 'lava', latent: 150 }
});

define({
    id: 8, key: 'glass', name: 'Vidrio', state: 'solid',
    palette: ['#9ad6d0cc', '#a8e3dccc', '#8cc8c4cc', '#b8efe8cc'],
    cap: 2, cond: 0.4,
    above: { temp: 1400, to: 'molten_glass', latent: 100 }
});

define({
    id: 9, key: 'wood', name: 'Madera', state: 'solid',
    palette: ['#6b4423', '#7a4f2a', '#5e3b1e', '#845a33'],
    cap: 1.2, cond: 0.15,
    above: {
        temp: 300, to: 'fire', latent: 30,
        extra: [{ to: 'smoke', chance: 0.5 }, { to: 'ash', chance: 0.3 }]
    }
});

define({
    id: 10, key: 'iron', name: 'Hierro', state: 'solid',
    palette: ['#7c8590', '#8e98a3', '#6d757f', '#a0a9b3'],
    cap: 3.5, cond: 1,
    above: { temp: 1538, to: 'molten_iron', latent: 150 }
});

define({
    id: 11, key: 'dry_ice', name: 'Hielo seco', state: 'solid',
    palette: ['#e6f3ff', '#d8ecfc', '#f0f8ff', '#cfe6fa'],
    temp: -90, cap: 1.5, cond: 0.3,
    above: { temp: -78.5, to: 'co2', latent: 60 }
});

// ---------------------------------------------------------------------
// LÍQUIDOS
// ---------------------------------------------------------------------

define({
    id: 20, key: 'water', name: 'Agua', state: 'liquid',
    color: 0x3399ff, flags: 'water', poolWeight: 50,
    cap: 4.2, cond: 0.5,
    above: { temp: 100, to: 'steam', latent: 300 },
    below: { temp: 0, to: 'ice', latent: 80 }
});

define({
    id: 21, key: 'brine', name: 'Agua salada', state: 'liquid',
    color: 0x5fb8d9, flags: 'water',
    cap: 4, cond: 0.5,
    above: { temp: 101, to: 'steam', latent: 300, extra: [{ to: 'salt', chance: 0.35 }] },
    below: { temp: -21, to: 'ice', latent: 80, extra: [{ to: 'salt', chance: 0.3 }] }
});

define({
    id: 22, key: 'lava', name: 'Lava', state: 'liquid',
    color: 0xff5a1f, flags: 'viscous', poolWeight: 20,
    temp: 1150, cap: 2.5, cond: 0.6, ambient: 0.006,
    incandescent: true,
    light: { color: 0xff5a1f, intensity: 1 },
    below: { temp: 700, to: 'basalt', latent: 150 }
});

define({
    id: 23, key: 'acid', name: 'Ácido clorhídrico', state: 'liquid',
    color: 0x7fff00, flags: 'water', poolWeight: 15,
    cap: 3.5, cond: 0.5,
    light: { color: 0x7fff00, intensity: 0.7 },
    above: { temp: 110, to: 'acid_gas', latent: 150 }
});

define({
    id: 24, key: 'oil', name: 'Petróleo', state: 'liquid',
    color: 0x8b6914, flags: 'viscous', poolWeight: 15,
    cap: 1.8, cond: 0.2, floats: 1.3,
    above: { temp: 260, to: 'fire', latent: 20, extra: [{ to: 'smoke', chance: 0.4 }] }
});

define({
    id: 25, key: 'molten_iron', name: 'Hierro fundido', state: 'liquid',
    color: 0xffb347, flags: 'viscous',
    temp: 1650, cap: 3.5, cond: 1, ambient: 0.02,
    incandescent: true,
    light: { color: 0xffa040, intensity: 1 },
    below: { temp: 1538, to: 'iron', latent: 150 }
});

define({
    id: 26, key: 'molten_glass', name: 'Vidrio fundido', state: 'liquid',
    color: 0xffd27a, flags: 'viscous',
    temp: 1500, cap: 2, cond: 0.4, ambient: 0.02,
    incandescent: true,
    light: { color: 0xffc860, intensity: 0.9 },
    below: { temp: 900, to: 'glass', latent: 100 }
});

// ---------------------------------------------------------------------
// POLVOS (caen y se apilan)
// ---------------------------------------------------------------------

define({
    id: 30, key: 'sand', name: 'Arena', state: 'powder',
    color: 0xd9c38c, flags: 'powder',
    cap: 1.3, cond: 0.25,
    above: { temp: 1700, to: 'molten_glass', latent: 100 }
});

define({
    id: 31, key: 'ash', name: 'Ceniza', state: 'powder',
    color: 0x8a8a8a, flags: 'powder',
    cap: 0.8, cond: 0.1
});

define({
    id: 32, key: 'salt', name: 'Sal', state: 'powder',
    color: 0xf2f2f2, flags: 'powder',
    cap: 1.8, cond: 0.3
});

// ---------------------------------------------------------------------
// GASES (suben o bajan según su densidad frente al aire)
// ---------------------------------------------------------------------

define({
    id: 40, key: 'steam', name: 'Vapor', state: 'gas',
    color: 0xdfe9f2, alpha: 0.45,
    temp: 105, cap: 0.5, cond: 0.25, ambient: 0.6, buoyancy: 0.6,
    below: { temp: 100, to: 'water', latent: 150 },
    decay: { rate: 0.01 }
});

define({
    id: 41, key: 'smoke', name: 'Humo', state: 'gas',
    color: 0x55585e, alpha: 0.5,
    temp: 150, cap: 0.3, cond: 0.1, ambient: 0.5, buoyancy: 0.45,
    decay: { rate: 0.25 }
});

define({
    id: 42, key: 'fire', name: 'Fuego', state: 'gas',
    color: 0xff8a1c, alpha: 0.85, blend: 'add',
    temp: 900, sustain: 900, cap: 0.3, cond: 0.8, ambient: 0, buoyancy: 0.9,
    fromCell: 1,
    incandescent: true,
    light: { color: 0xff9a2a, intensity: 1 },
    decay: { rate: 1.4, to: 'smoke', chance: 0.4 }
});

define({
    id: 43, key: 'co2', name: 'Dióxido de carbono', state: 'gas',
    color: 0xb8c4cc, alpha: 0.3,
    cap: 0.3, cond: 0.1, ambient: 0.3, buoyancy: -0.35,
    below: { temp: -78.5, to: 'dry_ice', latent: 60 },
    decay: { rate: 0.06 }
});

define({
    id: 44, key: 'hydrogen', name: 'Hidrógeno', state: 'gas',
    color: 0xd6f0ff, alpha: 0.25,
    cap: 0.3, cond: 0.2, ambient: 0.3, buoyancy: 1.4,
    above: {
        temp: 585, to: 'fire', latent: 0,
        extra: [{ to: 'steam', chance: 1 }], explode: 2.2
    },
    decay: { rate: 0.03 }
});

define({
    id: 45, key: 'acid_gas', name: 'Gas ácido (HCl)', state: 'gas',
    color: 0xc8f07a, alpha: 0.3,
    temp: 110, cap: 0.3, cond: 0.1, ambient: 0.3, buoyancy: -0.25,
    decay: { rate: 0.1 }
});

// ---------------------------------------------------------------------
// Validación: los destinos de cada cambio de fase deben existir
// ---------------------------------------------------------------------

for (const e of ELEMENTS) {
    for (const phase of [e.above, e.below, e.decay]) {
        if (!phase) continue;
        for (const target of [phase.to, ...(phase.extra ?? []).map((x) => x.to)]) {
            if (target && !byKey[target]) {
                throw new Error(`${e.key}: el destino "${target}" no existe`);
            }
        }
    }
}

export function isParticle(e) {
    return e.state !== 'solid';
}

// Color de un cuerpo incandescente según su temperatura (°C)
export function incandescentColor(t) {
    const stops = [
        [450, 70, 8, 2],
        [700, 150, 22, 6],
        [900, 220, 60, 12],
        [1100, 255, 120, 30],
        [1400, 255, 200, 90],
        [1800, 255, 245, 200]
    ];

    if (t <= stops[0][0]) return (stops[0][1] << 16) | (stops[0][2] << 8) | stops[0][3];

    for (let i = 1; i < stops.length; i++) {
        const [t1, r1, g1, b1] = stops[i];
        if (t <= t1) {
            const [t0, r0, g0, b0] = stops[i - 1];
            const f = (t - t0) / (t1 - t0);
            const r = Math.round(r0 + (r1 - r0) * f);
            const g = Math.round(g0 + (g1 - g0) * f);
            const b = Math.round(b0 + (b1 - b0) * f);
            return (r << 16) | (g << 8) | b;
        }
    }

    const last = stops[stops.length - 1];
    return (last[1] << 16) | (last[2] << 8) | last[3];
}

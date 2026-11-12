export const FLUID_TYPES = Object.freeze({
    water: {
        color: 0x3399ff,
        viscosity: 0,
        density: 1,
        emitsLight: false,
        lightColor: 0x3399ff,
        lightIntensity: 0,
        weight: 50
    },

    lava: {
        color: 0xff5a1f,
        viscosity: 0.08,
        density: 2,
        emitsLight: true,
        lightColor: 0xff5a1f,
        lightIntensity: 1.0,
        weight: 20
    },

    acid: {
        color: 0x7fff00,
        viscosity: 0.03,
        density: 1.1,
        emitsLight: true,
        lightColor: 0x7fff00,
        lightIntensity: 0.7,
        weight: 15
    },

    oil: {
        color: 0x8b6914,
        viscosity: 0.12,
        density: 0.8,
        emitsLight: false,
        lightColor: 0xffb347,
        lightIntensity: 0,
        weight: 15
    }
});
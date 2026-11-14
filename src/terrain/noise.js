// =====================================================================
// ★ NÚCLEO DEL TERRENO · RUIDO PROCEDURAL
// =====================================================================
// Funciones matemáticas que generan "aleatoriedad" REPRODUCIBLE:
// con la misma seed y las mismas coordenadas siempre devuelven el
// mismo número. Gracias a eso el mundo es infinito pero no hace falta
// guardarlo: cualquier celda se puede recalcular en cualquier momento.
//
//   hash()   número pseudoaleatorio 0..1 para un punto (sin suavizar).
//   noise2() "value noise": interpola hashes de una grilla para que
//            puntos cercanos den valores parecidos (formas suaves).
//   fbm()    suma 3 capas de noise2 de distinto tamaño (formas grandes
//            + medianas + detalle) = "fractal Brownian motion".
// =====================================================================

// Hash determinista: una misma seed + coordenadas siempre producen el mismo mundo.
// Mezcla los bits de x, y y seed multiplicando por números primos grandes
// y devuelve un valor entre 0 y 1.
export function hash(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Curva "smoothstep": suaviza la transición entre 0 y 1
const smooth = t => t * t * (3 - 2 * t);

// Interpolación lineal entre a y b
const lerp = (a, b, t) => a + (b - a) * t;

// Ruido suave. `scale` es el tamaño (en celdas) de cada "mancha".
export function noise2(x, y, scale, seed) {
  // Posición dentro de una grilla de tamaño `scale`
  const fx = x / scale, fy = y / scale;

  // Esquina superior izquierda de la casilla de la grilla
  const ix = Math.floor(fx), iy = Math.floor(fy);

  // Qué tan lejos estamos de esa esquina (suavizado)
  const tx = smooth(fx - ix), ty = smooth(fy - iy);

  // Mezclar los valores aleatorios de las 4 esquinas
  return lerp(
    lerp(hash(ix, iy, seed), hash(ix + 1, iy, seed), tx),
    lerp(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), tx), ty
  );
}

// Tres capas de ruido: 80 celdas (cuevas grandes), 36 (medianas) y
// 14 (detalle de los bordes). Los pesos suman 1.
export function fbm(x, y, seed) {
  return noise2(x, y, 80, seed) * .46 + noise2(x, y, 36, seed + 101) * .32 + noise2(x, y, 14, seed + 207) * .22;
}

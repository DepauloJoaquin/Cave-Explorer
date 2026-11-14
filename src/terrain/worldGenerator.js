// =====================================================================
// ★ NÚCLEO DEL TERRENO · GENERADOR DEL MUNDO
// =====================================================================
// getMaterial(x, y, seed) responde: "¿qué material hay en la celda
// (x, y)?". Es una función PURA (no guarda nada): solo usa ruido con
// coordenadas globales. Por eso:
//   - el mundo es infinito,
//   - no hay cortes entre chunks (cada chunk pregunta celda por celda),
//   - un chunk descargado se puede volver a generar idéntico.
// Las celdas que el jugador modificó NO salen de acá: las guarda
// TerrainManager (this.modified) y tienen prioridad.
// =====================================================================

import { hash, noise2, fbm } from './noise.js';
import { MATERIAL } from './config.js';
import {
    getPoolTerrainOverride
} from './poolGeometry.js';

export function getMaterial(x, y, seed) {

  // 1) Cámaras de las piletas: tienen prioridad sobre todo lo demás
  //    (hueco interior + pared de roca que contiene el líquido).
  const poolMaterial = getPoolTerrainOverride(x, y, seed);

  if (poolMaterial !== null) {
      return poolMaterial;
  }

  // 2) Valores de ruido para esta celda
  const broad = fbm(x, y, seed);                 // forma general de las cuevas
  const rooms = noise2(x, y, 105, seed + 411);   // salas grandes
  const detail = noise2(x, y, 9, seed + 621);    // detalle fino (minerales)

  // Hay hueco si el ruido general es alto, o si hay una "sala" y el
  // ruido general es medio.
  let empty = broad > .57 || (rooms > .65 && broad > .47);

  // 3) Galería sinuosa horizontal que atraviesa el mundo entero.
  //    Es una onda (dos senos) con un ancho que varía con ruido.
  const horizontalY = Math.sin(x * .012 + seed * .003) * 38 + Math.sin(x * .035) * 11;
  const horizontalWidth = 9 + noise2(x, 0, 55, seed + 92) * 7;
  if (Math.abs(y - horizontalY) < horizontalWidth) empty = true;

  // 4) Chimeneas verticales cada 200 celdas: garantizan que se pueda
  //    bajar y subir entre cuevas de distintas alturas.
  const shaftPeriod = 200;
  const shaftIndex = Math.round(x / shaftPeriod);
  const shaftX = shaftIndex * shaftPeriod + Math.sin(y * .014 + shaftIndex * 2.3) * 19;
  if (Math.abs(x - shaftX) < 6 + noise2(shaftIndex, y, 60, seed + 505) * 4) empty = true;

  if (empty) return MATERIAL.EMPTY;

  // 5) Celda sólida: elegir el tipo de roca
  const depth = Math.max(0, y) / 620;            // 0 en la superficie, crece al bajar

  // Cristales y vetas: puntos sueltos (hash alto) en zonas con detalle alto
  if (hash(x, y, seed + 91) > .992 && detail > .40) return MATERIAL.CRYSTAL;
  if (hash(x, y, seed + 59) > .977 && detail > .52) return MATERIAL.ORE;

  // Roca profunda (granito) en profundidad o en los núcleos macizos
  if (depth > .55 || broad < .34) return MATERIAL.DEEP_ROCK;

  return MATERIAL.ROCK;
}

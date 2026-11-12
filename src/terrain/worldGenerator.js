import { hash, noise2, fbm } from './noise.js';
import { MATERIAL } from './config.js';
import {
    getPoolTerrainOverride
} from './poolGeometry.js';
// Función sin estado y con coordenadas globales: NO genera cortes en bordes de chunks.
// Los túneles principales conectan el mundo aunque el ruido cree bolsillos aislados.
export function getMaterial(x, y, seed) {

  const poolMaterial = getPoolTerrainOverride(x, y, seed);

  if (poolMaterial !== null) {
      return poolMaterial;
  }
  const broad = fbm(x, y, seed);
  const rooms = noise2(x, y, 105, seed + 411);
  const detail = noise2(x, y, 9, seed + 621);
  let empty = broad > .57 || (rooms > .65 && broad > .47);

  // Galería sinuosa horizontal que atraviesa el mundo entero.
  const horizontalY = Math.sin(x * .012 + seed * .003) * 38 + Math.sin(x * .035) * 11;
  const horizontalWidth = 9 + noise2(x, 0, 55, seed + 92) * 7;
  if (Math.abs(y - horizontalY) < horizontalWidth) empty = true;

  // Chimeneas verticales periódicas; garantizan acceso a cuevas de otras alturas.
  const shaftPeriod = 200;
  const shaftIndex = Math.round(x / shaftPeriod);
  const shaftX = shaftIndex * shaftPeriod + Math.sin(y * .014 + shaftIndex * 2.3) * 19;
  if (Math.abs(x - shaftX) < 6 + noise2(shaftIndex, y, 60, seed + 505) * 4) empty = true;

  if (empty) return MATERIAL.EMPTY;
  const depth = Math.max(0, y) / 620;
  if (hash(x, y, seed + 91) > .992 && detail > .40) return MATERIAL.CRYSTAL;
  if (hash(x, y, seed + 59) > .977 && detail > .52) return MATERIAL.ORE;
  if (depth > .55 || broad < .34) return MATERIAL.DEEP_ROCK;
  return MATERIAL.ROCK;
}

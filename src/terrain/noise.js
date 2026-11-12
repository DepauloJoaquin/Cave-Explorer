// Hash determinista: una misma seed + coordenadas siempre producen el mismo mundo.
export function hash(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const smooth = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
export function noise2(x, y, scale, seed) {
  const fx = x / scale, fy = y / scale;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = smooth(fx - ix), ty = smooth(fy - iy);
  return lerp(
    lerp(hash(ix, iy, seed), hash(ix + 1, iy, seed), tx),
    lerp(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), tx), ty
  );
}
export function fbm(x, y, seed) {
  return noise2(x, y, 80, seed) * .46 + noise2(x, y, 36, seed + 101) * .32 + noise2(x, y, 14, seed + 207) * .22;
}

/** HSL (h in degrees, s and l in 0–1) to `[r, g, b]` in 0–255. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function hsla(h: number, s: number, l: number, a = 1): string {
  const [r, g, b] = hslToRgb(h, s, l);
  return `rgba(${r},${g},${b},${a})`;
}

export function hslHex(h: number, s: number, l: number): string {
  return `#${hslToRgb(h, s, l)
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

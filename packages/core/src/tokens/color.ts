export interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Lab {
  l: number;
  a: number;
  b: number;
}

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_PATTERN = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i;

// A style value or a token value can name the same colour in any notation — `white`, `#fff`,
// `#ffffff`, `rgb(255,255,255)`. Named colours are canonicalised to rgb here so a token whose value
// is `white` still matches a `rgb(255,255,255)` background instead of parsing to null and being skipped.
const NAMED_COLORS: Readonly<Record<string, Rgb>> = {
  transparent: {r: 0, g: 0, b: 0},
  black: {r: 0, g: 0, b: 0},
  white: {r: 255, g: 255, b: 255},
  silver: {r: 192, g: 192, b: 192},
  gray: {r: 128, g: 128, b: 128},
  grey: {r: 128, g: 128, b: 128},
  red: {r: 255, g: 0, b: 0},
  maroon: {r: 128, g: 0, b: 0},
  orange: {r: 255, g: 165, b: 0},
  yellow: {r: 255, g: 255, b: 0},
  olive: {r: 128, g: 128, b: 0},
  lime: {r: 0, g: 255, b: 0},
  green: {r: 0, g: 128, b: 0},
  aqua: {r: 0, g: 255, b: 255},
  cyan: {r: 0, g: 255, b: 255},
  teal: {r: 0, g: 128, b: 128},
  blue: {r: 0, g: 0, b: 255},
  navy: {r: 0, g: 0, b: 128},
  fuchsia: {r: 255, g: 0, b: 255},
  magenta: {r: 255, g: 0, b: 255},
  purple: {r: 128, g: 0, b: 128},
};

export const parseColor = (value: string): Rgb | null => {
  const input = value.trim();

  const named = NAMED_COLORS[input.toLowerCase()];
  if (named) return named;

  const hex = HEX_PATTERN.exec(input);
  if (hex?.[1]) {
    const digits = hex[1];
    const full =
      digits.length === 3
        ? digits
            .split('')
            .map((digit) => digit + digit)
            .join('')
        : digits;
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
    };
  }

  const rgb = RGB_PATTERN.exec(input);
  if (rgb?.[1] && rgb[2] && rgb[3]) {
    return {r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3])};
  }

  return null;
};

const toLinear = (channel: number): number => {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
};

const pivot = (value: number): number =>
  value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;

const toLab = ({r, g, b}: Rgb): Lab => {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  const x = pivot((lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047);
  const y = pivot(lr * 0.2126 + lg * 0.7152 + lb * 0.0722);
  const z = pivot((lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883);

  return {l: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z)};
};

export const deltaE = (first: Rgb, second: Rgb): number => {
  const a = toLab(first);
  const b = toLab(second);
  return Math.sqrt((a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
};

/**
 * A tiny pixel-art drawing kit. All of the game's art is original and is
 * drawn in code with these primitives, pixel by pixel, from fixed palettes.
 * Pure data: works in the browser and in Node (for tests and art dumps).
 */

export type RGB = number; // 0xRRGGBB
export type Ramp = readonly RGB[]; // dark to light

export class Pix {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8ClampedArray;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  set(x: number, y: number, c: RGB) {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.inside(x, y)) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = (c >> 16) & 255;
    this.data[i + 1] = (c >> 8) & 255;
    this.data[i + 2] = c & 255;
    this.data[i + 3] = 255;
  }

  clear(x: number, y: number) {
    if (this.inside(x, y)) this.data[(y * this.w + x) * 4 + 3] = 0;
  }

  /** Colour at a pixel, or -1 when transparent. */
  get(x: number, y: number): RGB {
    if (!this.inside(x, y)) return -1;
    const i = (y * this.w + x) * 4;
    if (this.data[i + 3] === 0) return -1;
    return (this.data[i] << 16) | (this.data[i + 1] << 8) | this.data[i + 2];
  }

  fill(c: RGB) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c);
  }

  rect(x: number, y: number, w: number, h: number, c: RGB) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
  }

  /** An ellipse lit from the upper left, using three or more shades. */
  shaded(cx: number, cy: number, rx: number, ry: number, ramp: Ramp, lx = -0.6, ly = -0.75) {
    const n = ramp.length;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        // Lambert-ish term plus darkening at the rim.
        const light = dx * lx + dy * ly - d * 0.25;
        const t = Math.max(0, Math.min(0.999, (light + 0.95) / 1.6));
        this.set(x, y, ramp[Math.floor(t * n)]);
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGB, thick = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    const r = (thick - 1) / 2;
    for (let i = 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y = y0 + ((y1 - y0) * i) / steps;
      if (thick <= 1) this.set(x, y, c);
      else this.ellipse(x, y, r, r, c);
    }
  }

  /** A limb: a thick line shaded light on its upper-left side. */
  limb(x0: number, y0: number, x1: number, y1: number, ramp: Ramp, thick: number) {
    this.line(x0, y0, x1, y1, ramp[0], thick);
    this.line(x0 - 0.6, y0 - 0.6, x1 - 0.6, y1 - 0.6, ramp[1], Math.max(1, thick - 1));
    if (ramp.length > 2 && thick > 3) this.line(x0 - 1.2, y0 - 1.2, x1 - 1.2, y1 - 1.2, ramp[2], Math.max(1, thick - 3));
  }

  poly(points: readonly (readonly [number, number])[], c: RGB) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of points) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs: number[] = [];
      const sy = y + 0.01;
      for (let i = 0; i < points.length; i++) {
        const [ax, ay] = points[i];
        const [bx, by] = points[(i + 1) % points.length];
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.round(xs[i]); x <= Math.round(xs[i + 1]); x++) this.set(x, y, c);
      }
    }
  }

  /** Draw a one-pixel outline around everything opaque. */
  outline(c: RGB) {
    const edge: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== -1) continue;
        if (this.get(x + 1, y) !== -1 || this.get(x - 1, y) !== -1 || this.get(x, y + 1) !== -1 || this.get(x, y - 1) !== -1)
          edge.push(x, y);
      }
    }
    for (let i = 0; i < edge.length; i += 2) this.set(edge[i], edge[i + 1], c);
  }

  blit(src: Pix, dx: number, dy: number) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const c = src.get(x, y);
        if (c !== -1) this.set(dx + x, dy + y, c);
      }
    }
  }

  /** Nearest-neighbour upscale, for interface art shown larger than drawn. */
  scaled(factor: number): Pix {
    const out = new Pix(this.w * factor, this.h * factor);
    for (let y = 0; y < out.h; y++) {
      for (let x = 0; x < out.w; x++) {
        const c = this.get(Math.floor(x / factor), Math.floor(y / factor));
        if (c !== -1) out.set(x, y, c);
      }
    }
    return out;
  }
}

/** Repeatable value noise in 0..1 that wraps at `period`, so textures tile. */
export function tileNoise(x: number, y: number, cell: number, period: number, seed: number): number {
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const n = period / cell;
  const h = (ix: number, iy: number) => hash2(((ix % n) + n) % n, ((iy % n) + n) % n, seed);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * sx;
  const b = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * sx;
  return a + (b - a) * sy;
}

export function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const clampIndex = (i: number, ramp: Ramp) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(i)))];

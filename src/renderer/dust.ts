/**
 * Flying bits as square points in the low-resolution view: grit thrown when a
 * cracked wall is struck, and blood thrown by a wound. Presentation only.
 */
import * as THREE from 'three';

const MAX = 400;

interface Mote {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  age: number;
  /** How hard it falls: grit drops, dust hangs. */
  weight: number;
  colour: [number, number, number];
}

type Palette = readonly [number, number, number][];

const GRIT: Palette = [
  [0.62, 0.55, 0.44],
  [0.48, 0.42, 0.33],
  [0.78, 0.71, 0.58],
];

/** Arterial red to clotted dark, and the pale chips of old bone. */
export const BLOOD_SPRAY: Palette = [
  [0.66, 0.1, 0.08],
  [0.47, 0.06, 0.05],
  [0.3, 0.03, 0.03],
];
export const ICHOR_SPRAY: Palette = [
  [0.2, 0.15, 0.1],
  [0.13, 0.1, 0.07],
  [0.27, 0.2, 0.13],
];
export const BONE_SPRAY: Palette = [
  [0.85, 0.81, 0.7],
  [0.6, 0.56, 0.46],
  [0.4, 0.37, 0.3],
];

export class Dust {
  readonly points: THREE.Points;
  /** Exposed for tests. */
  motes: Mote[] = [];
  private positions = new Float32Array(MAX * 3);
  private colours = new Float32Array(MAX * 3);
  private geometry = new THREE.BufferGeometry();
  private material: THREE.PointsMaterial;
  private seed = 1;

  constructor() {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colours, 3));
    this.geometry.setDrawRange(0, 0);
    this.material = new THREE.PointsMaterial({ size: 0.022, vertexColors: true, sizeAttenuation: true });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  /** A cheap repeatable wobble, so effects need no Math.random. */
  private rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /**
   * Grit thrown from a wall face at (x, z), outward along (nx, nz), from about
   * chest height: `count` pieces, harder for a bigger blow.
   */
  burst(x: number, z: number, nx: number, nz: number, count: number, force: number) {
    for (let i = 0; i < count; i++) {
      const out = (0.4 + this.rand() * 0.9) * force;
      const side = (this.rand() - 0.5) * 1.6 * force;
      this.add({
        x: x + nz * (this.rand() - 0.5) * 0.6,
        y: 0.25 + this.rand() * 0.5,
        z: z + nx * (this.rand() - 0.5) * 0.6,
        vx: nx * out + nz * side,
        vy: (this.rand() * 1.4 - 0.2) * force,
        vz: nz * out + nx * side,
        life: 0.6 + this.rand() * 0.9,
        age: 0,
        weight: this.rand() > 0.35 ? 5 : 0.6,
        colour: GRIT[i % GRIT.length],
      });
    }
  }

  /**
   * Blood (or bone) thrown from a wound at (x, y, z), mostly along (dx, dz):
   * heavy drops that arc and fall.
   */
  spray(x: number, y: number, z: number, dx: number, dz: number, count: number, force: number, palette: Palette) {
    for (let i = 0; i < count; i++) {
      const out = (0.3 + this.rand() * 1.1) * force;
      const side = (this.rand() - 0.5) * 1.8 * force;
      this.add({
        x: x + (this.rand() - 0.5) * 0.15,
        y: y + (this.rand() - 0.5) * 0.2,
        z: z + (this.rand() - 0.5) * 0.15,
        vx: dx * out + dz * side,
        vy: (0.4 + this.rand() * 1.6) * force,
        vz: dz * out - dx * side,
        life: 0.5 + this.rand() * 0.7,
        age: 0,
        weight: 6.5,
        colour: palette[i % palette.length],
      });
    }
  }

  private add(m: Mote) {
    if (this.motes.length >= MAX) this.motes.shift();
    this.motes.push(m);
  }

  update(dt: number) {
    this.motes = this.motes.filter((m) => {
      m.age += dt;
      m.vy -= m.weight * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.z += m.vz * dt;
      if (m.y < 0.01) {
        // Grit settles on the floor and skids to a stop.
        m.y = 0.01;
        m.vy = 0;
        m.vx *= 0.5;
        m.vz *= 0.5;
      }
      return m.age < m.life;
    });
    this.motes.forEach((m, i) => {
      this.positions.set([m.x, m.y, m.z], i * 3);
      const c = m.colour;
      // Fade toward the dark as it ages.
      const k = 1 - Math.max(0, (m.age / m.life - 0.6) / 0.4);
      this.colours.set([c[0] * k, c[1] * k, c[2] * k], i * 3);
    });
    this.geometry.setDrawRange(0, this.motes.length);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

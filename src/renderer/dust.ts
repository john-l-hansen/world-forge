/**
 * Dust and grit, as square points in the low-resolution view, thrown when a
 * cracked wall is struck. Presentation only.
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
}

const GRIT: [number, number, number][] = [
  [0.62, 0.55, 0.44],
  [0.48, 0.42, 0.33],
  [0.78, 0.71, 0.58],
];

export class Dust {
  readonly points: THREE.Points;
  private motes: Mote[] = [];
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
      const c = GRIT[i % 3];
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

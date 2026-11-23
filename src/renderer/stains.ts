/**
 * Blood on the floor, drawn from the session's stains. The simulation decides
 * where blood fell and how much; this only draws it, rebuilding its geometry
 * when the stains change. Presentation only.
 */
import * as THREE from 'three';
import { STAIN_LOOKS, STAIN_SHAPES, drawStainSheet, type StainLook } from '../art/blood';
import type { Stain } from '../engine/types';
import type { CompiledWorld } from '../world/compile';
import { BLOOD_DRIES_AFTER } from '../engine/worldlayer';
import { makeDecalMaterial, pixTexture, type SharedUniforms } from './materials';

export type GoreLevel = 'full' | 'low';

/** How wide each size is, in cells. */
const WIDTH = [0, 0.42, 0.7, 1.05];

export class StainLayer {
  readonly mesh: THREE.Mesh;
  private geometry = new THREE.BufferGeometry();
  private material: THREE.ShaderMaterial;
  private texture: THREE.Texture;
  private signature = '';

  constructor(private world: CompiledWorld, shared: SharedUniforms) {
    this.texture = pixTexture(drawStainSheet());
    this.material = makeDecalMaterial(this.texture, shared);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  update(stains: readonly Stain[], gore: GoreLevel, minute: number) {
    const last = stains[stains.length - 1];
    const isDry = (s: Stain) => minute - s.minute >= BLOOD_DRIES_AFTER;
    const dry = stains.reduce((n, s) => n + (isDry(s) ? 1 : 0), 0);
    const signature = `${gore}:${stains.length}:${dry}:${last ? `${last.tick},${last.x},${last.y}` : ''}:${stains.reduce((n, s) => n + s.size, 0)}`;
    if (signature === this.signature) return;
    this.signature = signature;

    const positions: number[] = [];
    const uvs: number[] = [];
    const lights: number[] = [];
    const index: number[] = [];
    const cols = 3 * STAIN_SHAPES;
    const rows = STAIN_LOOKS.length;
    stains.forEach((stain, i) => {
      // With gore turned down, every stain is old, dark and no bigger than a spatter.
      // Old blood has dried black; with gore turned down, all of it looks old.
      const look: StainLook = stain.kind === 'bone' ? 'bone' : gore === 'low' || isDry(stain) ? 'dry' : stain.kind;
      const size = gore === 'low' ? (Math.min(2, stain.size) as 1 | 2) : stain.size;
      const w = WIDTH[size];
      const shape = stain.v % STAIN_SHAPES;
      // Off-centre within the cell, by an amount the stain's size allows.
      const room = Math.max(0, 1 - w) * 0.8;
      const cx = stain.x + ((stain.v & 7) / 7 - 0.5) * room;
      const cz = stain.y + (((stain.v >> 3) & 7) / 7 - 0.5) * room;
      const turn = (stain.v >> 2) % 4;
      const y = 0.004 + i * 0.00002;
      const col = (size - 1) * STAIN_SHAPES + shape;
      const row = STAIN_LOOKS.indexOf(look);
      const u0 = col / cols;
      const u1 = (col + 1) / cols;
      const v1 = 1 - row / rows;
      const v0 = 1 - (row + 1) / rows;
      const corners: [number, number][] = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];
      const cornerUv: [number, number][] = [
        [u0, v1],
        [u1, v1],
        [u1, v0],
        [u0, v0],
      ];
      const light = this.world.light[stain.y * this.world.width + stain.x] ?? 0;
      const base = positions.length / 3;
      corners.forEach(([dx, dz], k) => {
        positions.push(cx + (dx * w) / 2, y, cz + (dz * w) / 2);
        const [u, v] = cornerUv[(k + turn) % 4];
        uvs.push(u, v);
        lights.push(light);
      });
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    this.geometry.dispose();
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    this.geometry.setAttribute('aLight', new THREE.Float32BufferAttribute(lights, 1));
    this.geometry.setIndex(index);
    this.mesh.geometry = this.geometry;
  }

  /** How many stains are drawn right now. For tests. */
  get count(): number {
    const index = this.geometry.getIndex();
    return index ? index.count / 6 : 0;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

/**
 * The retro renderer. It draws a session; it never changes one. The scene is
 * rendered at a low internal resolution (320×200 by default) and presented
 * unfiltered, so every pixel on screen is a real pixel of the frame.
 */
import * as THREE from 'three';
import { CHEST_H, CHEST_W, GOBLIN_H, GOBLIN_POSES, GOBLIN_W, PROP_SIZE, SWORD_H, SWORD_W, TORCH_H, TORCH_W, drawChest, drawGoblin, drawHeld, drawPickup, drawProp, drawTorch, type GoblinPose, type GoblinVariant, type HeldKind } from '../art/sprites';
import { Pix } from '../art/pixel';
import { activeMember, isGuarding } from '../engine/sim';
import { BUMP_TICKS, ENEMY_ATTACK_POSE_TICKS, MOVE_TICKS, TURN_TICKS, type EnemyState, type GameEvent, type SessionState } from '../engine/types';
import { DIR_X, DIR_Y, type CompiledWorld } from '../world/compile';
import { DOOR_HEIGHT, buildAtlas, buildDoorGeometry, buildDungeonGeometry, buildSecretGeometry } from './dungeon';
import { makeDungeonMaterial, makeOverlayMaterial, makePresentMaterial, makeSharedUniforms, makeSpriteMaterial, pixTexture, type SharedUniforms } from './materials';

export interface RendererOptions {
  /** Internal resolution. 320×200 and 426×240 are the supported targets. */
  width?: number;
  height?: number;
  fov?: number;
}

const EYE_HEIGHT = 0.52;
/** The eye sits a little behind the cell centre, so near things fit in view. */
const EYE_SETBACK = 0.28;
/** How tall each kind of enemy stands, in cells. The ceiling is at 1. */
const ENEMY_HEIGHT: Record<GoblinVariant, number> = { goblin: 0.8, goblin_chief: 0.97 };
const PROP_TEXEL = 1 / 64;
const BOLT_SEGMENTS = 40;
const BOLT_COLOUR = { lightning: 0xe8dcff, fire: 0xffc24a, ice: 0xbfe8ff } as const;

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

function sheetOf(frames: Pix[]): Pix {
  const sheet = new Pix(frames[0].w * frames.length, frames[0].h);
  frames.forEach((f, i) => sheet.blit(f, i * f.w, 0));
  return sheet;
}

/** An upright quad that pivots around its base to face the camera. */
function billboard(width: number, height: number, material: THREE.Material): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(width, height);
  geo.translate(0, height / 2, 0);
  return new THREE.Mesh(geo, material);
}

interface EnemyView {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
}

interface DoorView {
  id: string;
  mesh: THREE.Mesh;
  open: number;
  /** How far the leaf travels to be fully out of sight. */
  travel: number;
}

interface LootView {
  id: string;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
}

export class DungeonRenderer {
  readonly width: number;
  readonly height: number;

  private gl: THREE.WebGLRenderer;
  private target: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private overlayScene = new THREE.Scene();
  private overlayCamera: THREE.OrthographicCamera;
  private presentScene = new THREE.Scene();
  private presentCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private present: THREE.ShaderMaterial;
  private shared: SharedUniforms;

  private enemies = new Map<string, EnemyView>();
  private doors: DoorView[] = [];
  private chests: LootView[] = [];
  private pickups: LootView[] = [];
  private healFlash = 0;
  private spark = 0;
  private guard = 0;
  /** A spell bolt in flight: which enemy it strikes and how long it has left. */
  private bolt: { enemyId: string; life: number } | null = null;
  private boltLines: THREE.LineSegments;
  private boltMaterial: THREE.LineBasicMaterial;
  private torchMaterials: THREE.ShaderMaterial[] = [];
  private facers: THREE.Object3D[] = [];
  private sword: THREE.Mesh;
  private swordMaterial: THREE.ShaderMaterial;
  /** One texture per kind of weapon a character can hold up. */
  private heldTextures = new Map<HeldKind, THREE.Texture>();
  private heldKind: HeldKind = 'short_sword';
  private disposables: { dispose(): void }[] = [];

  // Short-lived presentation effects, timed in seconds of wall-clock time.
  private lastTime = 0;
  private hitKick = 0;
  private hurtKick = 0;
  private damageFlash = 0;
  private deathFade = 0;
  private yaw = 0;

  constructor(canvas: HTMLCanvasElement, private world: CompiledWorld, options: RendererOptions = {}) {
    this.width = options.width ?? 320;
    this.height = options.height ?? 200;

    THREE.ColorManagement.enabled = false;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.gl.setPixelRatio(1);
    this.gl.setSize(this.width, this.height, false);
    this.gl.setClearColor(0x000000, 1);
    this.gl.autoClear = false;

    this.target = new THREE.WebGLRenderTarget(this.width, this.height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      colorSpace: THREE.NoColorSpace,
    });
    this.disposables.push(this.target);

    this.camera = new THREE.PerspectiveCamera(options.fov ?? 62, this.width / this.height, 0.05, 40);
    this.camera.rotation.order = 'YXZ';
    this.shared = makeSharedUniforms();

    // --- Dungeon -------------------------------------------------------------
    const atlas = pixTexture(buildAtlas());
    const dungeonMaterial = makeDungeonMaterial(atlas, this.shared);
    const dungeonGeometry = buildDungeonGeometry(world);
    this.scene.add(new THREE.Mesh(dungeonGeometry, dungeonMaterial));
    this.disposables.push(atlas, dungeonMaterial, dungeonGeometry);

    const lightAt = (x: number, y: number) => world.light[y * world.width + x] ?? 0;
    for (const door of world.doors) {
      if (door.def.kind === 'archway') continue;
      const secret = door.def.kind === 'secret';
      const geo = secret
        ? door.axis === 'ew'
          ? buildSecretGeometry('ew', lightAt(door.x - 1, door.y), lightAt(door.x + 1, door.y))
          : buildSecretGeometry('ns', lightAt(door.x, door.y - 1), lightAt(door.x, door.y + 1))
        : buildDoorGeometry(door.axis, lightAt(door.x, door.y), Boolean(door.def.lock));
      const mesh = new THREE.Mesh(geo, dungeonMaterial);
      mesh.position.set(door.x, 0, door.y);
      this.scene.add(mesh);
      this.doors.push({ id: door.def.id, mesh, open: 0, travel: secret ? 1 : DOOR_HEIGHT * 0.99 });
      this.disposables.push(geo);
    }

    // --- Torches and props ---------------------------------------------------
    const torchSheet = pixTexture(sheetOf([drawTorch(0), drawTorch(1), drawTorch(2)]));
    this.disposables.push(torchSheet);
    world.torches.forEach((torch) => {
      const material = makeSpriteMaterial(torchSheet, this.shared, 3);
      material.uniforms.uFullbright.value = 1;
      const mesh = billboard(TORCH_W * PROP_TEXEL, TORCH_H * PROP_TEXEL, material);
      mesh.position.set(torch.x + DIR_X[torch.wall] * 0.4, 0.3, torch.y + DIR_Y[torch.wall] * 0.4);
      this.scene.add(mesh);
      this.facers.push(mesh);
      this.torchMaterials.push(material);
      this.disposables.push(material, mesh.geometry);
    });

    const propTextures = new Map<string, THREE.Texture>();
    for (const prop of world.props) {
      let tex = propTextures.get(prop.visualAssetId);
      if (!tex) {
        tex = pixTexture(drawProp(prop.visualAssetId));
        propTextures.set(prop.visualAssetId, tex);
        this.disposables.push(tex);
      }
      const size = PROP_SIZE[prop.visualAssetId];
      const material = makeSpriteMaterial(tex, this.shared, 1);
      material.uniforms.uLight.value = world.light[prop.y * world.width + prop.x];
      const mesh = billboard(size.w * PROP_TEXEL, size.h * PROP_TEXEL, material);
      mesh.position.set(prop.x, 0, prop.y);
      this.scene.add(mesh);
      this.facers.push(mesh);
      this.disposables.push(material, mesh.geometry);
    }

    // --- Chests and things lying on the floor ---------------------------------
    if (world.chests.length) {
      const chestSheet = pixTexture(sheetOf([drawChest(false), drawChest(true)]));
      this.disposables.push(chestSheet);
      for (const chest of world.chests) {
        const material = makeSpriteMaterial(chestSheet, this.shared, 2);
        material.uniforms.uLight.value = lightAt(chest.x, chest.y);
        const mesh = billboard(CHEST_W * PROP_TEXEL, CHEST_H * PROP_TEXEL, material);
        mesh.position.set(chest.x, 0, chest.y);
        this.scene.add(mesh);
        this.facers.push(mesh);
        this.chests.push({ id: chest.id, mesh, material });
        this.disposables.push(material, mesh.geometry);
      }
    }
    const pickupSheets = new Map<string, { texture: THREE.Texture; w: number; h: number }>();
    for (const pickup of world.pickups) {
      const item = world.def.items.find((i) => i.id === pickup.itemId);
      const visual = item?.visualAssetId ?? 'sack';
      let sheet = pickupSheets.get(visual);
      if (!sheet) {
        const frames = drawPickup(visual);
        sheet = { texture: pixTexture(sheetOf(frames)), w: frames[0].w, h: frames[0].h };
        pickupSheets.set(visual, sheet);
        this.disposables.push(sheet.texture);
      }
      const material = makeSpriteMaterial(sheet.texture, this.shared, 2);
      // Small things on the floor are lifted a little so they can be found.
      material.uniforms.uLight.value = Math.max(0.75, lightAt(pickup.x, pickup.y));
      const mesh = billboard(sheet.w * PROP_TEXEL, sheet.h * PROP_TEXEL, material);
      mesh.position.set(pickup.x, 0.04, pickup.y);
      this.scene.add(mesh);
      this.facers.push(mesh);
      this.pickups.push({ id: pickup.id, mesh, material });
      this.disposables.push(material, mesh.geometry);
    }

    // --- Enemies -------------------------------------------------------------
    const enemySheets = new Map<GoblinVariant, THREE.Texture>();
    for (const spawn of world.spawns) {
      const variant = world.def.enemies.find((e) => e.id === spawn.enemyId)!.visualAssetId;
      let sheet = enemySheets.get(variant);
      if (!sheet) {
        sheet = pixTexture(sheetOf(GOBLIN_POSES.map((pose) => drawGoblin(pose, variant))));
        enemySheets.set(variant, sheet);
        this.disposables.push(sheet);
      }
      const height = ENEMY_HEIGHT[variant];
      const material = makeSpriteMaterial(sheet, this.shared, GOBLIN_POSES.length);
      const mesh = billboard((height * GOBLIN_W) / GOBLIN_H, height, material);
      this.scene.add(mesh);
      this.facers.push(mesh);
      this.enemies.set(spawn.instanceId, { mesh, material });
      this.disposables.push(material, mesh.geometry);
    }

    // --- Held weapon, in screen pixels ---------------------------------------
    this.overlayCamera = new THREE.OrthographicCamera(0, this.width, this.height, 0, -1, 1);
    for (const kind of ['short_sword', 'dagger', 'staff', 'mace'] as const) {
      const texture = pixTexture(drawHeld(kind));
      this.heldTextures.set(kind, texture);
      this.disposables.push(texture);
    }
    const swordMaterial = makeOverlayMaterial(this.heldTextures.get('short_sword')!);
    this.swordMaterial = swordMaterial;
    const swordGeometry = new THREE.PlaneGeometry(SWORD_W, SWORD_H);
    // Pivot around the fist, which sits low and right in the sprite.
    swordGeometry.translate(SWORD_W / 2 - 66, SWORD_H / 2 - (SWORD_H - 84), 0);
    this.sword = new THREE.Mesh(swordGeometry, swordMaterial);
    this.overlayScene.add(this.sword);
    this.disposables.push(swordMaterial, swordGeometry);

    // --- Spell bolt: jagged lines redrawn every frame while it lasts -----------
    const boltGeometry = new THREE.BufferGeometry();
    boltGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(BOLT_SEGMENTS * 2 * 3), 3));
    this.boltMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false });
    this.boltLines = new THREE.LineSegments(boltGeometry, this.boltMaterial);
    this.boltLines.frustumCulled = false;
    this.boltLines.renderOrder = 10;
    this.boltLines.visible = false;
    this.scene.add(this.boltLines);
    this.disposables.push(boltGeometry, this.boltMaterial);

    // --- Presentation pass ---------------------------------------------------
    this.present = makePresentMaterial(this.target.texture);
    const presentGeometry = new THREE.PlaneGeometry(2, 2);
    this.presentScene.add(new THREE.Mesh(presentGeometry, this.present));
    this.disposables.push(this.present, presentGeometry);
  }

  /** React to simulation events with short camera and screen effects. */
  /** `driven` is the character whose eyes the view looks through. */
  onEvent(event: GameEvent, driven?: string) {
    const mine = !('actor' in event) || driven === undefined || event.actor === driven;
    switch (event.type) {
      case 'attack.hit':
        // A companion's blow nudges the view; your own jolts it.
        this.hitKick = Math.max(this.hitKick, mine ? 1 : 0.3);
        break;
      case 'attack.clang':
        if (mine) this.hitKick = 0.6;
        break;
      case 'spell.healed':
        this.healFlash = Math.max(this.healFlash, 0.8);
        break;
      case 'attack.parried':
        this.spark = 1;
        this.hitKick = 0.8;
        break;
      case 'attack.blocked':
        this.hurtKick = 0.45;
        this.spark = 0.35;
        break;
      case 'enemy.interrupted':
        this.spark = 0.5;
        break;
      case 'guard.broken':
      case 'enemy.attack.hit':
        // The whole party shares one view: a blow on a companion is felt, but less.
        if (driven === undefined || event.target === driven) {
          this.hurtKick = 1;
          this.damageFlash = 1;
        } else {
          this.hurtKick = Math.max(this.hurtKick, 0.35);
          this.damageFlash = Math.max(this.damageFlash, 0.3);
        }
        break;
      case 'party.died':
        this.damageFlash = 1;
        break;
      case 'item.used':
        this.healFlash = 1;
        break;
      case 'spell.hit': {
        const spell = this.world.def.spells.find((sp) => sp.id === event.spellId);
        this.boltMaterial.color.setHex(BOLT_COLOUR[spell?.shape === 'bolt' ? spell.element : 'lightning']);
        this.bolt = { enemyId: event.enemyId, life: 0.3 };
        this.spark = 0.9;
        this.hitKick = 0.7;
        break;
      }
    }
  }

  /**
   * Draw one frame. `alpha` is how far (0..1) real time is into the next
   * simulation tick, used to interpolate movement smoothly.
   */
  render(state: SessionState, alpha: number, timeSeconds: number) {
    const dt = Math.min(0.1, Math.max(0, timeSeconds - this.lastTime));
    this.lastTime = timeSeconds;
    const now = state.tick + (state.hitStop > 0 || state.status !== 'playing' ? 0 : alpha);

    this.hitKick = Math.max(0, this.hitKick - dt * 7);
    this.hurtKick = Math.max(0, this.hurtKick - dt * 4);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 3.2);
    this.healFlash = Math.max(0, this.healFlash - dt * 2.2);
    this.spark = Math.max(0, this.spark - dt * 6);
    const driven = activeMember(state);
    const guardGoal = state.status === 'playing' && isGuarding(driven) ? 1 : 0;
    this.guard += Math.sign(guardGoal - this.guard) * Math.min(Math.abs(guardGoal - this.guard), dt * 9);
    this.deathFade = state.status === 'dead' ? Math.min(1, this.deathFade + dt * 0.7) : 0;

    // Torch flicker: a slow wobble with the odd sharp gutter.
    const flicker = 0.82 + 0.1 * Math.sin(timeSeconds * 9.1) + 0.08 * Math.sin(timeSeconds * 23.7 + 1.3);
    this.shared.uFlicker.value = flicker;

    this.placeCamera(state, now, timeSeconds);
    for (const mesh of this.facers) mesh.rotation.y = this.yaw;

    const torchFrame = Math.floor(timeSeconds * 9) % 3;
    this.torchMaterials.forEach((m, i) => (m.uniforms.uFrame.value = (torchFrame + i) % 3));

    for (const door of this.doors) {
      const goal = state.doorsOpen[door.id] ? 1 : 0;
      const stepSize = dt * 3.2;
      door.open = goal > door.open ? Math.min(goal, door.open + stepSize) : Math.max(goal, door.open - stepSize);
      door.mesh.position.y = smooth(door.open) * door.travel;
      door.mesh.visible = door.open < 0.995;
    }
    for (const chest of this.chests) chest.material.uniforms.uFrame.value = state.chestsOpened[chest.id] ? 1 : 0;
    for (const pickup of this.pickups) {
      pickup.mesh.visible = !state.pickupsTaken[pickup.id];
      pickup.material.uniforms.uFrame.value = Math.floor(timeSeconds * 2.5) % 4 === 0 ? 1 : 0;
    }

    for (const enemy of state.enemies) this.placeEnemy(enemy, now);
    this.placeBolt(dt);
    this.placeSword(state, now, timeSeconds);

    this.present.uniforms.uDamage.value = this.damageFlash;
    this.present.uniforms.uHeal.value = this.healFlash;
    this.present.uniforms.uSpark.value = this.spark;
    this.present.uniforms.uFade.value = this.deathFade;

    this.gl.setRenderTarget(this.target);
    this.gl.clear();
    this.gl.render(this.scene, this.camera);
    this.gl.clearDepth();
    // The weapon is only drawn while one is held, and is whatever the driven character holds.
    const held = this.world.def.items.find((i) => i.id === driven.equipment.mainHand);
    this.sword.visible = held?.category === 'weapon';
    if (held?.category === 'weapon' && held.visualAssetId !== this.heldKind) {
      this.heldKind = held.visualAssetId;
      this.swordMaterial.uniforms.uMap.value = this.heldTextures.get(this.heldKind);
    }
    if (state.status === 'playing') this.gl.render(this.overlayScene, this.overlayCamera);
    this.gl.setRenderTarget(null);
    this.gl.render(this.presentScene, this.presentCamera);
  }

  private placeCamera(state: SessionState, now: number, timeSeconds: number) {
    const p = state.party;
    const mt = clamp01((now - p.moveStart) / p.moveTicks);
    const ease = smooth(mt);
    let x = p.prevX + (p.x - p.prevX) * ease;
    let z = p.prevY + (p.y - p.prevY) * ease;
    // A dodge is a quick, low lunge; a walk has a gentle bob.
    const dip = p.moveTicks < MOVE_TICKS ? -0.07 : -0.022;
    let y = EYE_HEIGHT + (mt < 1 ? Math.sin(mt * Math.PI) * dip : 0);

    // Turn through the shorter way round.
    const tt = clamp01((now - p.turnStart) / TURN_TICKS);
    let delta = p.facing - p.prevFacing;
    if (delta === 3) delta = -1;
    if (delta === -3) delta = 1;
    const facing = p.prevFacing + delta * smooth(tt);
    const yaw = -facing * (Math.PI / 2);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);

    // Bump: a short push into the obstacle and back.
    const bt = (now - p.bumpStart) / BUMP_TICKS;
    if (bt >= 0 && bt < 1) {
      const push = Math.sin(bt * Math.PI) * 0.07;
      x += DIR_X[p.bumpDir] * push;
      z += DIR_Y[p.bumpDir] * push;
    }

    // Small camera responses. Kept subtle on purpose.
    const lunge = this.hitKick * 0.035;
    const recoil = this.hurtKick * 0.09;
    x += fx * (lunge - recoil - EYE_SETBACK);
    z += fz * (lunge - recoil - EYE_SETBACK);
    y += this.hurtKick * Math.sin(timeSeconds * 70) * 0.012;

    this.camera.position.set(x, y, z);
    this.camera.rotation.set(0, yaw, this.hurtKick * Math.sin(timeSeconds * 55) * 0.02);
    this.yaw = yaw;
  }

  private placeEnemy(enemy: EnemyState, now: number) {
    const view = this.enemies.get(enemy.id);
    if (!view) return;
    const def = this.world.def.enemies.find((e) => e.id === enemy.defId)!;
    const mt = clamp01((now - enemy.moveStart) / def.moveTicks);
    let x = enemy.prevX + (enemy.x - enemy.prevX) * mt;
    let z = enemy.prevY + (enemy.y - enemy.prevY) * mt;
    let y = 0;
    let scale = 1;
    let pose: GoblinPose;
    const sinceHit = now - enemy.lastHitTick;

    if (enemy.ai === 'dead') {
      pose = 'dead';
    } else if (sinceHit < 10 || enemy.ai === 'stagger') {
      pose = 'hurt';
      // Knocked back a little, away from the party.
      const knock = Math.max(0, 1 - sinceHit / 10) * 0.08;
      x -= DIR_X[enemy.facing] * knock;
      z -= DIR_Y[enemy.facing] * knock;
    } else if (enemy.ai === 'telegraph') {
      // A sweep is wound up low at the hip; everything else overhead.
      pose = def.attacks.find((a) => a.id === enemy.attackId)?.pattern === 'sweep' ? 'sweep' : 'telegraph';
      // Rears up, then trembles just before the blow.
      const t = clamp01((now - enemy.aiStart) / Math.max(1, enemy.aiEnd - enemy.aiStart));
      scale = 1 + 0.05 * smooth(t);
      x -= DIR_X[enemy.facing] * 0.06 * t;
      z -= DIR_Y[enemy.facing] * 0.06 * t;
      if (t > 0.7) x += Math.sin(now * 2.4) * 0.008;
    } else if (enemy.ai === 'attack') {
      pose = 'attack';
      const t = clamp01((now - enemy.aiStart) / ENEMY_ATTACK_POSE_TICKS);
      const lunge = Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * 0.3;
      x += DIR_X[enemy.facing] * lunge;
      z += DIR_Y[enemy.facing] * lunge;
    } else if (enemy.ai === 'move') {
      pose = Math.floor(now / 7) % 2 ? 'walk0' : 'walk1';
      y = Math.abs(Math.sin(mt * Math.PI * 2)) * 0.025;
    } else {
      pose = Math.floor(now / 28) % 2 ? 'idle0' : 'idle1';
    }

    view.mesh.position.set(x, y, z);
    view.mesh.scale.setScalar(scale);
    view.material.uniforms.uFrame.value = GOBLIN_POSES.indexOf(pose);
    view.material.uniforms.uLight.value = this.world.light[enemy.y * this.world.width + enemy.x];
    view.material.uniforms.uFlash.value = enemy.ai !== 'dead' || sinceHit < 6 ? Math.max(0, 1 - sinceHit / 5) * 0.85 : 0;
    const unblockable = enemy.ai === 'telegraph' && def.attacks.find((a) => a.id === enemy.attackId)?.blockable === false;
    view.material.uniforms.uDanger.value = unblockable ? 0.3 + 0.25 * Math.sin(now * 0.45) : 0;
  }

  /** Redraw the spell bolt from the caster's hand to its target, freshly jagged each frame. */
  private placeBolt(dt: number) {
    const target = this.bolt && this.enemies.get(this.bolt.enemyId);
    if (!this.bolt || !target) {
      this.boltLines.visible = false;
      return;
    }
    this.bolt.life -= dt;
    if (this.bolt.life <= 0) {
      this.bolt = null;
      this.boltLines.visible = false;
      return;
    }
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const from = new THREE.Vector3(this.camera.position.x + fx * 0.3 - fz * 0.12, this.camera.position.y - 0.14, this.camera.position.z + fz * 0.3 + fx * 0.12);
    const to = new THREE.Vector3(target.mesh.position.x, 0.42, target.mesh.position.z);
    const positions = this.boltLines.geometry.getAttribute('position') as THREE.BufferAttribute;
    let i = 0;
    const strand = (a: THREE.Vector3, b: THREE.Vector3, segments: number, spread: number) => {
      let prev = a.clone();
      for (let k = 1; k <= segments && i < BOLT_SEGMENTS; k++) {
        const t = k / segments;
        const next = a.clone().lerp(b, t);
        if (k < segments) {
          const wobble = spread * Math.sin(t * Math.PI);
          next.x += (Math.random() - 0.5) * wobble;
          next.y += (Math.random() - 0.5) * wobble;
          next.z += (Math.random() - 0.5) * wobble;
        }
        positions.setXYZ(i * 2, prev.x, prev.y, prev.z);
        positions.setXYZ(i * 2 + 1, next.x, next.y, next.z);
        i++;
        prev = next;
      }
    };
    // Three main strands and a few short forks off the path.
    for (let n = 0; n < 3; n++) strand(from, to, 8, 0.22);
    for (let n = 0; n < 4; n++) {
      const start = from.clone().lerp(to, 0.25 + Math.random() * 0.6);
      const end = start.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.3) * 0.4, (Math.random() - 0.5) * 0.5));
      strand(start, end, 3, 0.12);
    }
    for (; i < BOLT_SEGMENTS; i++) {
      positions.setXYZ(i * 2, 0, -10, 0);
      positions.setXYZ(i * 2 + 1, 0, -10, 0);
    }
    positions.needsUpdate = true;
    this.boltLines.visible = true;
  }

  private placeSword(state: SessionState, now: number, timeSeconds: number) {
    const p = state.party;
    const member = activeMember(state);
    const moving = now - p.moveStart < p.moveTicks;
    const stride = (now - p.moveStart) / p.moveTicks;
    const bobX = moving ? Math.sin(stride * Math.PI * 2) * 3 : Math.sin(timeSeconds * 1.6) * 1.2;
    const bobY = moving ? -Math.abs(Math.sin(stride * Math.PI)) * 4 : Math.sin(timeSeconds * 2.1) * 1;

    // Rest position of the fist, in screen pixels from the bottom left.
    let x = this.width * 0.915 + bobX;
    let y = this.height * 0.07 + bobY;
    let angle = 0;

    // Guard: the blade comes across the body, between the party and the blow.
    const g = smooth(this.guard);
    x -= this.width * 0.2 * g;
    y += this.height * 0.1 * g;
    angle += 0.62 * g;

    const action = member?.action;
    if (action && action.kind === 'attack') {
      // A heavy attack draws further back and cuts a wider arc.
      const reach = action.attack === 'heavy' ? 1.45 : 1;
      const windup = action.hitTick - action.start;
      const t = now - action.start;
      if (t < windup) {
        // Draw back up and to the right.
        const k = smooth(clamp01(t / windup));
        x += 18 * reach * k;
        y += 26 * reach * k;
        angle = -0.55 * reach * k;
      } else {
        // Cut down and across, then ease back to rest.
        const strike = clamp01((t - windup) / 7);
        const back = smooth(clamp01((t - windup - 9) / Math.max(1, action.end - action.hitTick - 9)));
        const k = Math.sin(strike * Math.PI * 0.5);
        x += (18 * reach - 150 * reach * k) * (1 - back);
        y += (26 * reach - 44 * reach * k) * (1 - back);
        angle = (-0.55 * reach + 1.75 * reach * k) * (1 - back);
      }
    }
    if (action && action.kind === 'cast') {
      // Casting: the weapon is thrust up and forward, held there, then lowered.
      const t = now - action.start;
      const rise = smooth(clamp01(t / Math.max(1, action.hitTick - action.start)));
      const fall = smooth(clamp01((t - (action.hitTick - action.start) - 6) / Math.max(1, action.end - action.hitTick - 6)));
      const k = rise * (1 - fall);
      x -= this.width * 0.12 * k;
      y += this.height * 0.2 * k;
      angle = 0.28 * k + Math.sin(timeSeconds * 40) * 0.02 * k;
    }
    this.sword.position.set(Math.round(x), Math.round(y), 0);
    this.sword.rotation.z = angle;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.gl.dispose();
  }
}

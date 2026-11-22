/**
 * Audio engine. Every sound is synthesized with the Web Audio API, so the
 * game ships no audio files. It listens to simulation events and never
 * touches game state.
 */
import type { GameEvent } from '../engine/types';
import type { Environment } from '../schema/world';

/** How an enemy sounds: flesh and breath, or dry bone. */
export type Voice = 'beast' | 'bones';

type Wave = OscillatorType;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private dripTimer: ReturnType<typeof setTimeout> | null = null;
  private stepToggle = false;
  private draftGain: GainNode | null = null;
  /** Loudness of the sound being built: a companion's blows sit behind your own. */
  private level = 1;
  muted = false;

  /** Must be called from a user gesture (browsers block audio until then). */
  start(environment: Environment = 'mine') {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      return; // Audio is unavailable here; the game plays on in silence.
    }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(ctx.destination);

    // Two seconds of white noise, reused by every noise-based sound.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1664525 + 1013904223) | 0;
      data[i] = (seed >>> 0) / 2147483648 - 1;
    }
    this.startAmbience(environment);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.6, this.ctx.currentTime, 0.02);
  }

  /**
   * The draft from a hidden way, 0 (none) to 1 (right beside it): a low,
   * breathing wind. The game sets this from how close the party stands.
   */
  setDraft(level: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    if (!this.draftGain) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 420;
      band.Q.value = 1.1;
      // A slow swell, so it breathes rather than hisses.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.35;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 160;
      lfo.connect(lfoGain).connect(band.frequency);
      this.draftGain = ctx.createGain();
      this.draftGain.gain.value = 0;
      src.connect(band).connect(this.draftGain).connect(this.master);
      src.start();
      lfo.start();
    }
    this.draftGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.2, ctx.currentTime, 0.25);
  }

  stop() {
    this.draftGain = null;
    if (this.dripTimer) clearTimeout(this.dripTimer);
    this.dripTimer = null;
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }

  /**
   * `driven` is the character the player is playing. Their sounds are in the
   * foreground; a companion's swings and blows are quieter.
   */
  onEvent(event: GameEvent, driven?: string, voice: Voice = 'beast') {
    const actor = 'actor' in event ? event.actor : undefined;
    const companion = driven !== undefined && actor !== undefined && actor !== driven;
    this.level = 1;
    if (companion) {
      // Only what a companion does to the fight is heard; their fumbles are not.
      if (event.type === 'stamina.low' || event.type === 'attack.clang' || event.type === 'spell.refused' || event.type === 'level.up') return;
      if (event.type === 'attack.swing' || event.type === 'attack.hit' || event.type === 'spell.cast') this.level = 0.45;
    }
    if (voice === 'bones' && this.bones(event)) return;
    switch (event.type) {
      case 'spell.healed':
        // A warm rising chord.
        [392, 494, 587, 784].forEach((f, i) => this.tone({ wave: 'sine', from: f, to: f * 1.01, dur: 0.5, gain: 0.1, delay: i * 0.07, attack: 0.08 }));
        this.noiseHit({ dur: 0.5, freq: 3000, to: 7000, q: 5, gain: 0.05, type: 'bandpass', attack: 0.3 });
        break;
      case 'spell.refused':
        this.tone({ wave: 'square', from: 160, to: 150, dur: 0.07, gain: 0.08, filter: 800 });
        break;
      case 'party.control':
        // Two soft knocks: someone else steps up.
        this.tone({ wave: 'triangle', from: 330, to: 330, dur: 0.06, gain: 0.12 });
        this.tone({ wave: 'triangle', from: 440, to: 440, dur: 0.08, gain: 0.12, delay: 0.07 });
        break;
      case 'member.row':
        this.noiseHit({ dur: 0.12, freq: 500, q: 0.8, gain: 0.2, type: 'lowpass', attack: 0.02 });
        break;
      case 'member.fell':
        // A cry cut short, and a body on stone.
        this.tone({ wave: 'sawtooth', from: 420, to: 110, dur: 0.45, gain: 0.22, vibrato: 30, filter: 1300 });
        this.noiseHit({ dur: 0.22, freq: 200, q: 0.7, gain: 0.55, type: 'lowpass', delay: 0.4 });
        this.tone({ wave: 'sine', from: 80, to: 40, dur: 0.4, gain: 0.4, delay: 0.4 });
        break;
      case 'attack.out_of_reach':
        this.tone({ wave: 'square', from: 180, to: 170, dur: 0.05, gain: 0.08, filter: 900 });
        break;
      case 'party.moved':
        this.stepToggle = !this.stepToggle;
        this.noiseHit({ dur: 0.07, freq: this.stepToggle ? 420 : 340, q: 0.8, gain: 0.3, type: 'lowpass' });
        this.tone({ wave: 'sine', from: this.stepToggle ? 85 : 72, to: 50, dur: 0.07, gain: 0.25 });
        break;
      case 'party.bumped':
        this.tone({ wave: 'sine', from: 110, to: 45, dur: 0.14, gain: 0.5 });
        this.noiseHit({ dur: 0.06, freq: 300, q: 0.7, gain: 0.25, type: 'lowpass' });
        break;
      case 'attack.swing':
        if (event.kind === 'heavy') {
          // A slower, deeper whoosh that builds to the cut.
          this.noiseHit({ dur: 0.36, freq: 300, to: 1500, q: 2, gain: 0.4, type: 'bandpass', attack: 0.22 });
          this.tone({ wave: 'sine', from: 90, to: 60, dur: 0.3, gain: 0.15, attack: 0.2 });
        } else {
          this.noiseHit({ dur: 0.16, freq: 700, to: 2600, q: 2.5, gain: 0.3, type: 'bandpass', attack: 0.04 });
        }
        break;
      case 'spell.cast':
        // A rising hum while the words are spoken.
        this.tone({ wave: 'sine', from: 180, to: 720, dur: 0.32, gain: 0.16, vibrato: 14, attack: 0.2 });
        this.noiseHit({ dur: 0.3, freq: 2500, to: 6000, q: 4, gain: 0.1, type: 'bandpass', attack: 0.25 });
        break;
      case 'spell.hit':
        // The crack of the bolt, then its rumble.
        this.noiseHit({ dur: 0.05, freq: 6000, q: 0.7, gain: 0.8, type: 'highpass' });
        this.noiseHit({ dur: 0.35, freq: 1800, to: 200, q: 0.8, gain: 0.7, type: 'lowpass' });
        this.tone({ wave: 'sawtooth', from: 900, to: 60, dur: 0.3, gain: 0.25, filter: 2400 });
        this.tone({ wave: 'sine', from: 70, to: 35, dur: 0.7, gain: 0.4, delay: 0.1 });
        break;
      case 'spell.fizzled':
        this.noiseHit({ dur: 0.25, freq: 3000, to: 600, q: 3, gain: 0.15, type: 'bandpass' });
        break;
      case 'level.up':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ wave: 'triangle', from: f, to: f, dur: 0.3, gain: 0.12, delay: 0.7 + i * 0.09 }));
        this.tone({ wave: 'sine', from: 131, to: 131, dur: 0.9, gain: 0.2, delay: 0.7 });
        break;
      case 'stamina.low':
        this.tone({ wave: 'sine', from: 140, to: 90, dur: 0.12, gain: 0.2 });
        this.noiseHit({ dur: 0.14, freq: 500, q: 0.6, gain: 0.12, type: 'lowpass', attack: 0.04 });
        break;
      case 'party.dodged':
        this.noiseHit({ dur: 0.14, freq: 1400, to: 500, q: 1.6, gain: 0.35, type: 'bandpass', attack: 0.02 });
        break;
      case 'attack.blocked':
        if (event.shieldId) {
          // A deep wooden thud with an iron ring at the rim.
          this.noiseHit({ dur: 0.16, freq: 380, q: 1.4, gain: 0.8, type: 'lowpass' });
          this.tone({ wave: 'sine', from: 140, to: 70, dur: 0.22, gain: 0.5 });
          this.tone({ wave: 'triangle', from: 1240, to: 1180, dur: 0.18, gain: 0.06, delay: 0.01 });
          break;
        }
        this.tone({ wave: 'triangle', from: 520, to: 360, dur: 0.1, gain: 0.25 });
        this.noiseHit({ dur: 0.09, freq: 1100, q: 0.9, gain: 0.5, type: 'lowpass' });
        this.tone({ wave: 'sine', from: 120, to: 60, dur: 0.14, gain: 0.35 });
        break;
      case 'attack.parried':
        this.noiseHit({ dur: 0.03, freq: 5000, q: 1, gain: 0.4, type: 'highpass' });
        this.tone({ wave: 'triangle', from: 1760, to: 1740, dur: 0.5, gain: 0.2 });
        this.tone({ wave: 'triangle', from: 2637, to: 2610, dur: 0.4, gain: 0.1 });
        this.tone({ wave: 'square', from: 3520, to: 3500, dur: 0.12, gain: 0.04 });
        break;
      case 'guard.broken':
        this.noiseHit({ dur: 0.22, freq: 700, q: 0.7, gain: 0.7, type: 'lowpass' });
        this.tone({ wave: 'square', from: 200, to: 50, dur: 0.3, gain: 0.35 });
        this.tone({ wave: 'triangle', from: 700, to: 300, dur: 0.18, gain: 0.15 });
        break;
      case 'enemy.attack.dodged':
        this.noiseHit({ dur: 0.2, freq: 2000, to: 500, q: 2, gain: 0.3, type: 'bandpass', attack: 0.03 });
        break;
      case 'enemy.interrupted':
        this.tone({ wave: 'sawtooth', from: 320, to: 120, dur: 0.22, gain: 0.2, vibrato: 60, filter: 1500 });
        break;
      case 'attack.hit':
        if (event.kind === 'heavy') {
          this.noiseHit({ dur: 0.16, freq: 900, q: 0.7, gain: 0.7, type: 'lowpass' });
          this.tone({ wave: 'square', from: 110, to: 40, dur: 0.22, gain: 0.4 });
        }
        this.noiseHit({ dur: 0.1, freq: 1700, q: 0.8, gain: 0.55, type: 'lowpass' });
        this.tone({ wave: 'square', from: 150, to: 55, dur: 0.12, gain: 0.3 });
        this.tone({ wave: 'sawtooth', from: 260, to: 150, dur: 0.16, gain: 0.12, delay: 0.04, vibrato: 30 });
        break;
      case 'attack.clang':
        this.tone({ wave: 'triangle', from: 1320, to: 1300, dur: 0.22, gain: 0.2 });
        this.tone({ wave: 'square', from: 1987, to: 1960, dur: 0.14, gain: 0.07 });
        this.noiseHit({ dur: 0.03, freq: 4000, q: 1, gain: 0.3, type: 'highpass' });
        break;
      case 'enemy.alerted':
        this.tone({ wave: 'sawtooth', from: 210, to: 340, dur: 0.16, gain: 0.2, vibrato: 40, filter: 1400 });
        this.tone({ wave: 'sawtooth', from: 340, to: 170, dur: 0.24, gain: 0.2, delay: 0.16, vibrato: 50, filter: 1400 });
        break;
      case 'enemy.telegraph':
        this.tone({ wave: 'sawtooth', from: 95, to: 190, dur: 0.42, gain: 0.22, vibrato: 18, filter: 900, attack: 0.2 });
        break;
      case 'enemy.attack.hit':
        this.noiseHit({ dur: 0.12, freq: 900, q: 0.7, gain: 0.6, type: 'lowpass' });
        this.tone({ wave: 'square', from: 170, to: 60, dur: 0.22, gain: 0.35 });
        break;
      case 'enemy.attack.miss':
        this.noiseHit({ dur: 0.18, freq: 1800, to: 500, q: 2, gain: 0.3, type: 'bandpass', attack: 0.03 });
        break;
      case 'enemy.died':
        this.tone({ wave: 'sawtooth', from: 300, to: 55, dur: 0.6, gain: 0.25, vibrato: 60, filter: 1200 });
        this.noiseHit({ dur: 0.2, freq: 240, q: 0.7, gain: 0.4, type: 'lowpass', delay: 0.45 });
        break;
      case 'door.opened':
        this.noiseHit({ dur: 0.55, freq: 160, to: 260, q: 1.2, gain: 0.7, type: 'lowpass', attack: 0.08 });
        this.tone({ wave: 'sawtooth', from: 48, to: 62, dur: 0.55, gain: 0.16, vibrato: 9, filter: 300 });
        break;
      case 'door.closed':
        this.noiseHit({ dur: 0.35, freq: 240, to: 150, q: 1.2, gain: 0.6, type: 'lowpass', attack: 0.05 });
        this.tone({ wave: 'sine', from: 90, to: 38, dur: 0.2, gain: 0.6, delay: 0.3 });
        break;
      case 'encounter.cleared':
        [262, 330, 392, 523].forEach((f, i) => this.tone({ wave: 'square', from: f, to: f, dur: 0.16, gain: 0.1, delay: 0.5 + i * 0.13, filter: 2200 }));
        break;
      case 'party.died':
        [220, 185, 147, 110].forEach((f, i) => this.tone({ wave: 'triangle', from: f, to: f * 0.97, dur: 0.4, gain: 0.22, delay: i * 0.3 }));
        break;
      case 'door.locked':
        this.noiseHit({ dur: 0.04, freq: 2600, q: 3, gain: 0.3, type: 'bandpass' });
        this.noiseHit({ dur: 0.05, freq: 1900, q: 3, gain: 0.3, type: 'bandpass', delay: 0.09 });
        this.tone({ wave: 'sine', from: 95, to: 70, dur: 0.1, gain: 0.3, delay: 0.09 });
        break;
      case 'door.unlocked':
        this.noiseHit({ dur: 0.03, freq: 3200, q: 4, gain: 0.3, type: 'bandpass' });
        this.tone({ wave: 'triangle', from: 880, to: 860, dur: 0.07, gain: 0.12, delay: 0.05 });
        this.tone({ wave: 'sine', from: 130, to: 60, dur: 0.16, gain: 0.5, delay: 0.14 });
        break;
      case 'wall.cracked':
        // A crunch of stone, and grit pattering down after it.
        this.noiseHit({ dur: 0.22, freq: 700, to: 250, q: 0.9, gain: 0.9, type: 'lowpass' });
        this.tone({ wave: 'sine', from: 95, to: 45, dur: 0.25, gain: 0.55 });
        for (let i = 0; i < 6; i++) this.noiseHit({ dur: 0.025, freq: 2400 + i * 300, q: 5, gain: 0.18, type: 'bandpass', delay: 0.18 + i * 0.07 });
        break;
      case 'wall.broken':
        // The wall comes down: a long rumble, a crash, then rubble settling.
        this.noiseHit({ dur: 1.3, freq: 160, to: 80, q: 0.8, gain: 1, type: 'lowpass', attack: 0.02 });
        this.tone({ wave: 'sine', from: 70, to: 30, dur: 1, gain: 0.7 });
        for (let i = 0; i < 14; i++) this.noiseHit({ dur: 0.04, freq: 900 + ((i * 431) % 1600), q: 3, gain: 0.25, type: 'bandpass', delay: 0.3 + i * 0.09 });
        [392, 466, 587].forEach((f, i) => this.tone({ wave: 'triangle', from: f, to: f, dur: 0.35, gain: 0.1, delay: 1 + i * 0.16 }));
        break;
      case 'wall.held':
        this.noiseHit({ dur: 0.06, freq: 1600, q: 1.5, gain: 0.35, type: 'bandpass' });
        this.tone({ wave: 'triangle', from: 300, to: 220, dur: 0.07, gain: 0.15 });
        break;
      case 'wall.inspected':
        for (let i = 0; i < 5; i++) this.noiseHit({ dur: 0.03, freq: 2600 + i * 250, q: 5, gain: 0.12, type: 'bandpass', delay: i * 0.09 });
        break;
      case 'secret.found':
        this.noiseHit({ dur: 0.9, freq: 110, to: 220, q: 1.4, gain: 0.8, type: 'lowpass', attack: 0.15 });
        [392, 466, 587].forEach((f, i) => this.tone({ wave: 'triangle', from: f, to: f, dur: 0.35, gain: 0.1, delay: 0.5 + i * 0.16 }));
        break;
      case 'chest.opened':
        this.tone({ wave: 'sawtooth', from: 70, to: 120, dur: 0.3, gain: 0.14, vibrato: 12, filter: 500, attack: 0.05 });
        this.noiseHit({ dur: 0.08, freq: 500, q: 0.8, gain: 0.35, type: 'lowpass', delay: 0.28 });
        break;
      case 'item.gained':
        [1047, 1319, 1568].forEach((f, i) => this.tone({ wave: 'square', from: f, to: f, dur: 0.09, gain: 0.07, delay: 0.3 + i * 0.07, filter: 3000 }));
        break;
      case 'item.used':
        [300, 260, 300, 260].forEach((f, i) => this.tone({ wave: 'sine', from: f, to: f * 0.8, dur: 0.07, gain: 0.2, delay: i * 0.09 }));
        [523, 659, 784, 1047].forEach((f, i) => this.tone({ wave: 'triangle', from: f, to: f, dur: 0.22, gain: 0.08, delay: 0.4 + i * 0.08 }));
        break;
      case 'item.refused':
        this.tone({ wave: 'square', from: 160, to: 150, dur: 0.07, gain: 0.08, filter: 800 });
        break;
      case 'encounter.started':
        this.tone({ wave: 'sine', from: 70, to: 40, dur: 0.5, gain: 0.6 });
        this.noiseHit({ dur: 0.25, freq: 180, q: 0.8, gain: 0.5, type: 'lowpass' });
        break;
      case 'quest.objective':
        [659, 880].forEach((f, i) => this.tone({ wave: 'triangle', from: f, to: f, dur: 0.2, gain: 0.1, delay: 0.55 + i * 0.12 }));
        break;
      case 'quest.completed':
        [392, 523, 659, 784, 1047].forEach((f, i) => this.tone({ wave: 'square', from: f, to: f, dur: i === 4 ? 0.7 : 0.18, gain: 0.1, delay: 1.4 + i * 0.16, filter: 2400 }));
        [196, 262].forEach((f, i) => this.tone({ wave: 'triangle', from: f, to: f, dur: 0.9, gain: 0.14, delay: 1.4 + i * 0.64 }));
        break;
      case 'interact.nothing':
        this.tone({ wave: 'square', from: 180, to: 170, dur: 0.05, gain: 0.08, filter: 900 });
        break;
    }
  }

  private tone(o: { wave: Wave; from: number; to: number; dur: number; gain: number; delay?: number; vibrato?: number; filter?: number; attack?: number }) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.wave;
    osc.frequency.setValueAtTime(o.from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 26;
      depth.gain.value = o.vibrato;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + o.dur + 0.05);
    }
    const gain = ctx.createGain();
    const attack = o.attack ?? 0.005;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(o.gain * this.level, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node: AudioNode = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.filter;
      node = osc.connect(f);
    }
    node.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
  }

  private noiseHit(o: { dur: number; freq: number; to?: number; q: number; gain: number; type: BiquadFilterType; delay?: number; attack?: number }) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = o.type;
    filter.Q.value = o.q;
    filter.frequency.setValueAtTime(o.freq, t0);
    if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(o.gain * this.level, t0 + (o.attack ?? 0.004));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0, (t0 * 0.37) % 1.5);
    src.stop(t0 + o.dur + 0.05);
  }

  /** The dead make dry sounds: a rattle on waking, a clatter on falling. True if this event was voiced here. */
  private bones(event: GameEvent): boolean {
    const rattle = (count: number, start: number, gap: number, gain: number) => {
      for (let i = 0; i < count; i++) {
        this.noiseHit({ dur: 0.03, freq: 1800 + ((i * 617) % 1400), q: 6, gain, type: 'bandpass', delay: start + i * gap + ((i * 37) % 11) / 400 });
      }
    };
    switch (event.type) {
      case 'enemy.alerted':
        rattle(9, 0, 0.045, 0.4);
        this.tone({ wave: 'sine', from: 90, to: 70, dur: 0.5, gain: 0.12, attack: 0.2 });
        return true;
      case 'enemy.telegraph':
        // A long dry creak as the arm goes back.
        this.tone({ wave: 'sawtooth', from: 150, to: 260, dur: 0.4, gain: 0.1, vibrato: 45, filter: 1800, attack: 0.15 });
        rattle(3, 0.05, 0.1, 0.2);
        return true;
      case 'enemy.interrupted':
        rattle(5, 0, 0.03, 0.45);
        return true;
      case 'enemy.died':
        rattle(14, 0, 0.04, 0.5);
        this.noiseHit({ dur: 0.2, freq: 260, q: 0.7, gain: 0.35, type: 'lowpass', delay: 0.5 });
        return true;
      default:
        return false;
    }
  }

  /** The place's own quiet: a mine's rumble and drips, or a crypt's cold hum and distant knocks. */
  private startAmbience(environment: Environment) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 130;
    const gain = ctx.createGain();
    gain.gain.value = 0.22;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();

    if (environment === 'crypt') {
      // Two low notes a hair apart, beating slowly against each other.
      filter.frequency.value = 90;
      gain.gain.value = 0.14;
      for (const hz of [55, 55.7]) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = hz;
        const g = ctx.createGain();
        g.gain.value = 0.05;
        osc.connect(g).connect(this.master);
        osc.start();
      }
    }

    let n = 0;
    const drip = () => {
      n++;
      this.level = 1;
      if (environment === 'crypt') {
        // Something settling, a long way off.
        this.noiseHit({ dur: 0.12, freq: 220 + ((n * 53) % 120), q: 1.2, gain: 0.07, type: 'lowpass' });
        this.tone({ wave: 'sine', from: 110, to: 70, dur: 0.3, gain: 0.04 });
      } else {
        const pitch = 900 + ((n * 137) % 500);
        this.tone({ wave: 'sine', from: pitch * 1.5, to: pitch, dur: 0.09, gain: 0.05 });
        this.tone({ wave: 'sine', from: pitch * 1.1, to: pitch * 0.8, dur: 0.12, gain: 0.02, delay: 0.16 });
      }
      this.dripTimer = setTimeout(drip, (environment === 'crypt' ? 5000 : 2500) + ((n * 2971) % 6000));
    };
    this.dripTimer = setTimeout(drip, 3000);
  }
}

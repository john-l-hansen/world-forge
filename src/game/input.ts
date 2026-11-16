/**
 * Input: turns keys and on-screen buttons into simulation commands.
 * The key map is plain data, so controls can be made configurable later.
 */
import type { Command, MoveDir } from '../engine/types';

export type Action = 'forward' | 'back' | 'strafeLeft' | 'strafeRight' | 'turnLeft' | 'turnRight' | 'attack' | 'heavy' | 'dodge' | 'interact';

export const DEFAULT_KEYMAP: Record<string, Action> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'strafeLeft',
  KeyD: 'strafeRight',
  KeyQ: 'turnLeft',
  ArrowLeft: 'turnLeft',
  KeyE: 'turnRight',
  ArrowRight: 'turnRight',
  KeyJ: 'attack',
  KeyK: 'heavy',
  Space: 'dodge',
  KeyF: 'interact',
  Enter: 'interact',
};

/** Actions that repeat while their key is held. */
const REPEATING: ReadonlySet<Action> = new Set<Action>(['forward', 'back', 'strafeLeft', 'strafeRight', 'turnLeft', 'turnRight', 'attack']);

export function commandFor(action: Action, actor: string): Command {
  switch (action) {
    case 'forward':
      return { type: 'move', actor, dir: 'forward' };
    case 'back':
      return { type: 'move', actor, dir: 'back' };
    case 'strafeLeft':
      return { type: 'move', actor, dir: 'left' };
    case 'strafeRight':
      return { type: 'move', actor, dir: 'right' };
    case 'turnLeft':
      return { type: 'turn', actor, dir: 'left' };
    case 'turnRight':
      return { type: 'turn', actor, dir: 'right' };
    case 'attack':
      return { type: 'attack', actor, kind: 'light' };
    case 'heavy':
      return { type: 'attack', actor, kind: 'heavy' };
    case 'dodge':
      // The game fills in the direction from whichever way the player is steering.
      return { type: 'dodge', actor };
    case 'interact':
      return { type: 'interact', actor };
  }
}

const STEP_OF: Partial<Record<Action, MoveDir>> = { forward: 'forward', back: 'back', strafeLeft: 'left', strafeRight: 'right' };

export class InputState {
  /** Held actions, most recent last. */
  private held: Action[] = [];
  /** Fresh presses waiting to be sent, oldest first. */
  private pressed: Action[] = [];

  press(action: Action) {
    if (!this.held.includes(action)) this.held.push(action);
    this.pressed.push(action);
    if (this.pressed.length > 3) this.pressed.shift();
  }

  release(action: Action) {
    this.held = this.held.filter((a) => a !== action);
  }

  /** A single tap, as from an on-screen button. */
  tap(action: Action) {
    this.pressed.push(action);
    if (this.pressed.length > 3) this.pressed.shift();
  }

  clear() {
    this.held = [];
    this.pressed = [];
  }

  /** The step direction currently held, most recent first, if any. */
  heldMove(): MoveDir | null {
    for (let i = this.held.length - 1; i >= 0; i--) {
      const dir = STEP_OF[this.held[i]];
      if (dir) return dir;
    }
    return null;
  }

  /**
   * The action to send this tick, if any. Fresh presses go first; a held
   * key only repeats when the party is free to act on it.
   */
  next(partyFree: boolean): Action | null {
    const fresh = this.pressed.shift();
    if (fresh) return fresh;
    if (!partyFree) return null;
    for (let i = this.held.length - 1; i >= 0; i--) if (REPEATING.has(this.held[i])) return this.held[i];
    return null;
  }
}

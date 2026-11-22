/**
 * The mine palette: earthy browns, dark greys, rust and torchlight orange.
 * Every texture and sprite draws only from these ramps (dark to light).
 */
import type { Ramp } from './pixel';

export const INK = 0x0b0a0c;

export const STONE: Ramp = [0x191513, 0x29221e, 0x3a312a, 0x4e4237, 0x655746, 0x7d6d58, 0x96856b];
export const WOOD: Ramp = [0x1c120b, 0x30200f, 0x473016, 0x60421e, 0x7b5629, 0x966c36];
export const RUST: Ramp = [0x351710, 0x532512, 0x733718, 0x924d22];
export const DIRT: Ramp = [0x15110d, 0x211a14, 0x2f251b, 0x3f3223, 0x51412e];
export const IRON: Ramp = [0x17171b, 0x282930, 0x3d3f48, 0x585b66, 0x7e828e, 0xa9adb8];
export const GOBLIN: Ramp = [0x1c2710, 0x2f4219, 0x466223, 0x62842f, 0x86a845];
export const HIDE: Ramp = [0x2a1a10, 0x422a17, 0x5d3d20, 0x7a542d];
export const FLAME: Ramp = [0x7a2408, 0xc24a14, 0xf08a24, 0xffc24a, 0xfff2a8];
export const SKIN: Ramp = [0x4a2c1c, 0x6b432b, 0x90603d, 0xb38053, 0xd4a374];
export const HAIR: Ramp = [0x160f0b, 0x2a1b12, 0x432b1a];
export const GOLD: Ramp = [0x5e4010, 0x9a701c, 0xcfa436, 0xf0d878];
export const BLOOD: Ramp = [0x3d0b0b, 0x6e1212, 0xa01e1e];
/** Blood as it ages: near-black clot, drying brown-red, fresh arterial red. */
export const GORE: Ramp = [0x1a0404, 0x3d0b0b, 0x5c1010, 0x841818, 0xa82620];
/** Opened flesh and what is inside it. */
export const FLESH: Ramp = [0x4a1616, 0x76302a, 0x9c4c3e, 0xc0705a];
export const BONE = 0xd8cfb4;
export const EYE_YELLOW = 0xf2d23a;
export const EYE_RED = 0xe0401c;

export const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

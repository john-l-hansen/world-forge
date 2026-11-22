/**
 * One set of dungeon textures per environment. Every set fills the same ten
 * slots, so the renderer can dress any cell from any set.
 */
import type { Environment } from '../schema/world';
import { ashlarWall, bronzeDoor, cryptSecretWall, flagFloor, nicheWall, stoneFrame, vaultCeiling } from './crypt';
import { crackedWall } from './cracks';
import type { Pix } from './pixel';
import { dirtFloor, lockedDoor, plankDoor, rockCeiling, secretWall, stoneWall, timberFrame, timberWall } from './textures';

/** Add the three stages of a breakable wall, drawn over the set's own wall. */
const withCracks = (tiles: Pix[]) => [...tiles, crackedWall(tiles[0], 0), crackedWall(tiles[0], 1), crackedWall(tiles[0], 2)];

/**
 * Slot order: wall A, wall B, feature wall, floor A, ceiling, door, doorway frame, floor B, secret wall,
 * locked door, then a breakable wall as it first looks, after one blow and after two.
 */
export const TILESETS: Record<Environment, () => Pix[]> = {
  mine: () => withCracks([stoneWall(1), stoneWall(2), timberWall(3), dirtFloor(4), rockCeiling(5), plankDoor(6), timberFrame(7), dirtFloor(8), secretWall(1), lockedDoor(6)]),
  crypt: () =>
    withCracks([ashlarWall(1), ashlarWall(2), nicheWall(3), flagFloor(4), vaultCeiling(5), bronzeDoor(6), stoneFrame(7), flagFloor(8), cryptSecretWall(1), bronzeDoor(6, true)]),
};

/** How often a wall face shows the set's feature wall (timber props, burial niches). */
export const FEATURE_SHARE: Record<Environment, number> = { mine: 0.34, crypt: 0.22 };

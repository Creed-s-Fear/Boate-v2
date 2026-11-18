/**
 * Game data for Jack of Hearts (PeekHole rules adapted to the club's 3 rooms).
 * Coordinates in metres, glTF/three axes (Y up), same as blender/layout.json:
 *   hall (club)     x -6..6,     z -12..12   — bar east, booths west, stage south
 *   corridor        x -1..1,     z -16.3..-12
 *   suite (spa)     x -9.1..0.9, z -26.45..-16.3 — jacuzzi at centre (-4.1; -21.45)
 * Everything the game needs from the scene (interaction points, seats, NPC areas,
 * routes) lives here, separate from the rules (game.ts) and the geometry (GLB).
 */
import type { AABB } from './collision2d';

export type ZoneId = 'club' | 'corridor' | 'spa';
export type RoomId = 'suite';
export const ROOM_IDS: readonly RoomId[] = ['suite'];
export const ROOM_LABEL: Record<RoomId, string> = { suite: 'Jacuzzi Suite' };

export interface Zone extends AABB {
  id: ZoneId;
  name: string;
}

export const ZONES: Zone[] = [
  { id: 'corridor', name: 'Corridor', minX: -1.2, maxX: 1.2, minZ: -16.35, maxZ: -12.05 },
  { id: 'club', name: 'Jack of Hearts', minX: -6.2, maxX: 6.2, minZ: -12.05, maxZ: 12.4 },
  { id: 'spa', name: 'Jacuzzi Suite', minX: -9.2, maxX: 1, minZ: -26.6, maxZ: -16.35 },
];

export function zoneAt(x: number, z: number): Zone | null {
  for (const zone of ZONES) {
    if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) return zone;
  }
  return null;
}

const T = 0.12; // half wall thickness for minimap and NPC collision
const wallX = (z: number, x0: number, x1: number): AABB => ({ minX: x0, maxX: x1, minZ: z - T, maxZ: z + T });
const wallZ = (x: number, z0: number, z1: number): AABB => ({ minX: x - T, maxX: x + T, minZ: z0, maxZ: z1 });

/** Room outlines (with doorway gaps): minimap and wandering NPC bounds. */
export const WALLS: AABB[] = [
  // hall: entrance south (x -1..1) and corridor north (x -1..1)
  wallX(12.25, -6.25, -1.03), wallX(12.25, 1.03, 6.25),
  wallX(-12.25, -6.25, -1.03), wallX(-12.25, 1.03, 6.25),
  wallZ(-6.25, -12.25, 12.25), wallZ(6.25, -12.25, 12.25),
  // corridor
  wallZ(-1.1, -16.45, -12.25), wallZ(1.1, -16.45, -12.25),
  // suite: door in the middle of the north wall (x -0.53..0.53)
  wallX(-16.45, -9.1, -0.55), wallX(-16.45, 0.55, 0.9),
  wallX(-26.45, -9.1, 0.9),
  wallZ(-9.1, -26.45, -16.45), wallZ(0.9, -26.45, -16.45),
];

export const MAP_BOUNDS = { minX: -10, maxX: 7.2, minZ: -27.2, maxZ: 13 };

export const RECTS = {
  /** dance floor: under the mirror ball, between the booths and the bar stools */
  danceFloor: { minX: -2.2, maxX: 1.9, minZ: -7.6, maxZ: -0.8 },
  danceSpots: { minX: -1.8, maxX: 1.5, minZ: -7.2, maxZ: -1.2 },
  clubWander: { minX: -2.1, maxX: 1.7, minZ: -9, maxZ: 7.8 },
} satisfies Record<string, AABB>;

/** Hostess areas (wander or dance until invited). */
export const HOSTESS_AREAS: Array<{ area: AABB; mode: 'wander' | 'dance' }> = [
  { area: { minX: -2, maxX: 1.4, minZ: 3.6, maxZ: 7.8 }, mode: 'wander' },
  { area: RECTS.danceSpots, mode: 'dance' },
  { area: { minX: -2, maxX: 1.5, minZ: -9.2, maxZ: -4.5 }, mode: 'wander' },
  { area: { minX: -1.4, maxX: 1.2, minZ: -6, maxZ: -2 }, mode: 'dance' },
];

/** Interaction points (on the floor). */
export const SPOTS = {
  reception: { x: 1.75, z: 10.85 }, // entrance terminal
  bouncer: { x: -0.85, z: -10.75 },
  // at the counter, between the stools: standing here orders at the bar; near a stool, sits
  bar: [{ x: 3.05, z: -2.5 }, { x: 3.05, z: 2.5 }],
  vipBar: { x: -3.35, z: -24.85 }, // suite sideboard
  suitePanel: { x: -1.3, z: -17.1 },
};

/** Fixed NPC positions and facing. yaw: front = (sin yaw, cos yaw). */
export const STAFF = {
  reception: { x: 0.55, z: 11.35, yaw: Math.PI },
  bouncer: { x: -0.85, z: -11.1, yaw: 0 },
  barA: { x: 4.6, z: -3.4 },
  barB: { x: 4.6, z: 3.4 },
  cage: { x: 4.55, z: -10.3, yaw: -0.6 },
  stage: { x: 3.95, z: 9.55, yaw: Math.PI * 0.82 },
  vipBar: { x: -3.35, z: -25.55, yaw: 0 },
};

export interface SeatDef {
  id: string;
  x: number;
  z: number;
  /** seated body front: (sin yaw, cos yaw) */
  yaw: number;
  exit: { x: number; z: number };
  /** seat height above the floor */
  height: number;
  pose: 'sit' | 'perch';
  vip?: boolean;
  reach?: number;
}

const E = Math.PI / 2;
export const SEATS: SeatDef[] = [];
// curtain booths (curved sofa facing east, table in front)
for (const z of [6.4, 0.4, -5.6]) {
  SEATS.push({ id: `booth${z}a`, x: -4.72, z: z - 0.62, yaw: E, exit: { x: -2.75, z: z - 1.05 }, height: 0.45, pose: 'sit', reach: 2.3 });
  SEATS.push({ id: `booth${z}b`, x: -4.72, z: z + 0.62, yaw: E, exit: { x: -2.75, z: z + 1.05 }, height: 0.45, pose: 'sit', reach: 2.3 });
}
// bar stools (facing the counter, east)
[[2.72, -4.4], [2.94, -3.143], [2.72, -1.886], [2.94, -0.629], [2.72, 0.629], [2.94, 1.886], [2.72, 3.143], [2.94, 4.4]].forEach(([x, z], i) => {
  SEATS.push({ id: `stool${i}`, x, z, yaw: E, exit: { x: 1.75, z }, height: 0.84, pose: 'perch' });
});
// armchair corner (north)
SEATS.push({ id: 'armchair-w', x: -5.0, z: -9.5, yaw: E, exit: { x: -4.2, z: -8.3 }, height: 0.45, pose: 'sit' });
SEATS.push({ id: 'armchair-s', x: -4.0, z: -10.7, yaw: 0, exit: { x: -2.7, z: -10.2 }, height: 0.45, pose: 'sit' });
// round bed behind the bead curtain: VIP pass exclusive
SEATS.push({ id: 'vip-bed', x: -4.1, z: 10.0, yaw: Math.PI * 0.75, exit: { x: -1.75, z: 10.15 }, height: 0.6, pose: 'sit', vip: true, reach: 2.4 });
// suite sofas (against the west wall, facing the jacuzzi)
for (const z of [-18.85, -24.05]) {
  SEATS.push({ id: `suite-sofa${z}a`, x: -8.25, z: z - 0.6, yaw: E, exit: { x: -7.2, z: z - 0.6 }, height: 0.45, pose: 'sit' });
  SEATS.push({ id: `suite-sofa${z}b`, x: -8.25, z: z + 0.6, yaw: E, exit: { x: -7.2, z: z + 0.6 }, height: 0.45, pose: 'sit' });
}

/** Hostess route to the suite (through the middle of the hall, around the hologram). */
export const SUITE_ROUTE = {
  lane: 0.7, // free lane on the hall floor (x)
  hall: { x: 0.7, z: -9.6 },
  corridorIn: { x: 0, z: -12.6 },
  doorOut: { x: 0, z: -15.7 }, // before the door (corridor side)
  doorIn: { x: 0, z: -17.2 },
  stay: { x: -1.1, z: -18.3, yaw: Math.atan2(-3.0, -3.15) }, // near the door, facing the jacuzzi
};

export const SUITE_CENTER = { x: -4.1, z: -21.45 };

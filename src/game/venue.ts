/**
 * Dados de jogo do Jack of Hearts (as regras do PeekHole adaptadas às 3 salas do boate).
 * Coordenadas em metros, eixos do glTF/three (Y para cima), as mesmas de blender/layout.json:
 *   salão (club)   x -6..6,     z -12..12   — bar a leste, cabines a oeste, palco ao sul
 *   corredor       x -1..1,     z -16,3..-12
 *   suíte (spa)    x -9,1..0,9, z -26,45..-16,3 — jacuzzi no centro (-4,1; -21,45)
 * Tudo que o jogo precisa saber do cenário (pontos de interação, assentos, áreas dos NPCs,
 * rotas) fica aqui, separado das regras (game.ts) e da geometria (GLB).
 */
import type { AABB } from './collision2d';

export type ZoneId = 'club' | 'corridor' | 'spa';
export type RoomId = 'suite';
export const ROOM_IDS: readonly RoomId[] = ['suite'];
export const ROOM_LABEL: Record<RoomId, string> = { suite: 'Suíte Jacuzzi' };

export interface Zone extends AABB {
  id: ZoneId;
  name: string;
}

export const ZONES: Zone[] = [
  { id: 'corridor', name: 'Corredor', minX: -1.2, maxX: 1.2, minZ: -16.35, maxZ: -12.05 },
  { id: 'club', name: 'Jack of Hearts', minX: -6.2, maxX: 6.2, minZ: -12.05, maxZ: 12.4 },
  { id: 'spa', name: 'Suíte Jacuzzi', minX: -9.2, maxX: 1, minZ: -26.6, maxZ: -16.35 },
];

export function zoneAt(x: number, z: number): Zone | null {
  for (const zone of ZONES) {
    if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) return zone;
  }
  return null;
}

const T = 0.12; // meia espessura das paredes no minimapa e na colisão dos NPCs
const wallX = (z: number, x0: number, x1: number): AABB => ({ minX: x0, maxX: x1, minZ: z - T, maxZ: z + T });
const wallZ = (x: number, z0: number, z1: number): AABB => ({ minX: x - T, maxX: x + T, minZ: z0, maxZ: z1 });

/** Contorno das salas (com os vãos de passagem): minimapa e limite dos NPCs que circulam. */
export const WALLS: AABB[] = [
  // salão: entrada ao sul (x -1..1) e corredor ao norte (x -1..1)
  wallX(12.25, -6.25, -1.03), wallX(12.25, 1.03, 6.25),
  wallX(-12.25, -6.25, -1.03), wallX(-12.25, 1.03, 6.25),
  wallZ(-6.25, -12.25, 12.25), wallZ(6.25, -12.25, 12.25),
  // corredor
  wallZ(-1.1, -16.45, -12.25), wallZ(1.1, -16.45, -12.25),
  // suíte: porta no meio da parede norte (x -0,53..0,53)
  wallX(-16.45, -9.1, -0.55), wallX(-16.45, 0.55, 0.9),
  wallX(-26.45, -9.1, 0.9),
  wallZ(-9.1, -26.45, -16.45), wallZ(0.9, -26.45, -16.45),
];

export const MAP_BOUNDS = { minX: -10, maxX: 7.2, minZ: -27.2, maxZ: 13 };

export const RECTS = {
  /** pista: embaixo do globo espelhado, entre as cabines e as banquetas do bar */
  danceFloor: { minX: -2.2, maxX: 1.9, minZ: -7.6, maxZ: -0.8 },
  danceSpots: { minX: -1.8, maxX: 1.5, minZ: -7.2, maxZ: -1.2 },
  clubWander: { minX: -2.1, maxX: 1.7, minZ: -9, maxZ: 7.8 },
} satisfies Record<string, AABB>;

/** Áreas das anfitriãs (circulam ou dançam até serem convidadas). */
export const HOSTESS_AREAS: Array<{ area: AABB; mode: 'wander' | 'dance' }> = [
  { area: { minX: -2, maxX: 1.4, minZ: 3.6, maxZ: 7.8 }, mode: 'wander' },
  { area: RECTS.danceSpots, mode: 'dance' },
  { area: { minX: -2, maxX: 1.5, minZ: -9.2, maxZ: -4.5 }, mode: 'wander' },
  { area: { minX: -1.4, maxX: 1.2, minZ: -6, maxZ: -2 }, mode: 'dance' },
];

/** Pontos de interação (no chão). */
export const SPOTS = {
  reception: { x: 1.75, z: 10.85 }, // terminal da entrada
  bouncer: { x: -0.85, z: -10.75 },
  // no balcão, entre as banquetas: de pé ali pede no bar; perto de uma banqueta, senta
  bar: [{ x: 3.05, z: -2.5 }, { x: 3.05, z: 2.5 }],
  vipBar: { x: -3.35, z: -24.85 }, // aparador da suíte
  suitePanel: { x: -1.3, z: -17.1 },
};

/** Onde ficam (e como olham) os NPCs fixos. yaw: frente = (sin yaw, cos yaw). */
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
  /** frente do corpo sentado: (sin yaw, cos yaw) */
  yaw: number;
  exit: { x: number; z: number };
  /** altura do assento acima do piso */
  height: number;
  pose: 'sit' | 'perch';
  vip?: boolean;
  reach?: number;
}

const E = Math.PI / 2;
export const SEATS: SeatDef[] = [];
// cabines de cortina (sofá curvo virado para leste, mesa na frente)
for (const z of [6.4, 0.4, -5.6]) {
  SEATS.push({ id: `booth${z}a`, x: -4.72, z: z - 0.62, yaw: E, exit: { x: -2.75, z: z - 1.05 }, height: 0.45, pose: 'sit', reach: 2.3 });
  SEATS.push({ id: `booth${z}b`, x: -4.72, z: z + 0.62, yaw: E, exit: { x: -2.75, z: z + 1.05 }, height: 0.45, pose: 'sit', reach: 2.3 });
}
// banquetas do bar (de frente para o balcão, a leste)
[[2.72, -4.4], [2.94, -3.143], [2.72, -1.886], [2.94, -0.629], [2.72, 0.629], [2.94, 1.886], [2.72, 3.143], [2.94, 4.4]].forEach(([x, z], i) => {
  SEATS.push({ id: `stool${i}`, x, z, yaw: E, exit: { x: 1.75, z }, height: 0.84, pose: 'perch' });
});
// canto das poltronas (ao norte)
SEATS.push({ id: 'armchair-w', x: -5.0, z: -9.5, yaw: E, exit: { x: -4.2, z: -8.3 }, height: 0.45, pose: 'sit' });
SEATS.push({ id: 'armchair-s', x: -4.0, z: -10.7, yaw: 0, exit: { x: -2.7, z: -10.2 }, height: 0.45, pose: 'sit' });
// cama redonda atrás da cortina de fios: exclusiva do passe VIP
SEATS.push({ id: 'vip-bed', x: -4.1, z: 10.0, yaw: Math.PI * 0.75, exit: { x: -1.75, z: 10.15 }, height: 0.6, pose: 'sit', vip: true, reach: 2.4 });
// sofás da suíte (encostados na parede oeste, de frente para a jacuzzi)
for (const z of [-18.85, -24.05]) {
  SEATS.push({ id: `suite-sofa${z}a`, x: -8.25, z: z - 0.6, yaw: E, exit: { x: -7.2, z: z - 0.6 }, height: 0.45, pose: 'sit' });
  SEATS.push({ id: `suite-sofa${z}b`, x: -8.25, z: z + 0.6, yaw: E, exit: { x: -7.2, z: z + 0.6 }, height: 0.45, pose: 'sit' });
}

/** Caminho da anfitriã até a suíte (pelo meio do salão, desviando do holograma). */
export const SUITE_ROUTE = {
  lane: 0.7, // faixa livre no salão (x)
  hall: { x: 0.7, z: -9.6 },
  corridorIn: { x: 0, z: -12.6 },
  doorOut: { x: 0, z: -15.7 }, // antes da porta (do lado do corredor)
  doorIn: { x: 0, z: -17.2 },
  stay: { x: -1.1, z: -18.3, yaw: Math.atan2(-3.0, -3.15) }, // perto da porta, de frente para a jacuzzi
};

export const SUITE_CENTER = { x: -4.1, z: -21.45 };

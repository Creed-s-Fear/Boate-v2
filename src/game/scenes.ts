/**
 * Scene definitions (cutscenes) for private rooms.
 * Each SceneBuilder receives the context (positions) and returns an array of steps.
 *
 * Scenes are placeholders using the existing low-poly pose system.
 * Once the GLTF models are ready, swap the pose steps for GLTF animation
 * steps and adjust the cameras.
 */
import type { SceneBuilder, SceneContext, Vec3 } from './cutscene';

// ================================================================ Camera helpers
//
// Cameras are positioned relative to the room: f points from the hostess toward the
// center of the room (inward) and r is the side axis. This keeps the camera inside
// every room, instead of always at +Z (which in the club's suite fell in the corridor).

type Cam = { pos: Vec3; lookAt: Vec3; fov?: number };

function cams(ctx: SceneContext) {
  const dx = ctx.roomCenter.x - ctx.hostessPos.x;
  const dz = ctx.roomCenter.z - ctx.hostessPos.z;
  const l = Math.hypot(dx, dz) || 1;
  const f = { x: dx / l, z: dz / l };
  const r = { x: -f.z, z: f.x };
  const at = (p: Vec3, ff: number, rr: number, h: number) => ({ x: p.x + f.x * ff + r.x * rr, y: h, z: p.z + f.z * ff + r.z * rr });
  return {
    behind: (pos: Vec3, dist: number, h: number, fov?: number): Cam => ({ pos: at(pos, dist, 0, h), lookAt: { x: pos.x, y: h * 0.75, z: pos.z }, fov }),
    side: (pos: Vec3, dist: number, h: number, fov?: number): Cam => ({ pos: at(pos, Math.abs(dist) * 0.4, dist, h), lookAt: { x: pos.x, y: h * 0.75, z: pos.z }, fov }),
    closeUp: (pos: Vec3, h: number, fov?: number): Cam => ({ pos: at(pos, 1.3, 0.9, h), lookAt: { x: pos.x, y: h - 0.1, z: pos.z }, fov }),
    wide: (center: Vec3, dist: number, h: number, fov?: number): Cam => ({ pos: at(center, dist * 0.75, dist * 0.35, h), lookAt: { x: center.x, y: h * 0.6, z: center.z }, fov }),
  };
}

// ================================================================ Scenes

/** Private dance — camera orbits while she dances. */
export const privateDance: SceneBuilder = (ctx) => {
  const { behind, side, closeUp } = cams(ctx);
  return [
  { type: 'fade', opacity: 1, duration: 0.3 },
  { type: 'pose', target: 'player', pose: 'sit' },
  { type: 'pose', target: 'hostess', pose: 'idle' },
  { type: 'camera', to: behind(ctx.hostessPos, 3, 1.8), duration: 0.01 },
  { type: 'fade', opacity: 0, duration: 0.6 },
  { type: 'dialogue', speaker: '♪', text: 'The music shifts to something more captivating...', auto: 2.5 },
  { type: 'camera', to: side(ctx.hostessPos, 2.5, 1.6), duration: 2 },
  { type: 'pose', target: 'hostess', pose: 'dance' },
  { type: 'dialogue', speaker: '', text: 'She starts dancing slowly to the beat.', auto: 3 },
  { type: 'camera', to: closeUp(ctx.hostessPos, 1.5, 55), duration: 3 },
  { type: 'wait', duration: 3 },
  { type: 'camera', to: behind(ctx.hostessPos, 2.2, 1.4), duration: 2.5 },
  { type: 'wait', duration: 3 },
  { type: 'camera', to: side(ctx.hostessPos, -2, 1.3), duration: 2 },
  { type: 'wait', duration: 2 },
  { type: 'fade', opacity: 1, duration: 0.5 },
  { type: 'pose', target: 'hostess', pose: 'idle' },
  { type: 'wait', duration: 0.3 },
  { type: 'fade', opacity: 0, duration: 0.5 },
  ];
};

/** Intimate room chat — choices and reactions. */
export const roomChat: SceneBuilder = (ctx) => {
  const { behind, closeUp, wide } = cams(ctx);
  const mid: Vec3 = {
    x: (ctx.hostessPos.x + ctx.playerPos.x) / 2,
    y: 0,
    z: (ctx.hostessPos.z + ctx.playerPos.z) / 2,
  };
  return [
    { type: 'camera', to: wide(mid, 2.5, 1.6), duration: 1.2, ease: 'easeOut' },
    { type: 'dialogue', speaker: '', text: 'You settle in and start talking.' },
    { type: 'choice', prompt: 'What to talk about?', options: [
      { label: 'Ask about her', value: 'about' },
      { label: 'Pay a compliment', value: 'compliment' },
      { label: 'Comfortable silence', value: 'silence' },
    ] },
    { type: 'camera', to: closeUp(ctx.hostessPos, 1.5), duration: 1.5 },
    { type: 'dialogue', speaker: '', text: 'She smiles and leans in a little closer.', auto: 2.5 },
    { type: 'camera', to: behind(ctx.playerPos, 2, 1.6), duration: 1.5 },
    { type: 'wait', duration: 1 },
  ];
};

/** Champagne toast — cinematic cut. */
export const champagne: SceneBuilder = (ctx) => {
  const { closeUp, wide } = cams(ctx);
  const mid: Vec3 = {
    x: (ctx.hostessPos.x + ctx.playerPos.x) / 2,
    y: 0,
    z: (ctx.hostessPos.z + ctx.playerPos.z) / 2,
  };
  return [
    { type: 'fade', opacity: 1, duration: 0.3 },
    { type: 'camera', to: wide(mid, 2, 1.4), duration: 0.01 },
    { type: 'fade', opacity: 0, duration: 0.5 },
    { type: 'dialogue', speaker: '🥂', text: 'The champagne arrives. You toast.', auto: 3 },
    { type: 'camera', to: closeUp(ctx.hostessPos, 1.5, 50), duration: 2, ease: 'easeInOut' },
    { type: 'dialogue', speaker: '', text: 'She laughs, takes a sip, and looks at you over the rim of the glass.', auto: 3 },
    { type: 'camera', to: wide(mid, 3, 1.7, 65), duration: 2 },
    { type: 'wait', duration: 1.5 },
    { type: 'fade', opacity: 1, duration: 0.4 },
    { type: 'fade', opacity: 0, duration: 0.4 },
  ];
};

/** Special night — longer scene with multiple phases. */
export const specialNight: SceneBuilder = (ctx) => {
  const { behind, side, closeUp, wide } = cams(ctx);
  return [
  { type: 'fade', opacity: 1, duration: 0.4 },
  { type: 'pose', target: 'player', pose: 'sit' },
  { type: 'pose', target: 'hostess', pose: 'idle' },
  { type: 'camera', to: wide(ctx.roomCenter, 3.5, 2, 60), duration: 0.01 },
  { type: 'fade', opacity: 0, duration: 0.8 },
  { type: 'dialogue', speaker: '♪', text: 'The lights dim... only the glow of the neon ring remains.', auto: 3.5 },

  // Phase 1: conversation + approach
  { type: 'camera', to: closeUp(ctx.hostessPos, 1.5, 50), duration: 2.5 },
  { type: 'dialogue', speaker: '', text: 'She leans in and whispers something.', auto: 2.5 },
  { type: 'camera', to: side(ctx.hostessPos, -1.5, 1.4, 55), duration: 2 },
  { type: 'wait', duration: 1.5 },

  // Phase 2: dance
  { type: 'dialogue', speaker: '', text: 'She stands up and starts dancing just for you.', auto: 2.5 },
  { type: 'pose', target: 'hostess', pose: 'dance' },
  { type: 'camera', to: behind(ctx.hostessPos, 2.5, 1.5), duration: 3 },
  { type: 'wait', duration: 4 },
  { type: 'camera', to: closeUp(ctx.hostessPos, 1.3, 48), duration: 2.5 },
  { type: 'wait', duration: 3 },
  { type: 'camera', to: side(ctx.hostessPos, 2, 1.2), duration: 2 },
  { type: 'wait', duration: 3 },

  // Phase 3: choice
  { type: 'camera', to: wide(ctx.roomCenter, 2.5, 1.6), duration: 2 },
  { type: 'pose', target: 'hostess', pose: 'idle' },
  { type: 'choice', prompt: 'What now?', options: [
    { label: 'Ask her to keep dancing', value: 'dance' },
    { label: 'Talk up close', value: 'talk' },
    { label: 'Call it a night', value: 'end' },
  ] },

  // Closing
  { type: 'camera', to: wide(ctx.roomCenter, 3, 2, 65), duration: 2 },
  { type: 'dialogue', speaker: '', text: 'The night goes on, at your own pace.', auto: 3 },
  { type: 'fade', opacity: 1, duration: 0.6 },
  { type: 'wait', duration: 0.4 },
  { type: 'pose', target: 'hostess', pose: 'idle' },
  { type: 'pose', target: 'player', pose: 'idle' },
  { type: 'fade', opacity: 0, duration: 0.5 },
  ];
};

// ================================================================ Registry

export const SCENES: Record<string, SceneBuilder> = {
  privateDance,
  roomChat,
  champagne,
  specialNight,
};

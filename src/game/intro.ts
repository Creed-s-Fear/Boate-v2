import type { Entrance } from './entrance';
import type { Pose } from './character';

export const INTRO_SECONDS = 9;

export interface IntroFrame {
  x: number;
  z: number;
  yaw: number;
  pose: Pose;
  cam: { x: number; y: number; z: number };
  look: { x: number; y: number; z: number };
  fov: number;
  fade: number;
  volume: number;
  cutoff: number;
  inside: boolean;
}

function smooth(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class IntroDirector {
  private readonly sx: number;
  private readonly startZ: number;
  private readonly doorZ: number;
  private readonly insideZ: number;
  private readonly eyeY: number;

  constructor(
    entrance: Entrance,
    spawnPos: { x: number; y: number; z: number },
    eyeOffset: number,
    backDist: number,
  ) {
    this.sx = spawnPos.x;
    this.doorZ = entrance.group.position.z;
    this.startZ = this.doorZ + Math.max(backDist, 2) + 2;
    this.insideZ = spawnPos.z;
    this.eyeY = eyeOffset;
  }

  sample(t: number): IntroFrame {
    const FADE_IN: [number, number] = [0, 1.5];
    const WALK_TO: [number, number] = [1.0, 5.5];
    const TRANS_OUT: [number, number] = [4.5, 5.5];
    const TRANS_IN: [number, number] = [5.5, 6.5];
    const FADE_OUT: [number, number] = [8.0, 8.8];

    const isInside = t >= TRANS_OUT[1];

    // --- Fade ---
    let fade = 1;
    if (t < FADE_IN[1]) fade = 1 - smooth((t - FADE_IN[0]) / (FADE_IN[1] - FADE_IN[0]));
    else if (t < TRANS_OUT[0]) fade = 0;
    else if (t < TRANS_OUT[1]) fade = smooth((t - TRANS_OUT[0]) / (TRANS_OUT[1] - TRANS_OUT[0]));
    else if (t < TRANS_IN[1]) fade = 1 - smooth((t - TRANS_IN[0]) / (TRANS_IN[1] - TRANS_IN[0]));
    else if (t < FADE_OUT[0]) fade = 0;
    else fade = smooth((t - FADE_OUT[0]) / (FADE_OUT[1] - FADE_OUT[0]));

    // --- Player position ---
    let pz: number;
    let pose: Pose = 'idle';
    if (isInside) {
      pz = this.insideZ;
    } else if (t < WALK_TO[0]) {
      pz = this.startZ;
    } else {
      pz = mix(this.startZ, this.doorZ, smooth((t - WALK_TO[0]) / (WALK_TO[1] - WALK_TO[0])));
      pose = 'walk';
    }

    // --- Camera ---
    let camX = this.sx + 0.3;
    let camY = this.eyeY + 0.5;
    let camZ = pz + 3.5;
    let lookX = this.sx;
    let lookY = this.eyeY * 0.8;
    let lookZ = pz;
    let fov = 65;

    if (isInside) {
      camX = this.sx;
      camY = this.eyeY;
      camZ = this.insideZ;
      lookZ = this.insideZ - 2;
      fov = 70;
    } else if (t < WALK_TO[0]) {
      camX = this.sx + 1.5;
      camY = this.eyeY + 1.2;
      camZ = this.startZ + 4;
      lookZ = this.doorZ;
      fov = 55;
    } else {
      const p = smooth((t - WALK_TO[0]) / (WALK_TO[1] - WALK_TO[0]));
      camX = mix(this.sx + 1.5, this.sx + 0.3, p);
      camY = mix(this.eyeY + 1.2, this.eyeY + 0.5, p);
      camZ = pz + mix(4, 3, p);
      lookZ = mix(this.doorZ, pz, p);
      fov = mix(55, 65, p);
    }

    // --- Audio ---
    let volume = 0;
    let cutoff = 800;
    if (t > TRANS_OUT[0]) {
      const p = smooth((t - TRANS_OUT[0]) / (FADE_OUT[1] - TRANS_OUT[0]));
      volume = p;
      cutoff = mix(800, 16000, p);
    }

    return {
      x: this.sx,
      z: pz,
      yaw: 0,
      pose,
      cam: { x: camX, y: camY, z: camZ },
      look: { x: lookX, y: lookY, z: lookZ },
      fov,
      fade,
      volume,
      cutoff,
      inside: isInside,
    };
  }
}

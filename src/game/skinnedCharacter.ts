/**
 * Skinned character (GLB from public/models/personagens/), same API as the low-poly Character.
 * The model animations came empty, so motion is procedural on the bones: each pose is a
 * set of rotations in character space, added to the rest pose and blended gradually
 * (no snap when switching poses). Body height comes from the lowest foot, which always stays on the floor.
 * Character front = local +Z.
 */
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { Pose } from './character';

export interface CharacterView {
  readonly root: THREE.Object3D;
  update(dt: number, pose: Pose): void;
  setShirt(color: number): void;
}

export interface SkinnedOptions {
  /** false: dances with arms down. */
  armsUp: boolean;
}

const DANCE_W = (2 * Math.PI * 122) / 60; // same BPM as the low-poly Character
/** Stride rate (rad/s) matched with the hostesses' 1.25 m/s: a faster stride caused foot sliding on the floor. */
const WALK_W = 5.6;
const RUN_W = 9;
const BONE_NAMES = [
  'Hips', 'Spine', 'Chest', 'Neck', 'Head',
  'UpperArmL', 'ForeArmL', 'UpperArmR', 'ForeArmR',
  'ThighL', 'ShinL', 'FootL', 'ThighR', 'ShinR', 'FootR',
] as const;
type BoneName = (typeof BONE_NAMES)[number];
type Rot = Partial<Record<BoneName, [number, number, number]>>;
type Layer = 'idle' | 'walk' | 'dance';

interface BoneRef {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  world: THREE.Quaternion;
  worldInv: THREE.Quaternion;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();

/** Flat foot: compensates the sum of thigh and shin rotations on the X axis. */
const flatFoot = (thigh: number, shin: number, extra = 0): [number, number, number] => [-(thigh + shin) + extra, 0, 0];

export class SkinnedCharacter implements CharacterView {
  readonly root = new THREE.Group();
  private readonly model: THREE.Object3D;
  private readonly bones = new Map<BoneName, BoneRef>();
  private readonly weight: Record<Layer, number> = { idle: 1, walk: 0, dance: 0 };
  private readonly restFootY: number;
  private t = Math.random() * 10;
  private stride = WALK_W;

  constructor(gltf: GLTF, private readonly opts: SkinnedOptions) {
    this.model = SkeletonUtils.clone(gltf.scene);
    this.model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.frustumCulled = false; // bounding box is from the rest pose; arms extend beyond it
      m.layers.set(1); // like other characters: the camera sees it, the floor reflection does not
    });
    this.root.add(this.model);
    this.root.updateMatrixWorld(true);
    for (const name of BONE_NAMES) {
      const bone = this.model.getObjectByName(name) as THREE.Bone | undefined;
      if (!bone) throw new Error(`bone missing: ${name}`);
      const world = bone.getWorldQuaternion(new THREE.Quaternion());
      this.bones.set(name, { bone, rest: bone.quaternion.clone(), world, worldInv: world.clone().invert() });
    }
    this.restFootY = Math.min(this.footY('FootL'), this.footY('FootR'));
  }

  setShirt(): void {
    // clothing comes from the texture
  }

  update(dt: number, pose: Pose): void {
    this.t += dt;
    const target: Layer = pose === 'walk' || pose === 'run' || pose === 'crouchWalk' ? 'walk' : pose === 'dance' ? 'dance' : 'idle';
    this.stride = pose === 'run' ? RUN_W : WALK_W;
    const k = 1 - Math.exp(-8 * dt);
    for (const l of ['idle', 'walk', 'dance'] as const) this.weight[l] += ((l === target ? 1 : 0) - this.weight[l]) * k;

    const total: Rot = {};
    const add = (rot: Rot, w: number) => {
      if (w < 0.001) return;
      for (const [name, r] of Object.entries(rot) as Array<[BoneName, [number, number, number]]>) {
        const acc = (total[name] ??= [0, 0, 0]);
        acc[0] += r[0] * w;
        acc[1] += r[1] * w;
        acc[2] += r[2] * w;
      }
    };
    add(this.idle(), this.weight.idle);
    add(this.walk(), this.weight.walk);
    add(this.dance(), this.weight.dance);

    for (const [name, ref] of this.bones) {
      const r = total[name];
      if (!r) {
        ref.bone.quaternion.copy(ref.rest);
        continue;
      }
      // rotation in character space, converted to the bone's local space in the rest pose
      _q.setFromEuler(_e.set(r[0], r[1], r[2]));
      _q.premultiply(ref.worldInv).multiply(ref.world);
      ref.bone.quaternion.copy(ref.rest).multiply(_q);
    }

    // support foot on the floor: the body rises and falls as the legs bend, without sinking into the floor
    this.model.position.y = 0;
    this.root.updateMatrixWorld(true);
    this.model.position.y = this.restFootY - Math.min(this.footY('FootL'), this.footY('FootR'));
  }

  /** Height of the foot bone relative to the character's base. */
  private footY(name: 'FootL' | 'FootR'): number {
    const base = this.root.getWorldPosition(_v).y;
    return this.bones.get(name)!.bone.getWorldPosition(_v).y - base;
  }

  private idle(): Rot {
    const t = this.t;
    const breath = Math.sin(t * 1.6);
    return {
      Hips: [0, 0, Math.sin(t * 0.45) * 0.03],
      Chest: [breath * 0.02, 0, 0],
      Head: [Math.sin(t * 0.37) * 0.05, Math.sin(t * 0.23) * 0.3, 0],
      UpperArmL: [0, 0, -0.03 - breath * 0.015],
      UpperArmR: [0, 0, 0.03 + breath * 0.015],
      ForeArmL: [-0.12, 0, 0],
      ForeArmR: [-0.12, 0, 0],
    };
  }

  private walk(): Rot {
    const p = this.t * this.stride;
    const s = Math.sin(p);
    const a = this.stride > WALK_W ? 0.6 : 0.4;
    // knee bends when the leg swings from back to front
    const kneeL = 0.08 + Math.max(0, Math.sin(p + 0.9)) * 0.65;
    const kneeR = 0.08 + Math.max(0, Math.sin(p + 0.9 + Math.PI)) * 0.65;
    const thighL = s * a;
    const thighR = -s * a;
    return {
      Hips: [0, s * 0.08, 0],
      Chest: [0.04, -s * 0.12, 0],
      ThighL: [thighL, 0, 0],
      ThighR: [thighR, 0, 0],
      ShinL: [kneeL, 0, 0],
      ShinR: [kneeR, 0, 0],
      // toe tip lifts slightly on the front leg (heel strikes first)
      FootL: flatFoot(thighL, kneeL, Math.min(0, s) * 0.25),
      FootR: flatFoot(thighR, kneeR, Math.min(0, -s) * 0.25),
      UpperArmL: [-s * a * 0.7, 0, -0.04],
      UpperArmR: [s * a * 0.7, 0, 0.04],
      ForeArmL: [-0.25, 0, 0],
      ForeArmR: [-0.25, 0, 0],
    };
  }

  private dance(): Rot {
    const b = this.t * DANCE_W;
    const half = Math.sin(b / 2);
    const bounce = Math.abs(Math.sin(b));
    const thigh = -0.12 - bounce * 0.12;
    const shin = 0.25 + bounce * 0.25;
    const rot: Rot = {
      Hips: [0, Math.sin(b / 4) * 0.25, half * 0.14],
      Spine: [0, 0, -half * 0.06],
      Chest: [0.03, -Math.sin(b / 4) * 0.15, -half * 0.08],
      Head: [bounce * 0.06, 0, half * 0.12],
      ThighL: [thigh, 0, 0],
      ThighR: [thigh, 0, 0],
      ShinL: [shin, 0, 0],
      ShinR: [shin, 0, 0],
      FootL: flatFoot(thigh, shin),
      FootR: flatFoot(thigh, shin),
    };
    if (this.opts.armsUp) {
      rot.UpperArmL = [-2.5 + half * 0.3, 0, 0.3];
      rot.UpperArmR = [-2.5 - half * 0.3, 0, -0.3];
      rot.ForeArmL = [-0.35, 0, 0];
      rot.ForeArmR = [-0.35, 0, 0];
    } else {
      rot.UpperArmL = [-0.35 + half * 0.15, 0, 0.12];
      rot.UpperArmR = [-0.35 - half * 0.15, 0, -0.12];
      rot.ForeArmL = [-0.8, 0, 0];
      rot.ForeArmR = [-0.8, 0, 0];
    }
    return rot;
  }
}

import * as THREE from 'three';
import type { AABB, CollisionWorld } from './collision2d';
import { lerpAngle, rand } from './utils';
import { Character, type Look, type Pose } from './character';
import type { CharacterView } from './skinnedCharacter';

export type NpcMode = 'static' | 'wander' | 'dance' | 'pace';

export interface NpcOptions {
  name: string;
  look: Look;
  x: number;
  z: number;
  y?: number;
  yaw?: number;
  mode: NpcMode;
  pose?: Pose;
  area?: AABB;
  paceTo?: { x: number; z: number };
  lines?: string[];
  /** Overrides the generic dialogue (e.g. hostesses have their own menu). */
  talkable?: boolean;
}

const NPC_RADIUS = 0.3;

export class Npc {
  char: CharacterView;
  readonly pos: THREE.Vector3;
  readonly name: string;
  mode: NpcMode;
  readonly talkable: boolean;
  private readonly lines: string[];
  private lineIdx = Math.floor(Math.random() * 100);
  private yaw: number;
  private renderYaw: number;
  private basePose: Pose;
  private area: AABB | null;
  private route: THREE.Vector3[] = [];
  private onRouteDone: (() => void) | null = null;
  private readonly paceA: THREE.Vector3;
  private readonly paceB: THREE.Vector3 | null;
  private target: THREE.Vector3 | null = null;
  private wait = rand(0, 3);
  private talkTimer = 0;
  private stuckTimer = 0;
  private readonly lastCheck = new THREE.Vector3();

  constructor(opts: NpcOptions, parent: THREE.Object3D) {
    this.char = new Character(opts.look);
    this.pos = new THREE.Vector3(opts.x, opts.y ?? 0, opts.z);
    this.name = opts.name;
    this.mode = opts.mode;
    this.yaw = opts.yaw ?? rand(-Math.PI, Math.PI);
    this.renderYaw = this.yaw;
    this.basePose = opts.pose ?? (opts.mode === 'dance' ? 'dance' : 'idle');
    this.area = opts.area ?? null;
    this.lines = opts.lines ?? [];
    this.talkable = opts.talkable ?? this.lines.length > 0;
    this.paceA = this.pos.clone();
    this.paceB = opts.paceTo ? new THREE.Vector3(opts.paceTo.x, 0, opts.paceTo.z) : null;
    this.lastCheck.copy(this.pos);
    parent.add(this.char.root);
    this.char.root.position.copy(this.pos);
  }

  /** Swaps the figure (e.g. the provisional low-poly for the skinned model, when it finishes downloading). */
  setCharacter(view: CharacterView): void {
    const old = this.char.root;
    old.parent?.add(view.root);
    view.root.position.copy(old.position);
    view.root.rotation.copy(old.rotation);
    view.root.visible = old.visible;
    old.removeFromParent();
    this.char = view;
  }

  get moves(): boolean {
    return this.mode !== 'static' || this.route.length > 0;
  }

  /** Walks through the points (no collision — route is pre-planned) and calls onDone on arrival. */
  followRoute(points: Array<{ x: number; z: number }>, onDone?: () => void): void {
    this.route = points.map((p) => new THREE.Vector3(p.x, 0, p.z));
    this.onRouteDone = onDone ?? null;
    this.talkTimer = 0;
    this.wait = 0;
    this.pos.y = 0;
  }

  /** Stays still at a point with a pose. */
  settle(yaw: number, pose: Pose = 'idle'): void {
    this.mode = 'static';
    this.yaw = yaw;
    this.basePose = pose;
  }

  setPose(pose: Pose): void {
    this.basePose = pose;
  }

  /** Resumes wandering freely within an area. */
  resume(mode: 'wander' | 'dance', area: AABB): void {
    this.mode = mode;
    this.area = area;
    this.basePose = mode === 'dance' ? 'dance' : 'idle';
    this.target = null;
    this.wait = 0;
  }

  private followStep(dt: number): Pose {
    const t = this.route[0];
    const dx = t.x - this.pos.x;
    const dz = t.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.15) {
      this.route.shift();
      if (this.route.length === 0) {
        const cb = this.onRouteDone;
        this.onRouteDone = null;
        cb?.();
      }
      return 'walk';
    }
    const step = Math.min(dist, 1.4 * dt);
    this.pos.x += (dx / dist) * step;
    this.pos.z += (dz / dist) * step;
    this.yaw = Math.atan2(dx, dz);
    return 'walk';
  }

  talk(playerPos: THREE.Vector3): string {
    this.yaw = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    this.talkTimer = 4;
    const line = this.lines[this.lineIdx % this.lines.length];
    this.lineIdx++;
    return line;
  }

  update(dt: number, collision: CollisionWorld): void {
    let pose: Pose = this.basePose;
    if (this.route.length > 0) {
      pose = this.followStep(dt);
    } else if (this.talkTimer > 0) {
      this.talkTimer -= dt;
      if (pose === 'walk') pose = 'idle';
    } else if (this.mode !== 'static') {
      pose = this.move(dt, collision);
    }
    this.renderYaw = lerpAngle(this.renderYaw, this.yaw, 1 - Math.exp(-8 * dt));
    this.char.root.position.copy(this.pos);
    this.char.root.rotation.y = this.renderYaw;
    this.char.update(dt, pose);
  }

  private move(dt: number, collision: CollisionWorld): Pose {
    const idle: Pose = this.mode === 'dance' ? 'dance' : 'idle';
    if (this.wait > 0) {
      this.wait -= dt;
      return idle;
    }
    if (!this.target) this.target = this.pickTarget();
    const dx = this.target.x - this.pos.x;
    const dz = this.target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.25) {
      this.target = null;
      this.wait = this.mode === 'dance' ? rand(6, 14) : this.mode === 'pace' ? rand(2, 5) : rand(2, 7);
      return idle;
    }
    const sp = this.mode === 'pace' ? 0.9 : 1.25;
    this.pos.x += (dx / dist) * sp * dt;
    this.pos.z += (dz / dist) * sp * dt;
    this.yaw = Math.atan2(dx, dz);
    if (this.mode !== 'pace') collision.resolveCircle(this.pos, NPC_RADIUS);

    this.stuckTimer += dt;
    if (this.stuckTimer > 1.2) {
      if (this.pos.distanceTo(this.lastCheck) < 0.3) {
        this.target = null;
        this.wait = 0.5;
      }
      this.lastCheck.copy(this.pos);
      this.stuckTimer = 0;
    }
    return 'walk';
  }

  private pickTarget(): THREE.Vector3 {
    if (this.paceB) {
      const atA = this.pos.distanceTo(this.paceA) < 0.5;
      return (atA ? this.paceB : this.paceA).clone();
    }
    const a = this.area ?? { minX: this.pos.x - 2, maxX: this.pos.x + 2, minZ: this.pos.z - 2, maxZ: this.pos.z + 2 };
    return new THREE.Vector3(rand(a.minX, a.maxX), 0, rand(a.minZ, a.maxZ));
  }
}

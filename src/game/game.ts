/**
 * Game rules (from PeekHole) on top of the club's scene and engine:
 * wristband, VIP pass, Jacuzzi Suite reservation, economy, bar, hostesses with affinity,
 * suite invite, cutscenes, NPCs, seats, dancing, HUD, minimap and zone audio.
 *
 * The club engine (engine/*.js) owns movement, 3D collision, hinged doors,
 * the jacuzzi and graphics. This module only reads/drives that engine through
 * the interfaces below. Every access rule lives in `doorRule()`/`corridorAllowed()`
 * (single point, easy to move to an authoritative server for multiplayer).
 */
import * as THREE from 'three';
import type { ClubAudio } from './audio';
import { CollisionWorld, pointInRect, type AABB } from './collision2d';
import type { Input } from './input';
import { clamp, formatTime, money, pick, rand } from './utils';
import type { ChatUI, ChatCallbacks } from '../ui/chatUI';
import type { Hud } from '../ui/hud';
import type { Menu, MenuItem } from '../ui/menu';
import type { MapMarker, Minimap } from '../ui/minimap';
import { Character, type Look, type Pose } from './character';
import { CutsceneEngine, type SceneContext } from './cutscene';
import { Entrance } from './entrance';
import { INTRO_SECONDS, IntroDirector } from './intro';
import { Interactions } from './interaction';
import { Npc } from './npc';
import { hasPersonality } from './dialogue';
import { SCENES } from './scenes';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { api } from '../net/api';
import { loadBartender } from './bartender/bartender.js';
import { SkinnedCharacter } from './skinnedCharacter';
import { DRINKS, HOSTESS_PRICES, PREMIUM_MULT, PRICES, ROOM_DURATION_SEC, itemId, priceOf, type ItemId } from './catalog';
import type { GameState } from './state';
import { ViewCam, type BvhLike } from './viewCam';
import {
  HOSTESS_AREAS, RECTS, ROOM_LABEL, SEATS, SPOTS, STAFF, SUITE_CENTER, SUITE_ROUTE, WALLS, zoneAt,
  type RoomId, type SeatDef, type Zone,
} from './venue';

// ------------------------------------------------------------------ club engine (JS)
interface BoateDoor {
  name: string;
  open: number;
  target: number;
  center: THREE.Vector3;
}
interface BoateRoom {
  name: string;
  node: THREE.Object3D;
}
interface BoatePool {
  x: number;
  z: number;
  r: number;
  y: number;
}
export interface BoateWorld {
  doors: BoateDoor[];
  rooms: BoateRoom[];
  collision: { bvh: BvhLike | null };
  inWater: boolean;
  spawn: { position: THREE.Vector3; yaw: number };
  /** Entrance cutscene: hides the entire level while the player is outside. */
  setOutside(on: boolean): void;
  doorInReach(pos: THREE.Vector3, dir: THREE.Vector3): BoateDoor | null;
  toggleDoor(door: BoateDoor, pos: THREE.Vector3): boolean;
  poolInReach(pos: THREE.Vector3, dir: THREE.Vector3): BoatePool | null;
  seatFor(pool: BoatePool, pos: THREE.Vector3): { to: THREE.Vector3; eye: number; yaw: number; exit: THREE.Vector3 };
}
export interface BoatePlayer {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  pitch: number;
  eyeOffset: number;
  enabled: boolean;
  seat: unknown;
  readonly seated: boolean;
  crouching: boolean;
  onBlockedStand: (() => void) | null;
  setCrouch(on: boolean): boolean;
  sit(to: THREE.Vector3, eye: number, yaw: number): void;
  stand(to: THREE.Vector3): void;
}
export interface Action {
  label: string;
  short: string;
  run: () => void;
}

// ------------------------------------------------------------------ content
const SKINS = [0xf1c7a5, 0xd9a07a, 0xc68a64, 0x8d5a3b, 0x5c3a24];
const HAIRS = [0x111111, 0x3b2414, 0xd8b46a, 0x7a2b18, 0x777777, 0x9b4dff];
const SHIRTS = [0xff3fa4, 0x9b4dff, 0x00b3d6, 0x111111, 0xf2f2f2, 0xc0143c, 0xffcc33, 0x2e8b57, 0x1f3b73];
const PANTS = [0x1d1d2b, 0x111111, 0x2b2b2b, 0x3b2a1a, 0x24304a];
const NAMES_F = ['Marina', 'Duda', 'Nina', 'Bia', 'Carla', 'Júlia', 'Lara', 'Helena', 'Camila', 'Sabrina', 'Paula', 'Isadora', 'Manu', 'Rebeca', 'Alice', 'Giovana'];
const NAMES_M = ['Téo', 'Rafa', 'Igor', 'Léo', 'Vini', 'Paulo', 'Davi', 'Otto'];
const DRESSES = [0xc0143c, 0x111111, 0xff3fa4, 0x9b4dff, 0xd4af37, 0x00b3d6, 0xf2f2f2, 0x7a1d3a];
const LEGS_F = [0x1a1a1a, 0xc68a64, 0xf1c7a5, 0x8d5a3b, 0x2b1a2b];

/** Club hostesses — all adults (age in profile). Non-explicit content. */
interface HostessProfile {
  name: string;
  age: number;
  style: string;
  bio: string;
  price: number;
  dress: number;
  hair: number;
  skin: number;
}

const HOSTESSES: HostessProfile[] = [
  { name: 'Valentina', age: 27, style: 'Elegant', bio: 'Loves champagne and good conversation.', price: HOSTESS_PRICES.Valentina, dress: 0xc0143c, hair: 0x111111, skin: 0xd9a07a },
  { name: 'Yasmin', age: 24, style: 'Fun', bio: 'Queen of the dance floor, laughs at everything.', price: HOSTESS_PRICES.Yasmin, dress: 0xff3fa4, hair: 0xd8b46a, skin: 0xf1c7a5 },
  { name: 'Bianca', age: 31, style: 'Mysterious', bio: 'Says little, watches closely.', price: HOSTESS_PRICES.Bianca, dress: 0x111111, hair: 0x7a2b18, skin: 0xc68a64 },
  { name: 'Luna', age: 26, style: 'Dancer', bio: "Never strays far from Nyx's cage.", price: HOSTESS_PRICES.Luna, dress: 0x9b4dff, hair: 0x3b2414, skin: 0x8d5a3b },
];

const INVITE_THRESHOLD = 60;

/** Model for each hostess. armsUp: false = hand baked to hip; cannot raise arms. */
const HOSTESS_MODELS = {
  Valentina: { file: 'cyber_d.glb', armsUp: true },
  Yasmin: { file: 'cyber_c.glb', armsUp: true },
  Bianca: { file: 'cyber_b.glb', armsUp: false },
  Luna: { file: 'cyber_a.glb', armsUp: true },
} as const;
const NYX_MODEL = 'tropical.glb';
/** Behind the counter module at z = -1.255 (bartender package x: 0.80 m behind the countertop). */
const BARTENDER_SPOT = { x: 4.599, z: -1.255 };

const HOSTESS_LINES = {
  low: ['Hi! First night at the Jack?', 'I like people who know how to start a conversation.', 'Buy me a drink and we\'ll see where it goes.'],
  mid: ['You dance well, you know?', 'I\'m starting to enjoy your company.', 'Hmm, keep talking...'],
  high: ['If you book the suite, I\'ll keep you company.', 'I think we\'re a good match. Shall we go somewhere more private?'],
  refuse: ['Easy... I barely know you yet.', 'Maybe later. Win me over first.'],
  room: ['What a lovely suite. Nice choice of lighting.', 'Relax, the night is ours.', 'Nobody bothers us here.', 'The water feels amazing, you know?'],
};

type HostessStatus = 'floor' | 'walking' | 'room';

interface Hostess {
  p: HostessProfile;
  npc: Npc;
  affinity: number;
  status: HostessStatus;
  room: RoomId | null;
  area: AABB;
  areaMode: 'wander' | 'dance';
  talkReadyAt: number;
  danceUntil: number;
  noticed: boolean;
  line: number;
}

const PATRON_LINES = [
  'First time here? Relax, there\'s only one rule: respect.',
  'Nothing happens here unless everyone\'s on board. Simple.',
  'Nyx in the cage tonight is flawless.',
  'Booked the suite yet? After midnight it\'s gone.',
  'They say the suite in the back has a jacuzzi... never been.',
  'Order the "Peekhole" at the bar. Trust me.',
  'If someone says no, it\'s no. Security here is strict.',
  'Discretion is everything. What happens at the Jack...',
  'Hit the dance floor! Press G and let loose!',
  'Seen the lotus flower hologram? Mesmerizing.',
];

export const OUTFITS: Array<{ name: string; color: number }> = [
  { name: 'Royal blue', color: 0x3a7bd5 },
  { name: 'Black', color: 0x141414 },
  { name: 'Wine', color: 0x7a1d3a },
  { name: 'Neon pink', color: 0xff3fa4 },
  { name: 'Purple', color: 0x9b4dff },
  { name: 'White', color: 0xf2f2f2 },
  { name: 'Gold', color: 0xd4af37 },
];

const MOODS: Array<{ name: string; color: number }> = [
  { name: 'Original', color: -1 },
  { name: 'Pink', color: 0xff3fa4 },
  { name: 'Purple', color: 0x8a5cff },
  { name: 'Red', color: 0xff2a2a },
  { name: 'Blue', color: 0x2a7bff },
  { name: 'Amber', color: 0xffa53f },
];

const STATUS_COLORS = { free: 0x33ff88, occupied: 0xff2244, mine: 0x4da6ff };

export function randomLook(build: 'm' | 'f' = 'm', shirt?: number): Look {
  if (build === 'f') {
    return { build, shirt: shirt ?? pick(DRESSES), pants: pick(LEGS_F), skin: pick(SKINS), hair: pick(HAIRS), scale: 0.95 };
  }
  return { build, shirt: shirt ?? pick(SHIRTS), pants: pick(PANTS), skin: pick(SKINS), hair: pick(HAIRS) };
}

const hearts = (v: number): string => {
  const n = Math.round(clamp(v, 0, 100) / 20);
  return '♥'.repeat(n) + '♡'.repeat(5 - n);
};

const PLAYER_RADIUS = 0.3;
const _down = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
const _dir = new THREE.Vector3();

export class Game {
  readonly view: ViewCam;
  private readonly char: Character;
  private readonly collision = new CollisionWorld();
  private readonly cutscene: CutsceneEngine;
  private cutscenePose: Pose = 'idle';
  private entrance: Entrance | null = null;
  private intro: IntroDirector | null = null;
  /** Touch held on screen (mobile): counts as skipping the intro. */
  introSkipHeld = false;
  private readonly interactions = new Interactions();
  private readonly npcs: Npc[] = [];
  private barNpc: Npc | null = null;
  private nyx: Npc | null = null;
  private bartender: Awaited<ReturnType<typeof loadBartender>> | null = null;
  private readonly hostesses: Hostess[] = [];
  private readonly markers: MapMarker[] = [];
  private readonly occupied = new Set<string>();
  private readonly suiteDoor: BoateDoor | null;
  private readonly clubRoom: THREE.Object3D | null;
  private readonly spaRoom: THREE.Object3D | null;
  private readonly spaLights: Array<{ light: THREE.Light; base: THREE.Color }> = [];
  private readonly panelMat: THREE.MeshBasicMaterial;
  private readonly statusMat: THREE.MeshBasicMaterial;
  private zone: Zone | null = null;
  private seatDef: SeatDef | null = null;
  private seatFloor = 0;
  private poolExit: THREE.Vector3 | null = null;
  private dancing = false;
  private facing = 0;
  private time = 0;
  private tick = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private gateNoticeAt = -10;
  private roomMood = -1;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly world: BoateWorld,
    private readonly player: BoatePlayer,
    private readonly state: GameState,
    private readonly hud: Hud,
    private readonly menu: Menu,
    private readonly chat: ChatUI,
    private readonly audio: ClubAudio,
    private readonly input: Input,
    private readonly minimap: Minimap,
    obstacles: AABB[],
  ) {
    for (const b of [...WALLS, ...obstacles]) this.collision.addStatic(b);
    player.onBlockedStand = () => hud.notify('Not enough room to stand up here.', 'bad');
    this.view = new ViewCam(camera);
    this.cutscene = new CutsceneEngine(camera);
    this.char = new Character({ build: 'm', shirt: state.shirt, pants: 0x1d1d2b, skin: 0xc68a64, hair: 0x2b1a12 });
    scene.add(this.char.root);
    this.char.root.visible = false;

    this.suiteDoor = world.doors.find((d) => d.name === 'spa') ?? world.doors[0] ?? null;
    this.clubRoom = world.rooms.find((r) => r.name === 'club')?.node ?? null;
    this.spaRoom = world.rooms.find((r) => r.name === 'spa')?.node ?? null;
    this.spaRoom?.traverse((o) => {
      const l = o as THREE.Light;
      if (l.isLight && !(l as THREE.AmbientLight).isAmbientLight) this.spaLights.push({ light: l, base: l.color.clone() });
    });

    // suite panel (inside, next to the door) and status light in the corridor
    this.panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x66ffcc).multiplyScalar(1.6) });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.38), this.panelMat);
    panel.position.set(SPOTS.suitePanel.x, 1.25, -16.6);
    (this.spaRoom ?? scene).add(panel);
    this.statusMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(STATUS_COLORS.free).multiplyScalar(2.5) });
    const status = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), this.statusMat);
    status.position.set(0.95, 2.05, -15.55);
    status.rotation.y = -Math.PI / 2;
    scene.add(status);

    this.spawnNpcs(scene);
    this.setupInteractions();
    state.onChange(() => this.refreshHud());
    this.refreshHud();
    hud.setMode(true);
  }

  get isCutscenePlaying(): boolean { return this.cutscene.playing; }

  handleCutsceneKey(code: string): boolean { return this.cutscene.handleKey(code); }

  setShirt(color: number): void {
    this.char.setShirt(color);
  }

  // =================================================================== utilities
  /** Floor height (or furniture surface) directly below (x, z), via the club's 3D collision. */
  private floorAt(x: number, z: number, from = 1.6): number {
    const bvh = this.world.collision.bvh;
    if (!bvh) return 0;
    _down.origin.set(x, from, z);
    const hit = bvh.raycastFirst(_down, THREE.DoubleSide);
    return hit ? from - hit.distance : 0;
  }

  private playerForward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
  }

  // =================================================================== loop
  /** Call after player.update and world.update. */
  update(dt: number, active: boolean): void {
    this.time += dt;
    this.state.elapsed += dt;

    if (this.cutscene.playing) {
      // during the intro the mouse is locked: Space skips without releasing the mouse (Esc also works)
      const escDown = this.input.isDown('Escape') || (this.intro !== null && (this.input.isDown('Space') || this.introSkipHeld));
      const advance = this.input.wasPressed('KeyE') || this.input.wasPressed('Space');
      this.cutscene.update(dt, escDown, advance);
      this.updateCharacter(dt, this.cutscenePose);
      for (const npc of this.npcs) npc.update(dt, this.collision);
      if (this.bartender?.root.visible) this.bartender.update(dt);
      this.updateVisibility();
      this.updateRules(dt);
      return;
    }

    const p = this.player;
    if (active) {
      if (this.input.wasPressed('KeyV')) this.hud.setMode(this.view.toggle() === 'first');
      this.view.zoom(this.input.wheel);
      if (this.input.wasPressed('KeyG') && !p.seat) {
        this.dancing = !this.dancing;
        if (this.dancing) this.hud.notify('Dancing. Walk to stop.');
      }
    }
    if (!p.seat && this.seatDef) this.seatDef = null; // finished standing up
    const planar = Math.hypot(p.velocity.x, p.velocity.z);
    if (planar > 0.6 || p.seat || p.crouching) this.dancing = false;
    this.gateCorridor();

    for (const npc of this.npcs) {
      npc.update(dt, this.collision);
      if (!p.seat) pushApart(p.position, npc.pos, PLAYER_RADIUS + 0.3);
    }
    // hair physics and eyes only run while she's visible (bar room visible)
    if (this.bartender?.root.visible) this.bartender.update(dt);
    this.separateNpcs();

    let pose: Pose = 'idle';
    if (p.seat) pose = this.seatDef ? this.seatDef.pose : 'sit';
    else if (p.crouching) pose = planar > 0.3 ? 'crouchWalk' : 'crouch';
    else if (this.dancing) pose = 'dance';
    else if (planar > 3.6) pose = 'run';
    else if (planar > 0.3) pose = 'walk';
    this.updateCharacter(dt, pose);

    this.view.apply(p, this.world.collision.bvh, this.state.buzz, this.time);
    this.char.root.visible = this.view.mode === 'third';

    const act = active ? this.action() : null;
    this.hud.setPrompt(act ? `[E] ${act.label}` : null);

    this.updateVisibility();
    this.updateRules(dt);
    this.updateZoneAndAudio();
    this.updateHudFrame(dt);
  }

  private updateCharacter(dt: number, pose: Pose): void {
    const p = this.player;
    const root = this.char.root;
    root.position.copy(p.position);
    if (p.seated && this.seatDef) {
      root.position.set(this.seatDef.x, this.seatFloor + this.seatDef.height - (this.seatDef.pose === 'sit' ? 0.5 : 0.7), this.seatDef.z);
      this.facing = this.seatDef.yaw;
    } else if (p.seated) {
      root.position.y -= 0.05; // in the water
      this.facing = p.yaw + Math.PI;
    } else {
      const planar = Math.hypot(p.velocity.x, p.velocity.z);
      const target = this.view.mode === 'first' || planar < 0.2 ? p.yaw + Math.PI : Math.atan2(p.velocity.x, p.velocity.z);
      let d = (target - this.facing) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.facing += d * (1 - Math.exp(-12 * dt));
    }
    root.rotation.y = this.facing;
    this.char.update(dt, pose);
  }

  /** NPCs and the player character hide along with the room they're in (the club hides rooms). */
  private updateVisibility(): void {
    const show = (x: number, z: number): boolean => {
      const node = zoneAt(x, z)?.id === 'spa' ? this.spaRoom : this.clubRoom;
      return node ? node.visible : true;
    };
    for (const n of this.npcs) n.char.root.visible = show(n.pos.x, n.pos.z);
    if (this.bartender) this.bartender.root.visible = show(BARTENDER_SPOT.x, BARTENDER_SPOT.z);
    // (during the intro the character is on the street, outside any room)
    if (this.char.root.visible && !this.intro) this.char.root.visible = show(this.player.position.x, this.player.position.z);
  }

  /**
   * Swaps the low-poly hostess, Nyx and bartender stand-ins for skinned models.
   * Runs after the game has opened: the stand-ins stay until the download (~8 MB) finishes.
   */
  async loadCharacters(): Promise<void> {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const url = (f: string) => `./models/personagens/${f}`;
    const files = [...new Set([...Object.values(HOSTESS_MODELS).map((m) => m.file), NYX_MODEL])];
    const [gltfs, bartender] = await Promise.all([
      Promise.all(files.map((f) => loader.loadAsync(url(f)))),
      loadBartender(url('bartender.glb'), { loader, shadows: false }),
    ]);
    const byFile = new Map(files.map((f, i) => [f, gltfs[i]]));
    for (const h of this.hostesses) {
      const m = HOSTESS_MODELS[h.p.name as keyof typeof HOSTESS_MODELS];
      if (m) h.npc.setCharacter(new SkinnedCharacter(byFile.get(m.file)!, { armsUp: m.armsUp }));
    }
    this.nyx?.setCharacter(new SkinnedCharacter(byFile.get(NYX_MODEL)!, { armsUp: true }));

    // her animation was made for a counter module: she stays there, facing the countertop
    bartender.root.position.set(BARTENDER_SPOT.x, this.floorAt(BARTENDER_SPOT.x, BARTENDER_SPOT.z), BARTENDER_SPOT.z);
    bartender.root.rotation.y = -Math.PI / 2;
    bartender.root.traverse((o) => o.layers.set(1));
    this.scene.add(bartender.root);
    this.bartender = bartender;
    if (this.barNpc) {
      this.barNpc.char.root.removeFromParent();
      this.npcs.splice(this.npcs.indexOf(this.barNpc), 1);
      this.barNpc = null;
    }
    this.updateVisibility();
  }

  // =================================================================== action (E key / touch button)
  action(): Action | null {
    const p = this.player;
    if (p.seat) {
      if (!p.seated) return null; // still sitting down or getting up
      if (this.seatDef) return { label: 'Stand up', short: 'Stand', run: () => this.standUp() };
      return { label: 'Leave the jacuzzi', short: 'Leave', run: () => this.leavePool() };
    }
    const fwd = this.playerForward(_dir);
    const hit = this.interactions.find(p.position, fwd);
    let door = this.world.doorInReach(p.position, fwd);
    // Door and person in reach (the hostess waits by the suite door): the one in front wins;
    // if both are in front, the closer one. The club accepts the door even from behind
    // when it's less than 1.1 m away.
    if (door && hit) {
      const dd = planarDist(door.center, p.position);
      const facing = dd > 1e-3 ? ((door.center.x - p.position.x) * fwd.x + (door.center.z - p.position.z) * fwd.z) / dd : 1;
      if (facing < 0.5 || planarDist(hit.item.pos, p.position) < dd) door = null;
    }
    if (door) {
      const closing = door.target === 1;
      return {
        label: `${closing ? 'Close' : 'Open'} door — ${ROOM_LABEL.suite}`,
        short: closing ? 'Close' : 'Open',
        run: () => this.tryDoor(door),
      };
    }
    const pool = this.world.poolInReach(p.position, fwd);
    if (pool) {
      const label = this.world.inWater ? 'Sit in the water' : 'Enter the jacuzzi';
      return { label, short: this.world.inWater ? 'Sit' : 'Enter', run: () => this.enterPool(pool) };
    }
    if (hit) return { label: hit.label, short: 'Use', run: () => hit.item.use() };
    return null;
  }

  private enterPool(pool: BoatePool): void {
    const s = this.world.seatFor(pool, this.player.position);
    this.poolExit = s.exit;
    this.seatDef = null;
    this.dancing = false;
    this.player.sit(s.to, s.eye, s.yaw);
  }

  private leavePool(): void {
    if (this.poolExit) this.player.stand(this.poolExit);
  }

  private sit(seat: SeatDef): void {
    if (seat.vip && !this.state.vip) {
      this.hud.notify('VIP bed: requires a VIP pass (entrance terminal).', 'bad');
      return;
    }
    this.seatDef = seat;
    this.occupied.add(seat.id);
    this.seatFloor = this.floorAt(seat.exit.x, seat.exit.z);
    this.dancing = false;
    const eye = seat.height + (seat.pose === 'sit' ? 0.62 : 0.78);
    this.player.sit(new THREE.Vector3(seat.x, this.seatFloor, seat.z), eye, seat.yaw + Math.PI);
  }

  private standUp(): void {
    const s = this.seatDef;
    if (!s) return;
    this.occupied.delete(s.id);
    this.player.stand(new THREE.Vector3(s.exit.x, this.seatFloor + 0.02, s.exit.z));
    // seatDef is cleared in update when the Player finishes standing up
  }

  // =================================================================== rules
  private updateRules(dt: number): void {
    const s = this.state;
    s.buzz = clamp(s.buzz - dt * 0.012, 0, 1);
    const pos = this.player.position;

    if (this.dancing && pointInRect(pos.x, pos.z, RECTS.danceFloor)) {
      s.vibe += dt * 6;
      if (s.vibe >= 100) {
        s.vibe = 0;
        void s.reward(Math.round(rand(40, 80))).then((r) => {
          if ('prize' in r) this.hud.notify(`You won tonight's dance contest! +${money(r.prize)}`, 'good');
          else this.hud.notify(`Dance contest: ${r.error}`);
        });
      }
    } else {
      s.vibe = Math.max(0, s.vibe - dt * 1.5);
    }

    for (const h of this.hostesses) {
      // dancing near her draws attention (persuasion without spending money, just time)
      if (h.status === 'floor' && this.dancing && near(pos, h.npc.pos, 3.5)) {
        if (!h.noticed) {
          h.noticed = true;
          this.say(h, 'Oh, someone here knows how to dance...');
        }
        this.addAffinity(h, dt * 3);
      }
      if (h.status === 'room' && h.danceUntil > 0 && s.elapsed >= h.danceUntil) {
        h.danceUntil = 0;
        h.npc.setPose('idle');
      }
    }

    this.tick += dt;
    if (this.tick < 1) return;
    this.tick = 0;

    if (s.reservation && s.elapsed >= s.reservation.expiresAt) {
      s.releaseRoom();
      this.onReservationEnded();
      this.hud.notify('Your Jacuzzi Suite reservation has ended.', 'bad');
    }
    // NPC couples occupy and free the suite occasionally (closes the door if the player isn't there)
    if (s.roomStatus('suite') === 'free' && this.zone?.id !== 'spa' && this.zone?.id !== 'corridor' && Math.random() < 1 / 60) {
      s.occupiedUntil.suite = s.elapsed + rand(40, 90);
      if (this.suiteDoor) this.suiteDoor.target = 0;
    }
    const st = s.roomStatus('suite');
    this.statusMat.color.setHex(STATUS_COLORS[st]).multiplyScalar(2.5);
    this.panelMat.color.setHex(st === 'mine' ? STATUS_COLORS.mine : 0x66ffcc).multiplyScalar(1.6);
    this.refreshHud();
  }

  /** Security only allows VIP pass holders or suite reservation holders into the corridor. */
  private corridorAllowed(): boolean {
    return this.state.vip || this.state.roomStatus('suite') === 'mine';
  }

  private gateCorridor(): void {
    const p = this.player.position;
    if (this.zone?.id !== 'club' || this.corridorAllowed()) return;
    if (p.z < -12.0 && Math.abs(p.x) < 1.3) {
      p.z = -12.0;
      if (this.player.velocity.z < 0) this.player.velocity.z = 0;
      if (this.time - this.gateNoticeAt > 4) {
        this.gateNoticeAt = this.time;
        this.hud.notify('Bruno (security): “VIP or suite reservation only past this point. The terminal is at the entrance.”', 'bad');
      }
    }
  }

  private doorRule(): string | null {
    const s = this.state;
    if (this.zone?.id === 'spa') return null; // leaving is always allowed
    const st = s.roomStatus('suite');
    if (st === 'mine') return null;
    if (st === 'occupied') return 'Suite occupied. Come back later.';
    if (s.vip) return null;
    return 'Suite available — book at the entrance terminal.';
  }

  private tryDoor(door: BoateDoor): void {
    if (door.target === 1) {
      this.world.toggleDoor(door, this.player.position);
      return;
    }
    const deny = this.doorRule();
    if (deny) {
      this.hud.notify(deny, 'bad');
      return;
    }
    this.world.toggleDoor(door, this.player.position);
  }

  private openSuiteDoor(): void {
    if (this.suiteDoor) this.suiteDoor.target = 1;
  }

  private setRoomMood(color: number): void {
    this.roomMood = color;
    for (const { light, base } of this.spaLights) {
      if (color < 0) light.color.copy(base);
      else light.color.copy(base).lerp(new THREE.Color(color), 0.75);
    }
  }

  // =================================================================== interactions
  private setupInteractions(): void {
    const ia = this.interactions;
    const v = (p: { x: number; z: number }): THREE.Vector3 => new THREE.Vector3(p.x, 0, p.z);
    ia.add({ pos: v(SPOTS.reception), radius: 1.9, label: () => 'House terminal (reception)', use: () => this.openMenu(() => this.receptionMenu()) });
    ia.add({ pos: v(SPOTS.bouncer), radius: 1.6, label: () => 'Talk to the security guard', use: () => this.talkBouncer() });
    for (const p of SPOTS.bar) ia.add({ pos: v(p), radius: 1.9, label: () => 'Order at the bar', use: () => this.openMenu(() => this.barMenu()) });
    ia.add({ pos: v(SPOTS.vipBar), radius: 1.8, label: () => 'VIP Champagne (Sofia)', use: () => this.openMenu(() => this.vipBarMenu()) });
    ia.add({ pos: v(SPOTS.suitePanel), radius: 1.4, label: () => 'Suite panel', use: () => this.openMenu(() => this.roomMenu()) });
    for (const seat of SEATS) {
      ia.add({
        pos: v(seat),
        radius: seat.reach ?? 1.5,
        label: () => (this.occupied.has(seat.id) ? null : seat.vip ? 'Sit (VIP bed)' : 'Sit'),
        use: () => this.sit(seat),
      });
    }
    for (const h of this.hostesses) {
      ia.add({
        pos: h.npc.pos,
        radius: 1.8,
        label: () => {
          if (h.status === 'walking') return null;
          if (h.status === 'room') return `${h.p.name} — options`;
          return `Talk to ${h.p.name} (hostess)  ${hearts(h.affinity)}`;
        },
        use: () => {
          h.npc.talk(this.player.position);
          if (h.status === 'room') {
            this.openMenu(() => this.roomHostessMenu(h));
          } else if (hasPersonality(h.p.name)) {
            this.openChat(h);
          } else {
            this.openMenu(() => this.hostessMenu(h));
          }
        },
      });
    }
    for (const npc of this.npcs) {
      if (!npc.talkable) continue;
      ia.add({
        pos: npc.pos,
        radius: 1.7,
        label: () => `Talk to ${npc.name}`,
        use: () => this.hud.notify(`${npc.name}: “${npc.talk(this.player.position)}”`),
      });
    }
  }

  private openChat(h: Hostess): void {
    this.dancing = false;
    this.input.unlock();
    const s = this.state;
    const cb: ChatCallbacks = {
      onAffinityChange: (_name, _delta, total) => { h.affinity = total; },
      onBuyDrink: async () => {
        if (!s.wristband) { this.hud.notify('You need a wristband (entrance terminal).', 'bad'); return; }
        if (!(await this.pay(itemId.fixed('hostessDrink'), 'the drink'))) return;
        this.addAffinity(h, 20);
        this.say(h, 'Cheers! You\'re a sweetheart.', 'good');
      },
      onTip: async () => {
        if (!(await this.pay(itemId.fixed('hostessTip'), 'the tip'))) return;
        this.addAffinity(h, 30);
        this.say(h, 'Generous, huh? I like it.', 'good');
      },
      onInvite: async (accept) => {
        if (accept) {
          if (!(await this.pay(itemId.hostess(h.p.name), `${h.p.name}'s company`))) return;
          this.sendToRoom(h);
        }
      },
      onClose: () => {
        this.chat.close();
        if (!this.cutscene.playing) {
          if (matchMedia('(pointer: coarse)').matches) this.player.enabled = true;
          else document.querySelector('canvas')?.requestPointerLock();
        }
      },
      canBuyDrink: () => s.wristband,
      canInvite: () => h.affinity >= INVITE_THRESHOLD,
      hasReservation: () => !!s.reservation && !this.hostessInRoom(),
      hostessPrice: () => h.p.price,
    };
    this.chat.open(h.p.name, h.affinity, h.status === 'room', cb);
  }

  private openMenu(builder: Parameters<Menu['open']>[0]): void {
    this.dancing = false;
    this.input.unlock();
    this.menu.open(builder);
  }

  private talkBouncer(): void {
    if (this.corridorAllowed()) {
      this.hud.notify('Bruno (security): “All good. The suite is at the end of the corridor.”', 'good');
    } else {
      this.hud.notify('Bruno (security): “The corridor is VIP or suite reservation only. Talk to Lívia at the entrance terminal.”');
    }
  }

  private async pay(item: ItemId, what: string): Promise<boolean> {
    const r = await this.state.spend(item);
    if (r.ok) {
      if (r.fromBank) this.hud.notify(`${money(priceOf(item) ?? 0)} paid — the shortfall was covered by your bank (card).`);
      return true;
    }
    this.hud.notify(`Couldn't pay for ${what}: ${r.error}`, 'bad');
    return false;
  }

  private receptionMenu() {
    const s = this.state;
    const st = s.roomStatus('suite');
    const items: MenuItem[] = [
      {
        label: s.wristband ? 'Wristband ✓' : 'Wristband',
        detail: s.wristband ? 'already owned' : money(PRICES.wristband),
        disabled: s.wristband,
        action: async () => {
          if (s.wristband || !(await this.pay(itemId.fixed('wristband'), 'the wristband'))) return;
          s.wristband = true;
          s.emit();
          this.hud.notify('Wristband on. Bar and hostesses unlocked.', 'good');
        },
      },
      {
        label: s.vip ? 'VIP Pass ✓' : 'VIP Pass (permanent)',
        detail: s.vip ? 'already owned' : money(PRICES.vipPass),
        disabled: s.vip,
        action: async () => {
          if (s.vip || !(await this.pay(itemId.fixed('vipPass'), 'the VIP pass'))) return;
          s.vip = true;
          s.emit();
          this.hud.notify('Welcome to the VIP circle: corridor, suite (when free), champagne, and round bed.', 'good');
        },
      },
      {
        label: 'Book the Jacuzzi Suite',
        detail: st === 'mine' ? 'your reservation' : st === 'occupied' ? 'occupied — come back later' : !s.wristband ? 'buy the wristband first (1)' : `${money(PRICES.room)} / ${ROOM_DURATION_SEC / 60} min`,
        disabled: st !== 'free' || !!s.reservation || !s.wristband,
        action: async () => {
          const err = await s.reserve('suite');
          if (err) this.hud.notify(err, 'bad');
          else this.hud.notify('Suite booked! Security clears the corridor and the door opens only for you (blue light).', 'good');
        },
      },
    ];
    const res = s.reservation;
    if (res) {
      items.push({
        label: 'Extend reservation',
        detail: `+${ROOM_DURATION_SEC / 60} min for ${money(PRICES.roomExtend)}`,
        action: async () => {
          const err = await s.extendReservation();
          this.hud.notify(err ?? 'Reservation extended.', err ? 'bad' : 'good');
        },
      });
    }
    // hostesses in a submenu: main menu stays at most 6 items (keys 1–9)
    items.push({
      label: 'Call a hostess straight to the suite',
      detail: res ? 'paid shortcut (no seduction needed)' : 'reservation required',
      disabled: !res,
      action: () => this.menu.open(() => this.premiumMenu()),
    });
    if (s.account) items.push({ label: 'Solana Wallet', detail: `balance ${money(s.cash)}`, action: () => this.openWallet() });
    else items.push({ label: 'ATM', detail: `bank ${money(s.bank)}`, action: () => this.menu.open(() => this.atmMenu()) });
    items.push({ label: 'Locker — change outfit', action: () => this.menu.open(() => this.lockerMenu()) });
    const hello = s.wristband ? '' : `”Good evening, ${s.name}! The wristband unlocks the bar and the hostesses.”  •  `;
    return {
      title: 'House Terminal — Lívia',
      subtitle: s.account ? `${hello}Balance ${money(s.cash)}` : `${hello}Wallet ${money(s.cash)}  •  Bank ${money(s.bank)} (covers the shortfall)`,
      items,
    };
  }

  // =================================================================== Solana wallet (account)
  private wallet: Awaited<ReturnType<typeof api.wallet>> | null = null;
  private walletNote = '';

  private async openWallet(): Promise<void> {
    this.walletNote = 'Loading…';
    this.menu.open(() => this.walletMenu());
    try {
      this.wallet = await api.wallet();
      this.state.setBalance(this.wallet.balance);
      this.walletNote = '';
    } catch (e) {
      this.walletNote = (e as Error).message;
    }
    if (this.menu.isOpen) this.menu.open(() => this.walletMenu());
  }

  private walletMenu() {
    const w = this.wallet;
    const s = this.state;
    const net = w && w.cluster !== 'mainnet-beta' ? ` (${w.cluster}, test SOL)` : '';
    const lines = w
      ? [
          `Send SOL to your deposit address${net}:`,
          w.address,
          `1 SOL = ${money(w.fichasPerSol)}  •  Balance ${money(s.cash)}`,
          'Deposits arrive after finalization on the network (~30 s).',
        ]
      : [];
    if (this.walletNote) lines.push(this.walletNote);
    const items: MenuItem[] = [];
    if (w) {
      items.push({
        label: 'Copy address',
        action: async () => {
          try {
            await navigator.clipboard.writeText(w.address);
            this.hud.notify('Address copied.', 'good');
          } catch {
            this.hud.notify('Could not copy; select the address on screen.', 'bad');
          }
        },
      });
      items.push({
        label: 'Check deposits',
        action: async () => {
          try {
            const r = await api.refresh();
            s.setBalance(r.balance);
            this.walletNote = r.credited > 0 ? `Deposit received: +${money(r.credited)}.` : 'No new finalized deposits yet.';
            if (r.credited > 0) this.wallet = await api.wallet();
          } catch (e) {
            this.walletNote = (e as Error).message;
          }
        },
      });
      for (const d of w.deposits.slice(0, 3)) {
        items.push({ label: `+${money(d.fichas)}`, detail: `${d.sol} SOL • ${new Date(d.at).toLocaleString('en')}`, disabled: true });
      }
    }
    items.push({
      label: 'Log out',
      action: async () => {
        await api.logout().catch(() => undefined);
        location.reload();
      },
    });
    items.push({ label: '← Back to terminal', action: () => this.menu.open(() => this.receptionMenu()) });
    return { title: `Solana Wallet — ${s.account}`, subtitle: lines.join('\n'), items };
  }

  private premiumMenu() {
    const s = this.state;
    const res = s.reservation;
    const taken = res ? this.hostessInRoom() : undefined;
    const items: MenuItem[] = this.hostesses.map((h): MenuItem => {
      const price = Math.round(h.p.price * PREMIUM_MULT);
      return {
        label: `${h.p.name}, ${h.p.age} — ${h.p.style}`,
        detail: !res ? 'reservation required' : h.status !== 'floor' ? 'unavailable' : taken ? 'suite already has company' : money(price),
        disabled: !res || h.status !== 'floor' || !!taken,
        action: async () => {
          if (!res || !(await this.pay(itemId.hostessPremium(h.p.name), `${h.p.name}'s company`))) return;
          this.hud.notify(`Lívia: “${h.p.name} is on her way to the suite.”`, 'good');
          this.sendToRoom(h);
          return 'close';
        },
      };
    });
    items.push({ label: '← Back to terminal', action: () => this.menu.open(() => this.receptionMenu()) });
    return { title: 'Hostess straight to suite', subtitle: `Shortcut: ${PREMIUM_MULT}× the normal price, no seduction needed.`, items };
  }

  private barMenu() {
    const s = this.state;
    if (!s.wristband) {
      return {
        title: 'Bar — Carla',
        subtitle: '”Without a wristband I can\'t place your order. Get one at the entrance terminal.”',
        items: [] as MenuItem[],
      };
    }
    return {
      title: 'Bar — Carla',
      subtitle: `Wallet: ${money(s.cash)}  •  Buzz: ${Math.round(s.buzz * 100)}%`,
      items: DRINKS.map((d): MenuItem => ({
        label: d.name,
        detail: money(d.price),
        action: async () => {
          if (d.alcohol && s.buzz >= 0.8) {
            this.hud.notify('Carla: “I think that\'s enough for tonight. How about some water?”', 'bad');
            return;
          }
          if (!(await this.pay(itemId.drink(d.id), d.name))) return;
          s.buzz = clamp(s.buzz + d.buzz, 0, 1);
          this.hud.notify(`You ordered: ${d.name}.`, 'good');
        },
      })),
    };
  }

  private vipBarMenu() {
    const s = this.state;
    return {
      title: 'VIP Champagne — Sofia',
      subtitle: `Wallet: ${money(s.cash)}`,
      items: [
        {
          label: 'House champagne',
          detail: money(PRICES.vipChampagne),
          action: async () => {
            if (!(await this.pay(itemId.fixed('vipChampagne'), 'the champagne'))) return;
            s.buzz = clamp(s.buzz + 0.15, 0, 1);
            s.vibe = Math.min(99, s.vibe + 40);
            this.hud.notify('Pop! Champagne served. Vibe through the roof.', 'good');
          },
        },
        {
          label: 'Sparkling water',
          detail: 'complimentary',
          action: () => {
            s.buzz = clamp(s.buzz - 0.2, 0, 1);
            this.hud.notify('Sparkling water, on the house.');
          },
        },
      ] as MenuItem[],
    };
  }

  private atmMenu() {
    const s = this.state;
    const withdraw = (v: number): MenuItem => ({
      label: `Withdraw ${money(v)}`,
      disabled: s.bank < v,
      action: () => {
        if (s.withdraw(v)) this.hud.notify(`Withdrew ${money(v)}.`, 'good');
      },
    });
    return {
      title: 'ATM',
      subtitle: `Wallet: ${money(s.cash)}  •  Bank: ${money(s.bank)}`,
      items: [
        withdraw(100),
        withdraw(500),
        {
          label: 'Deposit all',
          disabled: s.cash <= 0,
          action: () => {
            this.hud.notify(`Deposited: ${money(s.depositAll())}.`);
          },
        },
        { label: '← Back to terminal', action: () => this.menu.open(() => this.receptionMenu()) },
      ],
    };
  }

  private lockerMenu() {
    return {
      title: 'Locker — change outfit',
      subtitle: 'Pick a shirt color (visible in 3rd person, press V)',
      items: [
        ...OUTFITS.map((o): MenuItem => ({
          label: o.name,
          detail: o.color === this.state.shirt ? 'wearing' : undefined,
          action: () => {
            this.state.shirt = o.color;
            this.char.setShirt(o.color);
            this.state.emit();
          },
        })),
        { label: '← Back to terminal', action: () => this.menu.open(() => this.receptionMenu()) },
      ],
    };
  }

  private roomMenu() {
    const s = this.state;
    const mine = s.roomStatus('suite') === 'mine';
    const items: MenuItem[] = MOODS.map((m) => ({
      label: `Light: ${m.name}`,
      detail: this.roomMood === m.color ? 'active' : undefined,
      disabled: !mine,
      action: () => this.setRoomMood(m.color),
    }));
    if (mine) {
      items.push({
        label: 'End reservation',
        detail: 'frees the suite',
        action: () => {
          s.releaseRoom();
          this.onReservationEnded();
          this.hud.notify('Suite released. Thank you!');
          return 'close';
        },
      });
    }
    const remaining = mine && s.reservation ? formatTime(s.reservation.expiresAt - s.elapsed) : null;
    return {
      title: 'Panel — Jacuzzi Suite',
      subtitle: mine ? `Your reservation • ${remaining} left` : 'You don\'t have a reservation for this suite.',
      items,
    };
  }

  // =================================================================== NPCs
  private spawnNpcs(scene: THREE.Scene): void {
    const add = (o: ConstructorParameters<typeof Npc>[0]): Npc => {
      const n = new Npc(o, scene);
      this.npcs.push(n);
      return n;
    };
    const look = (build: 'm' | 'f', shirt?: number, scale?: number): Look => {
      const l = randomLook(build, shirt);
      return scale ? { ...l, scale } : l;
    };
    const at = (p: { x: number; z: number }) => ({ x: p.x, z: p.z, y: this.floorAt(p.x, p.z) });

    // staff
    add({ name: 'Lívia', look: look('f', 0x111111), ...at(STAFF.reception), yaw: STAFF.reception.yaw, mode: 'static' });
    add({ name: 'Bruno', look: look('m', 0x0a0a0a, 1.12), ...at(STAFF.bouncer), yaw: STAFF.bouncer.yaw, mode: 'static' });
    this.barNpc = add({ name: 'Carla', look: look('f', 0xf2f2f2), x: STAFF.barA.x, z: STAFF.barA.z, mode: 'pace', paceTo: STAFF.barB });
    this.nyx = add({ name: 'Nyx', look: look('f', 0x9b4dff), ...at(STAFF.cage), yaw: STAFF.cage.yaw, mode: 'static', pose: 'dance' });
    add({ name: 'Kiara', look: look('f', 0xd4af37), ...at(STAFF.stage), yaw: STAFF.stage.yaw, mode: 'static', pose: 'dance' });
    add({ name: 'Sofia', look: look('f', 0xd4af37), ...at(STAFF.vipBar), yaw: STAFF.vipBar.yaw, mode: 'static' });

    const used = new Set<string>();
    const name = (build: 'm' | 'f'): string => {
      const pool = (build === 'f' ? NAMES_F : NAMES_M).filter((n) => !used.has(n) && !HOSTESSES.some((h) => h.name === n));
      const n = pool.length ? pick(pool) : `Guest ${used.size + 1}`;
      used.add(n);
      return n;
    };
    // crowd (~70% women), fewer people than PeekHole: the hall is much smaller
    const crowd = (build: 'm' | 'f', mode: 'dance' | 'wander'): void => {
      const a = mode === 'dance' ? RECTS.danceSpots : RECTS.clubWander;
      add({ name: name(build), look: look(build), x: rand(a.minX, a.maxX), z: rand(a.minZ, a.maxZ), mode, area: a, lines: PATRON_LINES });
    };
    (['f', 'f', 'f', 'm'] as const).forEach((b) => crowd(b, 'dance'));
    (['f', 'f', 'm'] as const).forEach((b) => crowd(b, 'wander'));

    const seatNpc = (seatId: string, build: 'm' | 'f'): void => {
      const seat = SEATS.find((s) => s.id === seatId);
      if (!seat) return;
      this.occupied.add(seat.id);
      const floor = this.floorAt(seat.exit.x, seat.exit.z);
      const y = floor + seat.height - (seat.pose === 'sit' ? 0.5 : 0.7);
      add({ name: name(build), look: look(build), x: seat.x, z: seat.z, y, yaw: seat.yaw, mode: 'static', pose: seat.pose, lines: PATRON_LINES });
    };
    seatNpc('booth0.4a', 'f');
    seatNpc('booth0.4b', 'm');
    seatNpc('stool5', 'f');
    seatNpc('armchair-w', 'f');

    HOSTESSES.forEach((p, i) => {
      const { area, mode } = HOSTESS_AREAS[i % HOSTESS_AREAS.length];
      const npc = add({
        name: p.name,
        look: { build: 'f', shirt: p.dress, pants: 0x1a1a1a, skin: p.skin, hair: p.hair, scale: 0.97 },
        x: rand(area.minX, area.maxX),
        z: rand(area.minZ, area.maxZ),
        mode,
        area,
        talkable: false,
      });
      this.hostesses.push({ p, npc, affinity: 0, status: 'floor', room: null, area, areaMode: mode, talkReadyAt: 0, danceUntil: 0, noticed: false, line: 0 });
    });
  }

  // =================================================================== hostesses
  private hostessLine(h: Hostess, kind: keyof typeof HOSTESS_LINES): string {
    const list = HOSTESS_LINES[kind];
    return list[h.line++ % list.length];
  }

  private say(h: Hostess, text: string, kind: 'info' | 'good' | 'bad' = 'info'): void {
    this.hud.notify(`${h.p.name}: “${text}”`, kind);
  }

  private addAffinity(h: Hostess, v: number): void {
    const before = h.affinity;
    h.affinity = clamp(h.affinity + v, 0, 100);
    if (before < INVITE_THRESHOLD && h.affinity >= INVITE_THRESHOLD) this.say(h, this.hostessLine(h, 'high'), 'good');
  }

  /** Walks the hostess to the suite: free lane on the floor → corridor → door → inside. */
  private sendToRoom(h: Hostess): void {
    const r = SUITE_ROUTE;
    h.status = 'walking';
    h.room = 'suite';
    const start = { x: r.lane, z: clamp(h.npc.pos.z, -9, 8) };
    h.npc.followRoute([start, r.hall, r.corridorIn, r.doorOut], () => {
      this.openSuiteDoor();
      h.npc.followRoute([r.doorIn, r.stay], () => {
        h.status = 'room';
        h.npc.settle(r.stay.yaw, 'idle');
        this.hud.notify(`${h.p.name} arrived at the Jacuzzi Suite and is waiting for you.`, 'good');
      });
    });
  }

  private sendBack(h: Hostess): void {
    if (!h.room || h.status === 'floor') return;
    const r = SUITE_ROUTE;
    h.status = 'walking';
    h.danceUntil = 0;
    h.npc.setPose('idle');
    h.npc.followRoute([r.doorIn], () => {
      this.openSuiteDoor();
      const back = { x: rand(h.area.minX, h.area.maxX), z: rand(h.area.minZ, h.area.maxZ) };
      h.npc.followRoute([r.doorOut, r.corridorIn, r.hall, { x: r.lane, z: back.z }, back], () => {
        h.status = 'floor';
        h.room = null;
        h.npc.resume(h.areaMode, h.area);
      });
    });
  }

  private onReservationEnded(): void {
    for (const h of this.hostesses) if (h.room) this.sendBack(h);
  }

  private hostessInRoom(): Hostess | undefined {
    return this.hostesses.find((h) => h.room && h.status !== 'floor');
  }

  private hostessMenu(h: Hostess) {
    const s = this.state;
    const res = s.reservation;
    const busy = res ? this.hostessInRoom() : undefined;
    const band = s.wristband;
    const items: MenuItem[] = [
      {
        label: 'Chat',
        detail: s.elapsed < h.talkReadyAt ? 'wait...' : 'free',
        disabled: s.elapsed < h.talkReadyAt,
        action: () => {
          h.talkReadyAt = s.elapsed + 12;
          this.addAffinity(h, 8);
          this.say(h, this.hostessLine(h, h.affinity >= INVITE_THRESHOLD ? 'high' : h.affinity >= 30 ? 'mid' : 'low'));
        },
      },
      {
        label: 'Buy her a drink',
        detail: band ? money(PRICES.hostessDrink) : 'wristband required',
        disabled: !band,
        action: async () => {
          if (!(await this.pay(itemId.fixed('hostessDrink'), 'the drink'))) return;
          this.addAffinity(h, 20);
          this.say(h, 'Cheers! You\'re a sweetheart.', 'good');
        },
      },
      {
        label: 'Tip her',
        detail: money(PRICES.hostessTip),
        action: async () => {
          if (!(await this.pay(itemId.fixed('hostessTip'), 'the tip'))) return;
          this.addAffinity(h, 30);
          this.say(h, 'Generous, huh? I like it.', 'good');
        },
      },
      {
        label: 'Invite to the suite',
        detail: !res ? 'book the suite first' : busy ? 'suite already has company' : money(h.p.price),
        disabled: !res || !!busy,
        action: async () => {
          if (!res) return;
          if (h.affinity < INVITE_THRESHOLD) {
            this.say(h, this.hostessLine(h, 'refuse'), 'bad');
            return;
          }
          if (!(await this.pay(itemId.hostess(h.p.name), `${h.p.name}'s company`))) return;
          this.say(h, 'Deal. I\'ll meet you at the suite.', 'good');
          this.sendToRoom(h);
          return 'close';
        },
      },
    ];
    return {
      title: `${h.p.name}, ${h.p.age} — hostess`,
      subtitle: `${h.p.style}. ${h.p.bio}  •  Interest ${hearts(h.affinity)}  •  Wallet ${money(s.cash)}`,
      items,
    };
  }

  private roomHostessMenu(h: Hostess) {
    const s = this.state;
    const dancing = h.danceUntil > s.elapsed;
    return {
      title: `${h.p.name} — Jacuzzi Suite`,
      subtitle: `Interest ${hearts(h.affinity)}  •  Wallet ${money(s.cash)}`,
      items: [
        {
          label: '★ Private dance (scene)',
          detail: money(PRICES.privateDance),
          disabled: dancing,
          action: async () => {
            if (!(await this.pay(itemId.fixed('privateDance'), 'the private dance'))) return;
            h.danceUntil = s.elapsed + 20;
            s.vibe = Math.min(99, s.vibe + 30);
            this.startScene('privateDance', h);
            return 'close';
          },
        },
        {
          label: '★ Champagne for two (scene)',
          detail: money(PRICES.roomChampagne),
          action: async () => {
            if (!(await this.pay(itemId.fixed('roomChampagne'), 'the champagne'))) return;
            s.buzz = clamp(s.buzz + 0.12, 0, 1);
            this.addAffinity(h, 15);
            this.startScene('champagne', h);
            return 'close';
          },
        },
        {
          label: '★ Special night (scene)',
          detail: h.affinity >= 80 ? money(PRICES.specialNight) : 'requires ♥ 4/5',
          disabled: h.affinity < 80,
          action: async () => {
            if (!(await this.pay(itemId.fixed('specialNight'), 'the special night'))) return;
            s.vibe = Math.min(99, s.vibe + 50);
            this.addAffinity(h, 25);
            this.startScene('specialNight', h);
            return 'close';
          },
        },
        {
          label: 'Chat (scene)',
          action: () => {
            this.startScene('roomChat', h);
            return 'close';
          },
        },
        { label: 'Quick chat', action: () => this.say(h, this.hostessLine(h, 'room')) },
        {
          label: 'End the night with her',
          action: () => {
            this.say(h, 'It was great. Come find me on the floor again!');
            this.sendBack(h);
            return 'close';
          },
        },
      ] as MenuItem[],
    };
  }

  // =================================================================== scenes
  private startScene(sceneId: string, h: Hostess): void {
    const builder = SCENES[sceneId];
    if (!builder) return;
    const p = this.player.position;
    const ctx: SceneContext = {
      hostessPos: { x: h.npc.pos.x, y: h.npc.pos.y, z: h.npc.pos.z },
      playerPos: { x: p.x, y: p.y, z: p.z },
      roomCenter: { x: SUITE_CENTER.x, y: 0, z: SUITE_CENTER.z },
    };
    const steps = builder(ctx);
    this.cutscenePose = 'idle';
    this.hud.setVisible(false);
    this.hud.setPrompt(null);
    this.input.unlock();
    this.char.root.visible = true;

    this.cutscene.play(steps, {
      onPose: (target, pose) => {
        if (target === 'hostess') h.npc.setPose(pose);
        if (target === 'player') this.cutscenePose = pose;
      },
      onEnd: () => {
        this.cutscenePose = 'idle';
        this.hud.setVisible(true);
        this.input.lock();
        h.npc.setPose('idle');
        this.char.root.visible = this.view.mode === 'third';
      },
    });
  }

  // =================================================================== opening
  get hasIntro(): boolean { return this.entrance !== null; }

  /**
   * Builds the entrance (hidden) and pre-compiles its shaders with the street lights so the
   * opening scene starts without a stutter. The target is the off-screen render target.
   */
  async prepareIntro(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): Promise<void> {
    if (this.entrance) return;
    const wallZ = this.clubRoom ? new THREE.Box3().setFromObject(this.clubRoom).max.z : 12.45;
    const e = new Entrance(this.world.spawn.position.x, wallZ);
    await e.ready;
    this.scene.add(e.group, e.lights);
    this.entrance = e;

    this.world.setOutside(true);
    e.setVisible(true);
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    // only the entrance meshes and the character: lights come from the scene (separate group, no duplicates)
    renderer.compile(e.group, this.camera, this.scene);
    renderer.compile(this.char.root, this.camera, this.scene);
    renderer.setRenderTarget(previous);
    e.setVisible(false);
    this.world.setOutside(false);
  }

  /** Plays the opening; the callback runs when the player is on the floor (or skipped). */
  playIntro(onDone: () => void): void {
    const e = this.entrance;
    if (!e) {
      onDone();
      return;
    }
    const p = this.player;
    const spawn = this.world.spawn;
    // how far back behind the spawn point before hitting the front wall
    let back = 2;
    const bvh = this.world.collision.bvh;
    if (bvh) {
      _down.origin.set(spawn.position.x, spawn.position.y + p.eyeOffset, spawn.position.z);
      _down.direction.set(0, 0, 1);
      const hit = bvh.raycastFirst(_down, THREE.DoubleSide);
      if (hit) back = Math.max(0, Math.min(back, hit.distance - 0.5));
      _down.direction.set(0, -1, 0);
    }
    const director = new IntroDirector(e, spawn.position, p.eyeOffset, back);
    this.intro = director;
    const fade = document.getElementById('cs-fade');
    const cam = this.camera;
    let inside = false;
    let mix = '';

    const goInside = (): void => {
      if (inside) return;
      inside = true;
      this.world.setOutside(false);
      e.setVisible(false);
      this.char.root.visible = false;
      this.cutscenePose = 'idle';
      p.position.copy(spawn.position);
      p.velocity.set(0, 0, 0);
    };

    this.world.setOutside(true);
    e.setVisible(true);
    this.hud.setVisible(false);
    this.hud.setPrompt(null);
    this.char.root.visible = true;

    this.cutscene.play([{ type: 'wait', duration: INTRO_SECONDS }], {
      skipLabel: 'Hold [Space] to skip',
      onUpdate: (_dt, t) => {
        const f = director.sample(t);
        if (f.inside) {
          goInside();
          p.yaw = spawn.yaw; // mouse doesn't change direction during the scene
          p.pitch = 0;
        } else {
          p.position.set(f.x, 0, f.z);
          p.yaw = f.yaw;
          this.cutscenePose = f.pose;
        }
        cam.position.set(f.cam.x, f.cam.y, f.cam.z);
        cam.lookAt(f.look.x, f.look.y, f.look.z);
        if (Math.abs(cam.fov - f.fov) > 0.05) {
          cam.fov = f.fov;
          cam.updateProjectionMatrix();
        }
        if (fade) fade.style.opacity = f.fade.toFixed(3);
        // audio is only readjusted when the level changes (not every frame)
        const key = `${(f.volume * 10) | 0}:${(f.cutoff / 100) | 0}`;
        if (key !== mix) {
          mix = key;
          this.audio.setMix(f.volume, f.cutoff);
        }
      },
      onEnd: () => {
        goInside();
        this.intro = null;
        p.yaw = spawn.yaw;
        p.pitch = 0;
        if (p.crouching) p.setCrouch(false);
        if (cam.fov !== 70) {
          cam.fov = 70;
          cam.updateProjectionMatrix();
        }
        e.dispose();
        this.entrance = null;
        this.hud.setVisible(true);
        this.char.root.visible = this.view.mode === 'third';
        onDone();
      },
    });
    if (fade) fade.style.opacity = '1';
  }

  private separateNpcs(): void {
    const list = this.npcs;
    for (let i = 0; i < list.length; i++) {
      if (!list[i].moves) continue;
      for (let j = i + 1; j < list.length; j++) {
        if (!list[j].moves) continue;
        pushApart(list[i].pos, list[j].pos, 0.6, true);
      }
    }
  }

  // =================================================================== HUD / audio
  private updateZoneAndAudio(): void {
    const p = this.player.position;
    const zone = zoneAt(p.x, p.z);
    if (zone && zone !== this.zone) {
      this.zone = zone;
      this.hud.setZone(zone.name);
      this.refreshHud();
    }
    const id = this.zone?.id;
    const doorOpen = (this.suiteDoor?.open ?? 0) > 0.3;
    if (id === 'club') this.audio.setMix(1, 16000);
    else if (id === 'corridor') this.audio.setMix(0.5, 1400);
    else this.audio.setMix(doorOpen ? 0.42 : 0.26, doorOpen ? 1600 : 600);
  }

  private updateHudFrame(dt: number): void {
    const s = this.state;
    const minutes = (22 * 60 + Math.floor(s.elapsed)) % (24 * 60);
    this.hud.setClock(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
    this.hud.setBars(s.vibe, s.buzz);

    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.hud.setFps(`${Math.round(this.fpsFrames / this.fpsTime)} fps`);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    this.markers.length = 0;
    for (const n of this.npcs) this.markers.push({ x: n.pos.x, z: n.pos.z, color: '#ff8fd0' });
    this.minimap.draw(this.player.position.x, this.player.position.z, this.player.yaw, this.markers);
  }

  refreshHud(): void {
    const s = this.state;
    this.hud.setName(s.name);
    this.hud.setMoney(s.account ? `Balance ${money(s.cash)}  •  account ${s.account}` : `Wallet ${money(s.cash)}  •  Bank ${money(s.bank)}`);
    const items: string[] = [];
    if (s.wristband) items.push('Wristband');
    if (s.vip) items.push('VIP Pass');
    if (s.reservation) items.push(`Suite key — ${formatTime(s.reservation.expiresAt - s.elapsed)}`);
    this.hud.setItems(items);

    let obj = 'Explore: bar, dance floor (G to dance), booths, stage, and the suite in the back.';
    if (!s.wristband) obj = 'Buy your wristband at the entrance terminal (Lívia).';
    else if (s.reservation) {
      const h = this.hostessInRoom();
      if (h) obj = this.zone?.id === 'spa' ? `${h.p.name} is with you. Press E near her.` : `${h.p.name} is waiting at the Jacuzzi Suite (end of the corridor).`;
      else obj = 'Suite booked. Win over a hostess on the floor (♥ 3/5) or call one from the terminal.';
    }
    this.hud.setObjective(obj);
  }

  welcome(): void {
    this.hud.notify(`Welcome to Jack of Hearts, ${this.state.name}.`, 'good');
    this.hud.notify('Tip: H shows the controls.');
  }
}

function planarDist(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function near(a: THREE.Vector3, b: THREE.Vector3, r: number): boolean {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz < r * r;
}

/** Pushes `a` away from `b` (or both, if `both`) up to the minimum distance. */
function pushApart(a: THREE.Vector3, b: THREE.Vector3, min: number, both = false): void {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= min * min || d2 < 1e-8) return;
  const d = Math.sqrt(d2);
  const push = (min - d) / (both ? 2 : 1);
  a.x += (dx / d) * push;
  a.z += (dz / d) * push;
  if (both) {
    b.x -= (dx / d) * push;
    b.z -= (dz / d) * push;
  }
}

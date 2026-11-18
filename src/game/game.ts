/**
 * Regras de jogo (vindas do PeekHole) sobre o cenário e o motor do boate:
 * pulseira, passe VIP, reserva da Suíte Jacuzzi, economia, bar, anfitriãs com interesse,
 * convite para a suíte, cenas, NPCs, assentos, dança, HUD, minimapa e áudio por zona.
 *
 * O motor do boate (engine/*.js) continua dono do movimento, da colisão 3D, da porta com
 * dobradiça, da jacuzzi e dos gráficos. Este módulo só lê/aciona esse motor pelas
 * interfaces abaixo. Toda regra de acesso está em `doorRule()`/`corridorAllowed()` (um ponto
 * só, fácil de levar para um servidor autoritativo se houver multiplayer).
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

// ------------------------------------------------------------------ motor do boate (JS)
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
  /** Cena de entrada: esconde o cenário inteiro enquanto o jogador está do lado de fora. */
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

// ------------------------------------------------------------------ conteúdo
const SKINS = [0xf1c7a5, 0xd9a07a, 0xc68a64, 0x8d5a3b, 0x5c3a24];
const HAIRS = [0x111111, 0x3b2414, 0xd8b46a, 0x7a2b18, 0x777777, 0x9b4dff];
const SHIRTS = [0xff3fa4, 0x9b4dff, 0x00b3d6, 0x111111, 0xf2f2f2, 0xc0143c, 0xffcc33, 0x2e8b57, 0x1f3b73];
const PANTS = [0x1d1d2b, 0x111111, 0x2b2b2b, 0x3b2a1a, 0x24304a];
const NAMES_F = ['Marina', 'Duda', 'Nina', 'Bia', 'Carla', 'Júlia', 'Lara', 'Helena', 'Camila', 'Sabrina', 'Paula', 'Isadora', 'Manu', 'Rebeca', 'Alice', 'Giovana'];
const NAMES_M = ['Téo', 'Rafa', 'Igor', 'Léo', 'Vini', 'Paulo', 'Davi', 'Otto'];
const DRESSES = [0xc0143c, 0x111111, 0xff3fa4, 0x9b4dff, 0xd4af37, 0x00b3d6, 0xf2f2f2, 0x7a1d3a];
const LEGS_F = [0x1a1a1a, 0xc68a64, 0xf1c7a5, 0x8d5a3b, 0x2b1a2b];

/** Anfitriãs da casa — todas adultas (idade no perfil). Conteúdo não explícito. */
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
  { name: 'Valentina', age: 27, style: 'Elegante', bio: 'Adora champagne e boa conversa.', price: HOSTESS_PRICES.Valentina, dress: 0xc0143c, hair: 0x111111, skin: 0xd9a07a },
  { name: 'Yasmin', age: 24, style: 'Divertida', bio: 'Rainha da pista, ri de tudo.', price: HOSTESS_PRICES.Yasmin, dress: 0xff3fa4, hair: 0xd8b46a, skin: 0xf1c7a5 },
  { name: 'Bianca', age: 31, style: 'Misteriosa', bio: 'Fala pouco, observa muito.', price: HOSTESS_PRICES.Bianca, dress: 0x111111, hair: 0x7a2b18, skin: 0xc68a64 },
  { name: 'Luna', age: 26, style: 'Dançarina', bio: 'Não sai de perto da gaiola da Nyx.', price: HOSTESS_PRICES.Luna, dress: 0x9b4dff, hair: 0x3b2414, skin: 0x8d5a3b },
];

const INVITE_THRESHOLD = 60;

/** Modelo de cada anfitriã. armsUp: false = mão nasceu grudada no quadril; não ergue os braços. */
const HOSTESS_MODELS = {
  Valentina: { file: 'cyber_d.glb', armsUp: true },
  Yasmin: { file: 'cyber_c.glb', armsUp: true },
  Bianca: { file: 'cyber_b.glb', armsUp: false },
  Luna: { file: 'cyber_a.glb', armsUp: true },
} as const;
const NYX_MODEL = 'tropical.glb';
/** Atrás do módulo do balcão em z = -1,255 (x do pacote da bartender: 0,80 m atrás do tampo). */
const BARTENDER_SPOT = { x: 4.599, z: -1.255 };

const HOSTESS_LINES = {
  low: ['Oi! Primeira noite no Lótus?', 'Gosto de gente que sabe puxar assunto.', 'Me paga um drink e a gente vê no que dá.'],
  mid: ['Você dança bem, sabia?', 'Tô começando a gostar da sua companhia.', 'Hmm, continua falando...'],
  high: ['Se você reservar a suíte, eu topo te fazer companhia.', 'Acho que a gente combina. Vamos pra um lugar mais reservado?'],
  refuse: ['Calma... ainda nem te conheço direito.', 'Quem sabe mais tarde. Me conquista primeiro.'],
  room: ['Que suíte linda. Escolheu bem a luz.', 'Relaxa, a noite é nossa.', 'Aqui ninguém incomoda a gente.', 'A água tá uma delícia, sabia?'],
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
  'Primeira vez aqui? Relaxa, a regra é uma só: respeito.',
  'Aqui só rola o que todo mundo topar. Simples assim.',
  'A Nyx na gaiola hoje tá impecável.',
  'Já reservou a suíte? Depois da meia-noite ela some.',
  'Dizem que a suíte do fundo tem jacuzzi... nunca fui.',
  'Pede o "Olho Mágico" no bar. Confia.',
  'Se alguém disser não, é não. A segurança aqui é rígida.',
  'Discrição é tudo. O que acontece no Lótus...',
  'Bora pra pista? Aperta G e se solta!',
  'Já viu o holograma da flor de lótus? Hipnotiza.',
];

export const OUTFITS: Array<{ name: string; color: number }> = [
  { name: 'Azul royal', color: 0x3a7bd5 },
  { name: 'Preto', color: 0x141414 },
  { name: 'Vinho', color: 0x7a1d3a },
  { name: 'Rosa neon', color: 0xff3fa4 },
  { name: 'Roxo', color: 0x9b4dff },
  { name: 'Branco', color: 0xf2f2f2 },
  { name: 'Dourado', color: 0xd4af37 },
];

const MOODS: Array<{ name: string; color: number }> = [
  { name: 'Original', color: -1 },
  { name: 'Rosa', color: 0xff3fa4 },
  { name: 'Roxo', color: 0x8a5cff },
  { name: 'Vermelho', color: 0xff2a2a },
  { name: 'Azul', color: 0x2a7bff },
  { name: 'Âmbar', color: 0xffa53f },
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
  /** Toque segurado na tela (celular): vale como pular a abertura. */
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
    player.onBlockedStand = () => hud.notify('Sem espaço para levantar aqui.', 'bad');
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

    // painel da suíte (lado de dentro, ao lado da porta) e luz de status no corredor
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

  // =================================================================== utilidades
  /** Altura do piso (ou do móvel) logo abaixo de (x, z), pela colisão 3D do boate. */
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
  /** Chamar depois de player.update e world.update. */
  update(dt: number, active: boolean): void {
    this.time += dt;
    this.state.elapsed += dt;

    if (this.cutscene.playing) {
      // na abertura o mouse fica preso: Espaço pula sem soltar o mouse (Esc também vale)
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
        if (this.dancing) this.hud.notify('Dançando. Ande para parar.');
      }
    }
    if (!p.seat && this.seatDef) this.seatDef = null; // terminou de levantar
    const planar = Math.hypot(p.velocity.x, p.velocity.z);
    if (planar > 0.6 || p.seat || p.crouching) this.dancing = false;
    this.gateCorridor();

    for (const npc of this.npcs) {
      npc.update(dt, this.collision);
      if (!p.seat) pushApart(p.position, npc.pos, PLAYER_RADIUS + 0.3);
    }
    // cabelo com física e olhos só andam com ela à vista (sala do bar visível)
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
      root.position.y -= 0.05; // na água
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

  /** NPCs e o boneco do jogador somem junto com a sala em que estão (o boate esconde salas). */
  private updateVisibility(): void {
    const show = (x: number, z: number): boolean => {
      const node = zoneAt(x, z)?.id === 'spa' ? this.spaRoom : this.clubRoom;
      return node ? node.visible : true;
    };
    for (const n of this.npcs) n.char.root.visible = show(n.pos.x, n.pos.z);
    if (this.bartender) this.bartender.root.visible = show(BARTENDER_SPOT.x, BARTENDER_SPOT.z);
    // (na abertura o boneco está na rua, fora de qualquer sala)
    if (this.char.root.visible && !this.intro) this.char.root.visible = show(this.player.position.x, this.player.position.z);
  }

  /**
   * Troca os bonecos low-poly das anfitriãs, da Nyx e da bartender pelos modelos com esqueleto.
   * Roda depois que o jogo já abriu: até terminar de baixar (~8 MB), ficam os provisórios.
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

    // a animação dela foi feita para um módulo do balcão: fica parada ali, de frente para o tampo
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

  // =================================================================== ação (tecla E / botão de toque)
  action(): Action | null {
    const p = this.player;
    if (p.seat) {
      if (!p.seated) return null; // ainda sentando ou levantando
      if (this.seatDef) return { label: 'Levantar', short: 'Levantar', run: () => this.standUp() };
      return { label: 'Sair da jacuzzi', short: 'Sair', run: () => this.leavePool() };
    }
    const fwd = this.playerForward(_dir);
    const hit = this.interactions.find(p.position, fwd);
    let door = this.world.doorInReach(p.position, fwd);
    // Porta e pessoa ao alcance (a anfitriã espera junto da porta da suíte): vale a que está
    // à frente; com as duas à frente, a mais perto. O boate aceita a porta até de costas
    // quando ela está a menos de 1,1 m.
    if (door && hit) {
      const dd = planarDist(door.center, p.position);
      const facing = dd > 1e-3 ? ((door.center.x - p.position.x) * fwd.x + (door.center.z - p.position.z) * fwd.z) / dd : 1;
      if (facing < 0.5 || planarDist(hit.item.pos, p.position) < dd) door = null;
    }
    if (door) {
      const closing = door.target === 1;
      return {
        label: `${closing ? 'Fechar' : 'Abrir'} porta — ${ROOM_LABEL.suite}`,
        short: closing ? 'Fechar' : 'Abrir',
        run: () => this.tryDoor(door),
      };
    }
    const pool = this.world.poolInReach(p.position, fwd);
    if (pool) {
      const label = this.world.inWater ? 'Sentar na água' : 'Entrar na jacuzzi';
      return { label, short: this.world.inWater ? 'Sentar' : 'Entrar', run: () => this.enterPool(pool) };
    }
    if (hit) return { label: hit.label, short: 'Usar', run: () => hit.item.use() };
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
      this.hud.notify('Cama VIP: só com o passe VIP (terminal da entrada).', 'bad');
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
    // seatDef é limpo no update, quando o Player termina de levantar
  }

  // =================================================================== regras
  private updateRules(dt: number): void {
    const s = this.state;
    s.buzz = clamp(s.buzz - dt * 0.012, 0, 1);
    const pos = this.player.position;

    if (this.dancing && pointInRect(pos.x, pos.z, RECTS.danceFloor)) {
      s.vibe += dt * 6;
      if (s.vibe >= 100) {
        s.vibe = 0;
        void s.reward(Math.round(rand(40, 80))).then((r) => {
          if ('prize' in r) this.hud.notify(`Você venceu o concurso de dança da noite! +${money(r.prize)}`, 'good');
          else this.hud.notify(`Concurso de dança: ${r.error}`);
        });
      }
    } else {
      s.vibe = Math.max(0, s.vibe - dt * 1.5);
    }

    for (const h of this.hostesses) {
      // dançar perto dela chama atenção (persuasão sem gastar dinheiro, só tempo)
      if (h.status === 'floor' && this.dancing && near(pos, h.npc.pos, 3.5)) {
        if (!h.noticed) {
          h.noticed = true;
          this.say(h, 'Opa, alguém aqui sabe dançar...');
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
      this.hud.notify('Sua reserva da Suíte Jacuzzi terminou.', 'bad');
    }
    // casais NPC ocupam e liberam a suíte de vez em quando (fecha a porta se o jogador não está lá)
    if (s.roomStatus('suite') === 'free' && this.zone?.id !== 'spa' && this.zone?.id !== 'corridor' && Math.random() < 1 / 60) {
      s.occupiedUntil.suite = s.elapsed + rand(40, 90);
      if (this.suiteDoor) this.suiteDoor.target = 0;
    }
    const st = s.roomStatus('suite');
    this.statusMat.color.setHex(STATUS_COLORS[st]).multiplyScalar(2.5);
    this.panelMat.color.setHex(st === 'mine' ? STATUS_COLORS.mine : 0x66ffcc).multiplyScalar(1.6);
    this.refreshHud();
  }

  /** O segurança só deixa passar para o corredor quem tem passe VIP ou a suíte reservada. */
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
        this.hud.notify('Bruno (segurança): “Daqui pra frente só VIP ou quem reservou a suíte. O terminal fica na entrada.”', 'bad');
      }
    }
  }

  private doorRule(): string | null {
    const s = this.state;
    if (this.zone?.id === 'spa') return null; // sair é sempre permitido
    const st = s.roomStatus('suite');
    if (st === 'mine') return null;
    if (st === 'occupied') return 'Suíte ocupada. Volte mais tarde.';
    if (s.vip) return null;
    return 'Suíte livre — reserve no terminal da entrada.';
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

  // =================================================================== interações
  private setupInteractions(): void {
    const ia = this.interactions;
    const v = (p: { x: number; z: number }): THREE.Vector3 => new THREE.Vector3(p.x, 0, p.z);
    ia.add({ pos: v(SPOTS.reception), radius: 1.9, label: () => 'Terminal da casa (recepção)', use: () => this.openMenu(() => this.receptionMenu()) });
    ia.add({ pos: v(SPOTS.bouncer), radius: 1.6, label: () => 'Falar com o segurança', use: () => this.talkBouncer() });
    for (const p of SPOTS.bar) ia.add({ pos: v(p), radius: 1.9, label: () => 'Pedir no bar', use: () => this.openMenu(() => this.barMenu()) });
    ia.add({ pos: v(SPOTS.vipBar), radius: 1.8, label: () => 'Champagne VIP (Sofia)', use: () => this.openMenu(() => this.vipBarMenu()) });
    ia.add({ pos: v(SPOTS.suitePanel), radius: 1.4, label: () => 'Painel da suíte', use: () => this.openMenu(() => this.roomMenu()) });
    for (const seat of SEATS) {
      ia.add({
        pos: v(seat),
        radius: seat.reach ?? 1.5,
        label: () => (this.occupied.has(seat.id) ? null : seat.vip ? 'Sentar (cama VIP)' : 'Sentar'),
        use: () => this.sit(seat),
      });
    }
    for (const h of this.hostesses) {
      ia.add({
        pos: h.npc.pos,
        radius: 1.8,
        label: () => {
          if (h.status === 'walking') return null;
          if (h.status === 'room') return `${h.p.name} — opções`;
          return `Conversar com ${h.p.name} (anfitriã)  ${hearts(h.affinity)}`;
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
        label: () => `Conversar com ${npc.name}`,
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
        if (!s.wristband) { this.hud.notify('Precisa da pulseira (terminal da entrada).', 'bad'); return; }
        if (!(await this.pay(itemId.fixed('hostessDrink'), 'o drink'))) return;
        this.addAffinity(h, 20);
        this.say(h, 'Saúde! Você é um amor.', 'good');
      },
      onTip: async () => {
        if (!(await this.pay(itemId.fixed('hostessTip'), 'a gorjeta'))) return;
        this.addAffinity(h, 30);
        this.say(h, 'Generoso, hein? Gostei.', 'good');
      },
      onInvite: async (accept) => {
        if (accept) {
          if (!(await this.pay(itemId.hostess(h.p.name), `a companhia de ${h.p.name}`))) return;
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
      this.hud.notify('Bruno (segurança): “Tudo certo. A suíte fica no fim do corredor.”', 'good');
    } else {
      this.hud.notify('Bruno (segurança): “O corredor é só para VIP ou quem reservou a suíte. Fala com a Lívia no terminal da entrada.”');
    }
  }

  private async pay(item: ItemId, what: string): Promise<boolean> {
    const r = await this.state.spend(item);
    if (r.ok) {
      if (r.fromBank) this.hud.notify(`${money(priceOf(item) ?? 0)} pago — o que faltou na carteira saiu do banco (cartão).`);
      return true;
    }
    this.hud.notify(`Não deu para pagar ${what}: ${r.error}`, 'bad');
    return false;
  }

  private receptionMenu() {
    const s = this.state;
    const st = s.roomStatus('suite');
    const items: MenuItem[] = [
      {
        label: s.wristband ? 'Pulseira de consumo ✓' : 'Pulseira de consumo',
        detail: s.wristband ? 'já possui' : money(PRICES.wristband),
        disabled: s.wristband,
        action: async () => {
          if (s.wristband || !(await this.pay(itemId.fixed('wristband'), 'a pulseira'))) return;
          s.wristband = true;
          s.emit();
          this.hud.notify('Pulseira colocada. Bar e anfitriãs liberados.', 'good');
        },
      },
      {
        label: s.vip ? 'Passe VIP ✓' : 'Passe VIP (permanente)',
        detail: s.vip ? 'já possui' : money(PRICES.vipPass),
        disabled: s.vip,
        action: async () => {
          if (s.vip || !(await this.pay(itemId.fixed('vipPass'), 'o passe VIP'))) return;
          s.vip = true;
          s.emit();
          this.hud.notify('Bem-vindo(a) ao círculo VIP: corredor, suíte (quando livre), champagne e cama redonda.', 'good');
        },
      },
      {
        label: 'Reservar a Suíte Jacuzzi',
        detail: st === 'mine' ? 'sua reserva' : st === 'occupied' ? 'ocupada — volte mais tarde' : !s.wristband ? 'compre a pulseira antes (1)' : `${money(PRICES.room)} / ${ROOM_DURATION_SEC / 60} min`,
        disabled: st !== 'free' || !!s.reservation || !s.wristband,
        action: async () => {
          const err = await s.reserve('suite');
          if (err) this.hud.notify(err, 'bad');
          else this.hud.notify('Suíte reservada! O segurança libera o corredor e a porta abre só pra você (luz azul).', 'good');
        },
      },
    ];
    const res = s.reservation;
    if (res) {
      items.push({
        label: 'Estender reserva',
        detail: `+${ROOM_DURATION_SEC / 60} min por ${money(PRICES.roomExtend)}`,
        action: async () => {
          const err = await s.extendReservation();
          this.hud.notify(err ?? 'Reserva estendida.', err ? 'bad' : 'good');
        },
      });
    }
    // anfitriãs num submenu: o menu principal fica com no máximo 6 itens (teclas 1–9)
    items.push({
      label: 'Chamar anfitriã direto na suíte',
      detail: res ? 'atalho pago (sem conquistar)' : 'precisa de reserva',
      disabled: !res,
      action: () => this.menu.open(() => this.premiumMenu()),
    });
    if (s.account) items.push({ label: 'Carteira Solana', detail: `saldo ${money(s.cash)}`, action: () => this.openWallet() });
    else items.push({ label: 'Caixa eletrônico', detail: `banco ${money(s.bank)}`, action: () => this.menu.open(() => this.atmMenu()) });
    items.push({ label: 'Armário — trocar de roupa', action: () => this.menu.open(() => this.lockerMenu()) });
    const hello = s.wristband ? '' : `“Boa noite, ${s.name}! A pulseira libera o bar e as anfitriãs.”  •  `;
    return {
      title: 'Terminal da casa — Lívia',
      subtitle: s.account ? `${hello}Saldo ${money(s.cash)}` : `${hello}Carteira ${money(s.cash)}  •  Banco ${money(s.bank)} (cobre o que faltar)`,
      items,
    };
  }

  // =================================================================== carteira Solana (conta)
  private wallet: Awaited<ReturnType<typeof api.wallet>> | null = null;
  private walletNote = '';

  private async openWallet(): Promise<void> {
    this.walletNote = 'Carregando…';
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
    const net = w && w.cluster !== 'mainnet-beta' ? ` (${w.cluster}, SOL de teste)` : '';
    const lines = w
      ? [
          `Envie SOL para o seu endereço de depósito${net}:`,
          w.address,
          `1 SOL = ${money(w.fichasPerSol)}  •  Saldo ${money(s.cash)}`,
          'Os depósitos entram depois de finalizados na rede (cerca de 30 s).',
        ]
      : [];
    if (this.walletNote) lines.push(this.walletNote);
    const items: MenuItem[] = [];
    if (w) {
      items.push({
        label: 'Copiar endereço',
        action: async () => {
          try {
            await navigator.clipboard.writeText(w.address);
            this.hud.notify('Endereço copiado.', 'good');
          } catch {
            this.hud.notify('Não deu para copiar; selecione o endereço na tela.', 'bad');
          }
        },
      });
      items.push({
        label: 'Verificar depósitos',
        action: async () => {
          try {
            const r = await api.refresh();
            s.setBalance(r.balance);
            this.walletNote = r.credited > 0 ? `Depósito recebido: +${money(r.credited)}.` : 'Nenhum depósito novo finalizado ainda.';
            if (r.credited > 0) this.wallet = await api.wallet();
          } catch (e) {
            this.walletNote = (e as Error).message;
          }
        },
      });
      for (const d of w.deposits.slice(0, 3)) {
        items.push({ label: `+${money(d.fichas)}`, detail: `${d.sol} SOL • ${new Date(d.at).toLocaleString('pt-BR')}`, disabled: true });
      }
    }
    items.push({
      label: 'Sair da conta',
      action: async () => {
        await api.logout().catch(() => undefined);
        location.reload();
      },
    });
    items.push({ label: '← Voltar ao terminal', action: () => this.menu.open(() => this.receptionMenu()) });
    return { title: `Carteira Solana — ${s.account}`, subtitle: lines.join('\n'), items };
  }

  private premiumMenu() {
    const s = this.state;
    const res = s.reservation;
    const taken = res ? this.hostessInRoom() : undefined;
    const items: MenuItem[] = this.hostesses.map((h): MenuItem => {
      const price = Math.round(h.p.price * PREMIUM_MULT);
      return {
        label: `${h.p.name}, ${h.p.age} — ${h.p.style}`,
        detail: !res ? 'precisa de reserva' : h.status !== 'floor' ? 'indisponível' : taken ? 'suíte já tem companhia' : money(price),
        disabled: !res || h.status !== 'floor' || !!taken,
        action: async () => {
          if (!res || !(await this.pay(itemId.hostessPremium(h.p.name), `a companhia de ${h.p.name}`))) return;
          this.hud.notify(`Lívia: “${h.p.name} já está indo pra suíte.”`, 'good');
          this.sendToRoom(h);
          return 'close';
        },
      };
    });
    items.push({ label: '← Voltar ao terminal', action: () => this.menu.open(() => this.receptionMenu()) });
    return { title: 'Anfitriã direto na suíte', subtitle: `Atalho: ${PREMIUM_MULT}× o preço normal, sem precisar conquistar.`, items };
  }

  private barMenu() {
    const s = this.state;
    if (!s.wristband) {
      return {
        title: 'Bar — Carla',
        subtitle: '“Sem pulseira eu não consigo lançar o pedido. É no terminal da entrada.”',
        items: [] as MenuItem[],
      };
    }
    return {
      title: 'Bar — Carla',
      subtitle: `Carteira: ${money(s.cash)}  •  Buzz: ${Math.round(s.buzz * 100)}%`,
      items: DRINKS.map((d): MenuItem => ({
        label: d.name,
        detail: money(d.price),
        action: async () => {
          if (d.alcohol && s.buzz >= 0.8) {
            this.hud.notify('Carla: “Acho que por hoje chega. Que tal uma água?”', 'bad');
            return;
          }
          if (!(await this.pay(itemId.drink(d.id), d.name))) return;
          s.buzz = clamp(s.buzz + d.buzz, 0, 1);
          this.hud.notify(`Você pediu: ${d.name}.`, 'good');
        },
      })),
    };
  }

  private vipBarMenu() {
    const s = this.state;
    return {
      title: 'Champagne VIP — Sofia',
      subtitle: `Carteira: ${money(s.cash)}`,
      items: [
        {
          label: 'Champagne da casa',
          detail: money(PRICES.vipChampagne),
          action: async () => {
            if (!(await this.pay(itemId.fixed('vipChampagne'), 'o champagne'))) return;
            s.buzz = clamp(s.buzz + 0.15, 0, 1);
            s.vibe = Math.min(99, s.vibe + 40);
            this.hud.notify('Pop! Champagne servido. Vibe lá em cima.', 'good');
          },
        },
        {
          label: 'Água com gás',
          detail: 'cortesia',
          action: () => {
            s.buzz = clamp(s.buzz - 0.2, 0, 1);
            this.hud.notify('Água com gás, cortesia da casa.');
          },
        },
      ] as MenuItem[],
    };
  }

  private atmMenu() {
    const s = this.state;
    const withdraw = (v: number): MenuItem => ({
      label: `Sacar ${money(v)}`,
      disabled: s.bank < v,
      action: () => {
        if (s.withdraw(v)) this.hud.notify(`Saque de ${money(v)} realizado.`, 'good');
      },
    });
    return {
      title: 'Caixa eletrônico',
      subtitle: `Carteira: ${money(s.cash)}  •  Banco: ${money(s.bank)}`,
      items: [
        withdraw(100),
        withdraw(500),
        {
          label: 'Depositar tudo',
          disabled: s.cash <= 0,
          action: () => {
            this.hud.notify(`Depositado: ${money(s.depositAll())}.`);
          },
        },
        { label: '← Voltar ao terminal', action: () => this.menu.open(() => this.receptionMenu()) },
      ],
    };
  }

  private lockerMenu() {
    return {
      title: 'Armário — trocar de roupa',
      subtitle: 'Escolha a cor da roupa (aparece em 3ª pessoa, tecla V)',
      items: [
        ...OUTFITS.map((o): MenuItem => ({
          label: o.name,
          detail: o.color === this.state.shirt ? 'vestindo' : undefined,
          action: () => {
            this.state.shirt = o.color;
            this.char.setShirt(o.color);
            this.state.emit();
          },
        })),
        { label: '← Voltar ao terminal', action: () => this.menu.open(() => this.receptionMenu()) },
      ],
    };
  }

  private roomMenu() {
    const s = this.state;
    const mine = s.roomStatus('suite') === 'mine';
    const items: MenuItem[] = MOODS.map((m) => ({
      label: `Luz: ${m.name}`,
      detail: this.roomMood === m.color ? 'ativa' : undefined,
      disabled: !mine,
      action: () => this.setRoomMood(m.color),
    }));
    if (mine) {
      items.push({
        label: 'Encerrar reserva',
        detail: 'libera a suíte',
        action: () => {
          s.releaseRoom();
          this.onReservationEnded();
          this.hud.notify('Suíte liberada. Obrigado!');
          return 'close';
        },
      });
    }
    const remaining = mine && s.reservation ? formatTime(s.reservation.expiresAt - s.elapsed) : null;
    return {
      title: 'Painel — Suíte Jacuzzi',
      subtitle: mine ? `Reserva sua • restam ${remaining}` : 'Você não tem a reserva desta suíte.',
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

    // equipe
    add({ name: 'Lívia', look: look('f', 0x111111), ...at(STAFF.reception), yaw: STAFF.reception.yaw, mode: 'static' });
    add({ name: 'Bruno', look: look('m', 0x0a0a0a, 1.12), ...at(STAFF.bouncer), yaw: STAFF.bouncer.yaw, mode: 'static' });
    this.barNpc = add({ name: 'Carla', look: look('f', 0xf2f2f2), x: STAFF.barA.x, z: STAFF.barA.z, mode: 'pace', paceTo: STAFF.barB });
    this.nyx = add({ name: 'Nyx', look: look('f', 0x9b4dff), ...at(STAFF.cage), yaw: STAFF.cage.yaw, mode: 'static', pose: 'dance' });
    add({ name: 'Kiara', look: look('f', 0xd4af37), ...at(STAFF.stage), yaw: STAFF.stage.yaw, mode: 'static', pose: 'dance' });
    add({ name: 'Sofia', look: look('f', 0xd4af37), ...at(STAFF.vipBar), yaw: STAFF.vipBar.yaw, mode: 'static' });

    const used = new Set<string>();
    const name = (build: 'm' | 'f'): string => {
      const pool = (build === 'f' ? NAMES_F : NAMES_M).filter((n) => !used.has(n) && !HOSTESSES.some((h) => h.name === n));
      const n = pool.length ? pick(pool) : `Convidado ${used.size + 1}`;
      used.add(n);
      return n;
    };
    // público (~70% mulheres), menos gente que no PeekHole: o salão é bem menor
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

  // =================================================================== anfitriãs
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

  /** Leva a anfitriã até a suíte: faixa livre do salão → corredor → porta → dentro. */
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
        this.hud.notify(`${h.p.name} chegou à Suíte Jacuzzi e está te esperando.`, 'good');
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
        label: 'Conversar',
        detail: s.elapsed < h.talkReadyAt ? 'aguarde...' : 'grátis',
        disabled: s.elapsed < h.talkReadyAt,
        action: () => {
          h.talkReadyAt = s.elapsed + 12;
          this.addAffinity(h, 8);
          this.say(h, this.hostessLine(h, h.affinity >= INVITE_THRESHOLD ? 'high' : h.affinity >= 30 ? 'mid' : 'low'));
        },
      },
      {
        label: 'Pagar um drink pra ela',
        detail: band ? money(PRICES.hostessDrink) : 'precisa da pulseira',
        disabled: !band,
        action: async () => {
          if (!(await this.pay(itemId.fixed('hostessDrink'), 'o drink'))) return;
          this.addAffinity(h, 20);
          this.say(h, 'Saúde! Você é um amor.', 'good');
        },
      },
      {
        label: 'Dar uma gorjeta',
        detail: money(PRICES.hostessTip),
        action: async () => {
          if (!(await this.pay(itemId.fixed('hostessTip'), 'a gorjeta'))) return;
          this.addAffinity(h, 30);
          this.say(h, 'Generoso, hein? Gostei.', 'good');
        },
      },
      {
        label: 'Convidar para a suíte',
        detail: !res ? 'reserve a suíte antes' : busy ? 'a suíte já tem companhia' : money(h.p.price),
        disabled: !res || !!busy,
        action: async () => {
          if (!res) return;
          if (h.affinity < INVITE_THRESHOLD) {
            this.say(h, this.hostessLine(h, 'refuse'), 'bad');
            return;
          }
          if (!(await this.pay(itemId.hostess(h.p.name), `a companhia de ${h.p.name}`))) return;
          this.say(h, 'Combinado. Te encontro na suíte.', 'good');
          this.sendToRoom(h);
          return 'close';
        },
      },
    ];
    return {
      title: `${h.p.name}, ${h.p.age} — anfitriã`,
      subtitle: `${h.p.style}. ${h.p.bio}  •  Interesse ${hearts(h.affinity)}  •  Carteira ${money(s.cash)}`,
      items,
    };
  }

  private roomHostessMenu(h: Hostess) {
    const s = this.state;
    const dancing = h.danceUntil > s.elapsed;
    return {
      title: `${h.p.name} — Suíte Jacuzzi`,
      subtitle: `Interesse ${hearts(h.affinity)}  •  Carteira ${money(s.cash)}`,
      items: [
        {
          label: '★ Dança privada (cena)',
          detail: money(PRICES.privateDance),
          disabled: dancing,
          action: async () => {
            if (!(await this.pay(itemId.fixed('privateDance'), 'a dança privada'))) return;
            h.danceUntil = s.elapsed + 20;
            s.vibe = Math.min(99, s.vibe + 30);
            this.startScene('privateDance', h);
            return 'close';
          },
        },
        {
          label: '★ Champagne para dois (cena)',
          detail: money(PRICES.roomChampagne),
          action: async () => {
            if (!(await this.pay(itemId.fixed('roomChampagne'), 'o champagne'))) return;
            s.buzz = clamp(s.buzz + 0.12, 0, 1);
            this.addAffinity(h, 15);
            this.startScene('champagne', h);
            return 'close';
          },
        },
        {
          label: '★ Noite especial (cena)',
          detail: h.affinity >= 80 ? money(PRICES.specialNight) : 'precisa ♥ 4/5',
          disabled: h.affinity < 80,
          action: async () => {
            if (!(await this.pay(itemId.fixed('specialNight'), 'a noite especial'))) return;
            s.vibe = Math.min(99, s.vibe + 50);
            this.addAffinity(h, 25);
            this.startScene('specialNight', h);
            return 'close';
          },
        },
        {
          label: 'Conversar (cena)',
          action: () => {
            this.startScene('roomChat', h);
            return 'close';
          },
        },
        { label: 'Conversa rápida', action: () => this.say(h, this.hostessLine(h, 'room')) },
        {
          label: 'Encerrar a noite com ela',
          action: () => {
            this.say(h, 'Foi ótimo. Me procura no salão de novo!');
            this.sendBack(h);
            return 'close';
          },
        },
      ] as MenuItem[],
    };
  }

  // =================================================================== cenas
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

  // =================================================================== abertura
  get hasIntro(): boolean { return this.entrance !== null; }

  /**
   * Monta a entrada (escondida) e já pede os shaders dela, com as luzes da rua. Assim a cena
   * de abertura começa sem engasgo.  é o alvo fora da tela em que o cenário é desenhado.
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
    // só as malhas da entrada e o boneco: as luzes vêm da cena (grupo separado, sem repetir)
    renderer.compile(e.group, this.camera, this.scene);
    renderer.compile(this.char.root, this.camera, this.scene);
    renderer.setRenderTarget(previous);
    e.setVisible(false);
    this.world.setOutside(false);
  }

  /** Toca a abertura;  é chamado quando o jogador já está no salão (ou pulou). */
  playIntro(onDone: () => void): void {
    const e = this.entrance;
    if (!e) {
      onDone();
      return;
    }
    const p = this.player;
    const spawn = this.world.spawn;
    // quanto dá para recuar atrás do ponto inicial sem encostar na parede da frente
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
    e.setDoor(0);
    this.hud.setVisible(false);
    this.hud.setPrompt(null);
    this.char.root.visible = true;

    this.cutscene.play([{ type: 'wait', duration: INTRO_SECONDS }], {
      skipLabel: 'Segure [Espaço] para pular',
      onUpdate: (_dt, t) => {
        const f = director.sample(t);
        if (f.inside) {
          goInside();
          p.yaw = spawn.yaw; // o mouse não mexe na direção durante a cena
          p.pitch = 0;
        } else {
          p.position.set(f.x, 0, f.z);
          p.yaw = f.yaw;
          this.cutscenePose = f.pose;
          e.setDoor(f.door);
        }
        cam.position.set(f.cam.x, f.cam.y, f.cam.z);
        cam.lookAt(f.look.x, f.look.y, f.look.z);
        if (Math.abs(cam.fov - f.fov) > 0.05) {
          cam.fov = f.fov;
          cam.updateProjectionMatrix();
        }
        if (fade) fade.style.opacity = f.fade.toFixed(3);
        // o som só é reajustado quando muda de patamar (não a cada quadro)
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

  // =================================================================== HUD / áudio
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
    this.hud.setMoney(s.account ? `Saldo ${money(s.cash)}  •  conta ${s.account}` : `Carteira ${money(s.cash)}  •  Banco ${money(s.bank)}`);
    const items: string[] = [];
    if (s.wristband) items.push('Pulseira de consumo');
    if (s.vip) items.push('Passe VIP');
    if (s.reservation) items.push(`Chave da suíte — ${formatTime(s.reservation.expiresAt - s.elapsed)}`);
    this.hud.setItems(items);

    let obj = 'Explore: bar, pista (G para dançar), cabines, palco e a suíte do fundo.';
    if (!s.wristband) obj = 'Compre sua pulseira no terminal da entrada (Lívia).';
    else if (s.reservation) {
      const h = this.hostessInRoom();
      if (h) obj = this.zone?.id === 'spa' ? `${h.p.name} está com você. Aperte E perto dela.` : `${h.p.name} te espera na Suíte Jacuzzi (fim do corredor).`;
      else obj = 'Suíte reservada. Conquiste uma anfitriã no salão (♥ 3/5) ou chame pelo terminal.';
    }
    this.hud.setObjective(obj);
  }

  welcome(): void {
    this.hud.notify(`Bem-vindo(a) ao Lótus Lounge, ${this.state.name}.`, 'good');
    this.hud.notify('Dica: H mostra os controles.');
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

/** Afasta `a` de `b` (ou ambos, se `both`) até a distância mínima. */
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

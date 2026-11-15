import * as THREE from 'three';
import { Graphics, PRESETS } from './engine/graphics.js';
import { World } from './engine/world.js';
import { Player, bindTouch } from './engine/player.js';
import { loadLevel } from './level/loadLevel.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches;

const canvas = $('game');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05010a);
scene.fog = new THREE.FogExp2(0x200418, 0.016);
scene.environmentIntensity = 0.85;

const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 90);
const gfx = new Graphics(canvas);

// ---------- qualidade inicial ----------
// Ordem: endereço (?q=), o que ficou guardado da última visita, palpite pela placa de vídeo.
const QUALITY_KEY = 'boate.qualidade';
function savedQuality() {
  try {
    return localStorage.getItem(QUALITY_KEY);
  } catch {
    return null; // navegação privada ou armazenamento bloqueado
  }
}
function guessQuality() {
  if (coarse) return 'media'; // celular e tablet
  let gpu = '';
  try {
    const gl = gfx.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  } catch {
    gpu = '';
  }
  // desenho por software (sem placa de vídeo): o mínimo
  if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) return 'baixa';
  // vídeo integrado ao processador: começa no meio (a tecla G sobe se a máquina aguentar)
  const integrated =
    (/intel/i.test(gpu) && !/\barc\b/i.test(gpu)) || /radeon\(tm\) graphics|radeon (r\d|hd)|vega|mali|adreno|powervr/i.test(gpu);
  if (integrated) return 'media';
  // placa dedicada ou desconhecida: começa no alto; se não segurar, o ajuste automático desce
  return 'alta';
}
const pick = [params.get('q'), savedQuality()].find((q) => PRESETS[q]);
gfx.quality = pick || guessQuality();
gfx.init(scene, camera);

const world = new World(scene, gfx.renderer, camera);
const player = new Player(camera, canvas, world.collision);
const _dir = new THREE.Vector3();
let reach = null;
let started = false;

gfx.onResize = (w, h, preset) => {
  if (world.wet) world.wet.resize(w, h, preset.reflection);
};

function setProgress(f, text) {
  $('bar').style.width = Math.round(Math.min(Math.max(f, 0), 1) * 100) + '%';
  if (text) $('loadtext').textContent = text;
}

function showQuality() {
  $('quality').textContent = 'qualidade: ' + gfx.quality.replace('media', 'média');
}
// Muda pelo jogador (tecla G) ou sozinha, quando a máquina não segura: fica guardada.
gfx.onQuality = (name) => {
  showQuality();
  try {
    localStorage.setItem(QUALITY_KEY, name);
  } catch {
    // sem armazenamento: vale só nesta visita
  }
};

// ---------- entrar / pausar ----------
function enter() {
  started = true;
  if (coarse) {
    player.enabled = true;
    $('overlay').classList.add('out');
    $('hud').hidden = false;
    $('touch').hidden = false;
    return;
  }
  const lock = canvas.requestPointerLock();
  if (lock && lock.catch) lock.catch(() => dragFallback());
}

// Sem pointer lock (iframe, navegador embutido): olhar arrastando o mouse.
function dragFallback() {
  if (player.enabled) return;
  player.enabled = true;
  $('overlay').classList.add('out');
  $('hud').hidden = false;
  let down = false;
  canvas.addEventListener('mousedown', () => (down = true));
  addEventListener('mouseup', () => (down = false));
  addEventListener('mousemove', (e) => {
    if (down && !document.pointerLockElement) player.look(e.movementX * 0.004, e.movementY * 0.004);
  });
}

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  player.enabled = locked;
  $('overlay').classList.toggle('out', locked);
  $('hud').hidden = !locked;
  if (!locked && started) $('start').textContent = 'Continuar';
});
document.addEventListener('pointerlockerror', dragFallback);
$('start').addEventListener('click', enter);

// O que a tecla E faz agora: sair da jacuzzi, abrir/fechar porta ou entrar na jacuzzi.
let pool = null; // jacuzzi ao alcance
let seatExit = null; // por onde sair quando está sentado
function action() {
  if (player.seat) return player.seated ? { label: 'Sair da jacuzzi', short: 'Sair', run: leavePool } : null;
  if (reach) {
    const verb = reach.target === 1 ? 'Fechar' : 'Abrir';
    return { label: `${verb} porta`, short: verb, run: () => world.toggleDoor(reach, player.position) };
  }
  if (pool) {
    // já andando dentro da água, a ação é sentar
    const label = world.inWater ? 'Sentar na água' : 'Entrar na jacuzzi';
    return { label, short: world.inWater ? 'Sentar' : 'Entrar', run: enterPool };
  }
  return null;
}
function enterPool() {
  const s = world.seatFor(pool, player.position);
  seatExit = s.exit;
  player.sit(s.to, s.eye, s.yaw);
}
function leavePool() {
  player.stand(seatExit);
}
function interact() {
  const a = action();
  if (a) a.run();
}
player.onInteract = interact;
player.onQuality = () => gfx.cycleQuality();
$('act').addEventListener('click', interact);

world.onRoomChange = (room) => {
  $('room').textContent = room.label;
};

// ---------- laço principal ----------
const promptEl = $('prompt');
const actEl = $('act');
let shownLabel = null; // aviso da tecla E que está na tela (a página só é tocada quando ele muda)
let statsAcc = 0;
let last = 0;
let time = 0;

function simulate(dt) {
  time += dt;
  player.speedScale = world.inWater ? 0.55 : 1;
  player.wading = world.inWater;
  player.update(dt);
  world.update(dt, time, player.position, player.velocity);
  // o que está ao alcance da tecla E
  _dir.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  reach = player.enabled ? world.doorInReach(player.position, _dir) : null;
  pool = player.enabled ? world.poolInReach(player.position, _dir) : null;
}

function frame(now) {
  // Com o menu na frente (antes de entrar ou em pausa) a cena aparece desfocada atrás do
  // cartão: basta redesenhar umas 12 vezes por segundo e a placa de vídeo descansa.
  const idle = !player.enabled;
  if (idle && now - last < 80) return;
  const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
  last = now;
  simulate(dt);

  const act = player.enabled ? action() : null;
  const label = act ? act.label : null;
  if (label !== shownLabel) {
    shownLabel = label;
    if (act) {
      promptEl.innerHTML = `<kbd>E</kbd>${act.label}`;
      actEl.textContent = act.short;
    }
    promptEl.hidden = !act || coarse;
    actEl.hidden = !act || !coarse;
  }

  gfx.render(dt, time, !idle);

  if (params.has('stats')) {
    statsAcc += dt;
    if (statsAcc > 0.5) {
      statsAcc = 0;
      const info = gfx.renderer.info.render;
      $('stats').hidden = false;
      $('stats').textContent =
        `${gfx.fps.toFixed(0)} fps  ${gfx.quality} x${gfx.scale.toFixed(2)}\n` +
        `${info.calls} draws  ${(info.triangles / 1000).toFixed(0)}k tris`;
    }
  }
}

// ---------- carga ----------
// deixa a página desenhar (barra de progresso) antes de um trecho pesado
const breathe = () => new Promise((r) => setTimeout(r));

async function boot() {
  // tempos de cada fase da carga, em ms (aparecem em __game.timings)
  const timings = {};
  let mark = performance.now();
  const lap = (name) => {
    const now = performance.now();
    timings[name] = Math.round(now - mark);
    mark = now;
  };

  setProgress(0.08, 'Carregando cenário…');
  const level = await loadLevel((f) => setProgress(0.08 + 0.47 * f));
  lap('baixarEAbrir');
  setProgress(0.58, 'Montando…');
  await breathe();
  mark = performance.now();

  world.build(level.root);
  gfx.resize();
  player.spawn(world.spawn.position, world.spawn.yaw);
  lap('montar');
  setProgress(0.7, 'Preparando luzes e materiais…');
  await breathe();
  mark = performance.now();

  await world.prepare(gfx, (f) => setProgress(0.7 + 0.25 * f));
  lap('prepararVideo');
  timings.total = Math.round(performance.now());
  setProgress(1, level.source === 'provisório' ? 'Cenário provisório' : 'Pronto');

  bindTouch(player, canvas, $('stick'), $('knob'));
  showQuality();
  $('loading').hidden = true;
  $('start').hidden = false;
  gfx.renderer.setAnimationLoop(frame);

  // acesso para depuração e testes automáticos; sim() avança o jogo em passos fixos
  window.__game = {
    THREE, scene, camera, gfx, world, player, level, interact, action, timings,
    sim(seconds, hz = 60) {
      for (let i = 0; i < Math.round(seconds * hz); i++) simulate(1 / hz);
      gfx.render(1 / hz, time, false);
    },
  };
}

boot().catch((err) => {
  console.error(err);
  $('loadtext').textContent = 'Erro ao carregar: ' + err.message;
});

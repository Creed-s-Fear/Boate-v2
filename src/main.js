import * as THREE from 'three';
import { Graphics } from './engine/graphics.js';
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
gfx.quality = params.get('q') || (coarse ? 'media' : 'alta');
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
  $('bar').style.width = Math.round(f * 100) + '%';
  if (text) $('loadtext').textContent = text;
}

function showQuality() {
  $('quality').textContent = 'qualidade: ' + gfx.quality.replace('media', 'média');
}

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
  if (pool) return { label: 'Entrar na jacuzzi', short: 'Entrar', run: enterPool };
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
player.onQuality = () => {
  gfx.cycleQuality();
  showQuality();
};
$('act').addEventListener('click', interact);

world.onRoomChange = (room) => {
  $('room').textContent = room.label;
};

// ---------- laço principal ----------
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
  pool = player.enabled ? world.poolInReach(player.position) : null;
}

function frame(now) {
  const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
  last = now;
  simulate(dt);

  const act = player.enabled ? action() : null;
  const prompt = $('prompt');
  if (act) {
    prompt.innerHTML = `<kbd>E</kbd>${act.label}`;
    $('act').textContent = act.short;
  }
  prompt.hidden = !act || coarse;
  $('act').hidden = !act || !coarse;

  gfx.render(dt, time);

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
async function boot() {
  setProgress(0.1, 'Carregando cenário…');
  const level = await loadLevel(gfx.renderer, setProgress);
  setProgress(0.6, 'Montando…');
  await new Promise((r) => setTimeout(r));

  world.build(level.root);
  gfx.resize();
  setProgress(0.8, 'Iluminando…');
  await new Promise((r) => setTimeout(r));
  world.bakeEnvironments();

  player.spawn(world.spawn.position, world.spawn.yaw);
  world.prewarm(() => gfx.render(0, 0));
  setProgress(1, level.source === 'provisório' ? 'Cenário provisório' : 'Pronto');

  bindTouch(player, canvas, $('stick'), $('knob'));
  showQuality();
  $('loading').hidden = true;
  $('start').hidden = false;
  gfx.renderer.setAnimationLoop(frame);

  // acesso para depuração e testes automáticos; sim() avança o jogo em passos fixos
  window.__game = {
    THREE, scene, camera, gfx, world, player, level, interact, action,
    sim(seconds, hz = 60) {
      for (let i = 0; i < Math.round(seconds * hz); i++) simulate(1 / hz);
      gfx.render(1 / hz, time);
    },
  };
}

boot().catch((err) => {
  console.error(err);
  $('loadtext').textContent = 'Erro ao carregar: ' + err.message;
});

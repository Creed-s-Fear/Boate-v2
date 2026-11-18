import * as THREE from 'three';
import { Graphics, PRESETS } from './engine/graphics.js';
import { World } from './engine/world.js';
import { Player, bindTouch } from './engine/player.js';
import { loadLevel } from './level/loadLevel.js';
import { ClubAudio } from './game/audio';
import { Game, OUTFITS } from './game/game';
import { Input } from './game/input';
import { collectObstacles } from './game/obstacles';
import { GameState, sanitizeName } from './game/state';
import { api } from './net/api';
import { AgeGate } from './ui/ageGate';
import { ChatUI } from './ui/chatUI';
import { Hud } from './ui/hud';
import { Menu } from './ui/menu';
import { Minimap } from './ui/minimap';

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
  // vídeo integrado ao processador: começa no meio (a tecla Q sobe se a máquina aguentar)
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
let started = false;

// ---------- jogo (regras do PeekHole) ----------
const state = new GameState();
state.load();
const input = new Input(canvas);
const hud = new Hud();
const menu = new Menu();
const audio = new ClubAudio();
const minimap = new Minimap($('minimap'));
const chat = new ChatUI();
let game = null; // criado depois que o cenário carrega

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
// Muda pelo jogador (tecla Q) ou sozinha, quando a máquina não segura: fica guardada.
gfx.onQuality = (name) => {
  showQuality();
  try {
    localStorage.setItem(QUALITY_KEY, name);
  } catch {
    // sem armazenamento: vale só nesta visita
  }
};

// ---------- perfil (nome e roupa) ----------
const nameInput = $('name-input');
nameInput.value = state.name === 'Visitante' ? '' : state.name;
let selectedShirt = state.shirt;
for (const o of OUTFITS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'swatch';
  b.title = o.name;
  b.style.background = `#${o.color.toString(16).padStart(6, '0')}`;
  if (o.color === selectedShirt) b.classList.add('active');
  b.addEventListener('click', () => {
    selectedShirt = o.color;
    $('swatches').querySelectorAll('.swatch').forEach((s) => s.classList.remove('active'));
    b.classList.add('active');
  });
  $('swatches').append(b);
}
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !$('start').hidden) enter();
});

// ---------- conta (opcional; só aparece se a API estiver no ar) ----------
function applyAccount(me) {
  state.setAccount(me.username, me.balance, me.vip);
  nameInput.value = me.username;
  nameInput.disabled = true;
  $('account-form').hidden = true;
  $('account-who').textContent = `Conta ${me.username} • saldo $${me.balance}`;
  $('account-status').hidden = false;
}

async function submitAccount(kind) {
  if (started) return;
  const user = $('acc-user').value.trim();
  const pass = $('acc-pass').value;
  const buttons = [$('acc-login'), $('acc-register')];
  buttons.forEach((b) => (b.disabled = true));
  $('acc-msg').textContent = '';
  try {
    await (kind === 'login' ? api.login(user, pass) : api.register(user, pass));
    applyAccount(await api.me());
  } catch (err) {
    $('acc-msg').textContent = err.message;
  } finally {
    $('acc-pass').value = '';
    buttons.forEach((b) => (b.disabled = false));
  }
}

async function initAccount() {
  try {
    await api.health();
  } catch {
    return; // sem servidor (ex.: GitHub Pages): só modo visitante
  }
  $('account').hidden = false;
  try {
    applyAccount(await api.me());
  } catch {
    // sem sessão: mostra o formulário
  }
}
$('acc-login').addEventListener('click', () => submitAccount('login'));
$('acc-register').addEventListener('click', () => submitAccount('register'));
$('acc-pass').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitAccount('login');
});
$('acc-logout').addEventListener('click', async () => {
  await api.logout().catch(() => undefined);
  location.reload();
});
initAccount();

// ---------- entrar / pausar ----------
function enter() {
  if (!game) return;
  if (!started) {
    started = true;
    if (!state.account) state.name = sanitizeName(nameInput.value);
    state.shirt = selectedShirt;
    game.setShirt(selectedShirt);
    state.emit();
    $('profile').hidden = true;
    audio.start();
    if (game.hasIntro) {
      game.playIntro(() => game.welcome());
    } else {
      game.welcome();
    }
  }
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

// Menu, chat e cenas liberam o mouse de propósito: nesses casos não mostra a tela de pausa.
const busy = () => menu.isOpen || chat.isOpen || (game && game.isCutscenePlaying);
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  player.enabled = locked;
  if (!locked && started && busy()) return;
  $('overlay').classList.toggle('out', locked);
  $('hud').hidden = !locked;
  if (!locked && started) $('start').textContent = 'Continuar';
});
document.addEventListener('pointerlockerror', dragFallback);
$('start').addEventListener('click', enter);
const relockAfterUI = () => {
  if (!game || game.isCutscenePlaying) return;
  if (coarse) player.enabled = true;
  else canvas.requestPointerLock();
};
menu.onClose = relockAfterUI;

// A tecla E (e o botão de toque) faz o que o jogo disser: levantar, porta, jacuzzi, menus...
function interact() {
  const a = game && player.enabled && !menu.isOpen && !chat.isOpen && !game.isCutscenePlaying ? game.action() : null;
  if (a) a.run();
}
player.onInteract = interact;
player.onQuality = () => gfx.cycleQuality();
$('act').addEventListener('click', interact);

// Fase de captura: roda ANTES do teclado do Player (registrado antes, na fase normal).
// Sem isso, o mesmo E que abria o menu pelo Player chegava aqui com o menu já aberto e o
// fechava na hora (E também fecha menu) — o terminal "não abria" e não dava para comprar.
// Tecla consumida pelo menu não segue para o Player.
addEventListener('keydown', (e) => {
  if (!started || !game || e.repeat) return;
  if (game.isCutscenePlaying) {
    // (sem parar a propagação: a cena também lê E, Espaço e Esc segurado pelo Input)
    if (game.handleCutsceneKey(e.code)) e.preventDefault();
    return;
  }
  if (chat.isOpen) {
    if (chat.handleKey(e)) e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  if (menu.isOpen) {
    if (menu.handleKey(e)) e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  if (e.code === 'KeyH') hud.toggleHelp();
  if (e.code === 'KeyM') hud.notify(audio.toggleMute() ? 'Som desligado.' : 'Som ligado.');
}, { capture: true });

// ---------- laço principal ----------
const actEl = $('act');
let shownShort = null; // texto do botão de toque (a página só é tocada quando ele muda)
let statsAcc = 0;
let last = 0;
let time = 0;

function simulate(dt) {
  time += dt;
  const cut = game && game.isCutscenePlaying;
  player.speedScale = world.inWater ? 0.55 : 1;
  player.wading = world.inWater;
  if (!cut) player.update(dt);
  world.update(dt, time, player.position, player.velocity);
  if (game) game.update(dt, started && player.enabled && !menu.isOpen && !chat.isOpen);
  input.endFrame();
}

function frame(now) {
  // Com o menu de entrada na frente a cena aparece desfocada atrás do cartão: basta
  // redesenhar umas 12 vezes por segundo e a placa de vídeo descansa. Menus do jogo e
  // cenas continuam animando normalmente.
  const idle = !player.enabled && !busy();
  if (idle && now - last < 80) return;
  const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
  last = now;
  simulate(dt);

  if (coarse) {
    const act = player.enabled && game ? game.action() : null;
    const short = act ? act.short : null;
    if (short !== shownShort) {
      shownShort = short;
      if (act) actEl.textContent = act.short;
      actEl.hidden = !act;
    }
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

  // verificação de idade antes de tudo; o cenário baixa enquanto o visitante lê
  const verified = new Promise((resolve) => new AgeGate().show(resolve));

  setProgress(0.08, 'Carregando cenário…');
  const level = await loadLevel((f) => setProgress(0.08 + 0.47 * f));
  lap('baixarEAbrir');
  setProgress(0.58, 'Montando…');
  await breathe();
  mark = performance.now();

  // obstáculos dos NPCs: lidos antes da junção das malhas (que apaga as peças)
  const obstacles = collectObstacles(level.root);
  world.build(level.root);
  gfx.resize();
  player.spawn(world.spawn.position, world.spawn.yaw);
  game = new Game(scene, camera, world, player, state, hud, menu, chat, audio, input, minimap, obstacles);
  lap('montar');
  setProgress(0.7, 'Preparando luzes e materiais…');
  await breathe();
  mark = performance.now();

  await world.prepare(gfx, (f) => setProgress(0.7 + 0.22 * f));
  lap('prepararVideo');
  setProgress(0.95, 'Preparando entrada…');
  const rt = new THREE.WebGLRenderTarget(1, 1);
  await game.prepareIntro(gfx.renderer, rt);
  rt.dispose();
  lap('entrada');
  timings.total = Math.round(performance.now());
  setProgress(1, level.source === 'provisório' ? 'Cenário provisório' : 'Pronto');

  bindTouch(player, canvas, $('stick'), $('knob'));
  showQuality();
  await verified;
  $('loading').hidden = true;
  $('start').hidden = false;
  gfx.renderer.setAnimationLoop(frame);

  // personagens com esqueleto (~8 MB) baixam depois: até chegarem, ficam os bonecos provisórios
  game
    .loadCharacters()
    .then(() => gfx.renderer.compileAsync(scene, camera))
    .catch((err) => console.warn('Personagens não carregaram; seguem os provisórios.', err));

  // acesso para depuração e testes automáticos; sim() avança o jogo em passos fixos
  window.__game = {
    THREE, scene, camera, gfx, world, player, level, game, state, interact, timings,
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

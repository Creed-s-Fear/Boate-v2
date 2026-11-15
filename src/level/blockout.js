import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// CENÁRIO PROVISÓRIO. Serve para testar o jogo (andar, colisão, porta, reflexo,
// brilho) enquanto o cenário final não é exportado do Blender. Quando existir
// public/models/level.json apontando para um GLB, este arquivo deixa de ser usado.
// A planta abaixo é a mesma que a montagem no Blender deve seguir (metros, Y para cima):
//
//   Lounge   x -7..7    z -12..12   pé-direito 4.4   (bar à direita, cabines à esquerda)
//   Corredor x -1.3..1.3  z -16..-12  pé-direito 3.0 (sai do arco na parede do fundo)
//   Jacuzzi  x -3..9    z -30..-16  pé-direito 4.4   (porta em x 0, z -16)

const PINK = 0xff2bd6;
const HOT = 0xff4f9a;
const TEAL = 0x19f0e0;
const VIOLET = 0x9a4bff;
const WARM = 0xffa860;
const H = 4.4;
const DEG = Math.PI / 180;

const std = (color, roughness, metalness, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
const neon = (hex, k = 3) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) });

function makeMaterials() {
  return {
    wall: std(0x2a0717, 0.62, 0.1),
    wallDark: std(0x14040c, 0.5, 0.15),
    floor: std(0x0c0309, 0.42, 0.0, { envMapIntensity: 0.4 }),
    platform: std(0x1d0611, 0.22, 0.1),
    ceil: std(0x09040b, 0.9, 0.0),
    metal: std(0x1b141a, 0.38, 0.9),
    gold: std(0xd3a352, 0.26, 1.0),
    velvet: std(0x7a0d3a, 0.78, 0.0),
    velvetDark: std(0x4a0823, 0.85, 0.0),
    gloss: std(0x060306, 0.12, 0.4),
    leaf: std(0x0f3a22, 0.7, 0.0, { flatShading: true }),
    towel: std(0xffe3ee, 0.9, 0.0),
    curtain: std(0xff8fd6, 0.9, 0.0, {
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
      emissive: PINK,
      emissiveIntensity: 0.1,
    }),
    pink: neon(PINK, 2.6),
    pinkSoft: neon(PINK, 1.1),
    hot: neon(HOT, 2.4),
    teal: neon(TEAL, 1.9),
    violet: neon(VIOLET, 2.6),
    warm: neon(WARM, 2.8),
  };
}

// ---------- texturas procedurais ----------
function latticeTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff';
  g.lineCap = 'square';
  const n = 4;
  const cell = s / n;
  const line = (x1, y1, x2, y2) => {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  };
  g.lineWidth = 10;
  for (let i = 0; i <= n; i++) {
    line(i * cell, 0, i * cell, s);
    line(0, i * cell, s, i * cell);
  }
  g.lineWidth = 7;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cx = (i + 0.5) * cell;
      const cy = (j + 0.5) * cell;
      if ((i + j) % 2 === 0) g.strokeRect(cx - cell * 0.24, cy - cell * 0.24, cell * 0.48, cell * 0.48);
      else {
        line(cx - cell / 2, cy, cx + cell / 2, cy);
        line(cx, cy - cell / 2, cx, cy + cell / 2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function signTexture(draw, w = 512, h = 512) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) draw(g, w, h, pass); // 2 passes: halo + traço
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function drawLotus(g, w, h, pass) {
  g.save();
  g.translate(w / 2, h * 0.7);
  g.strokeStyle = pass ? '#ffd0f4' : '#ff2bd6';
  g.shadowColor = '#ff2bd6';
  g.shadowBlur = pass ? 8 : 34;
  g.lineWidth = pass ? 5 : 12;
  for (const a of [-64, -34, 0, 34, 64]) {
    g.save();
    g.rotate(a * DEG);
    const s = 1 - Math.abs(a) / 220;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-78 * s, -80 * s, -56 * s, -190 * s, 0, -240 * s);
    g.bezierCurveTo(56 * s, -190 * s, 78 * s, -80 * s, 0, 0);
    g.stroke();
    g.restore();
  }
  g.beginPath();
  g.moveTo(-190, 34);
  g.quadraticCurveTo(0, 74, 190, 34);
  g.stroke();
  g.restore();
}

function drawWord(g, w, h, pass) {
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '300 150px "Segoe UI", system-ui, sans-serif';
  g.shadowColor = '#19f0e0';
  g.shadowBlur = pass ? 8 : 36;
  g.lineWidth = pass ? 4 : 10;
  g.strokeStyle = pass ? '#d8fffb' : '#19f0e0';
  g.strokeText('LÓTUS', w / 2, h * 0.5);
}

// ---------- construtores ----------
function put(parent, mesh, name, pos, opt = {}) {
  mesh.name = name;
  mesh.position.set(pos[0], pos[1], pos[2]);
  if (opt.ry) mesh.rotation.y = opt.ry;
  if (opt.collide) mesh.userData.collide = true;
  if (opt.wet) mesh.userData.wet = true;
  if (opt.noReflect) mesh.userData.noReflect = true;
  parent.add(mesh);
  return mesh;
}
const box = (p, name, size, pos, mat, opt) => put(p, new THREE.Mesh(new THREE.BoxGeometry(...size), mat), name, pos, opt);
const cyl = (p, name, rTop, rBot, h, pos, mat, opt, seg = 40) =>
  put(p, new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat), name, pos, opt);
function ring(p, name, R, r, pos, mat, opt) {
  const m = put(p, new THREE.Mesh(new THREE.TorusGeometry(R, r, 8, 96), mat), name, pos, opt);
  m.rotation.x = Math.PI / 2;
  return m;
}
function rod(p, name, a, b, r, mat) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 10), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
  m.name = name;
  p.add(m);
  return m;
}
function curtainGeo(R, h, start, length, folds = 14, amp = 0.07) {
  const seg = Math.max(10, Math.round((folds * 9 * length) / (Math.PI * 2)));
  const g = new THREE.CylinderGeometry(R, R, h, seg, 3, true, start, length);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const th = Math.atan2(x, z);
    const k = 1 + (amp * Math.sin(th * folds * 3) * (0.75 - (0.5 * y) / h)) / R;
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  return g;
}
function light(p, color, intensity, distance, pos) {
  const l = new THREE.PointLight(color, intensity, distance, 2);
  l.position.set(pos[0], pos[1], pos[2]);
  p.add(l);
  return l;
}

export function buildBlockout() {
  const M = makeMaterials();
  const root = new THREE.Group();
  root.name = 'Level';

  const lattice = latticeTexture();
  const latticeMat = std(0x1c0810, 0.45, 0.6, { alphaMap: lattice, alphaTest: 0.5, side: THREE.DoubleSide });
  const backlight = neon(PINK, 0.85);
  // painel treliçado com luz atrás; normal = direção para onde o painel olha
  function latticePanel(parent, name, w, h, center, ry) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 1.2, (uv.getY(i) * h) / 1.2);
    const grp = new THREE.Group();
    grp.name = name;
    grp.position.set(center[0], center[1], center[2]);
    grp.rotation.y = ry;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), backlight);
    back.name = name + '_luz';
    back.position.z = 0.02;
    const front = new THREE.Mesh(g, latticeMat);
    front.name = name + '_trelica';
    front.position.z = 0.09;
    grp.add(back, front);
    // moldura dourada
    const t = 0.05;
    for (const [sx, sy, px, py] of [
      [w + t, t, 0, h / 2],
      [w + t, t, 0, -h / 2],
      [t, h + t, w / 2, 0],
      [t, h + t, -w / 2, 0],
    ]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.14), M.gold);
      f.name = name + '_moldura';
      f.position.set(px, py, 0.07);
      grp.add(f);
    }
    parent.add(grp);
    return grp;
  }

  // ===================== LOUNGE =====================
  const club = new THREE.Group();
  club.name = 'ROOM_club';
  club.userData.label = 'Lounge';
  root.add(club);

  box(club, 'club_piso', [14, 0.2, 24], [0, -0.1, 0], M.floor, { collide: true, wet: true });
  box(club, 'club_teto', [14.6, 0.2, 24.6], [0, H + 0.1, 0], M.ceil);
  box(club, 'club_parede_esq', [0.3, H, 24.6], [-7.15, H / 2, 0], M.wall, { collide: true });
  box(club, 'club_parede_dir', [0.3, H, 24.6], [7.15, H / 2, 0], M.wall, { collide: true });
  box(club, 'club_parede_frente', [14, H, 0.3], [0, H / 2, 12.15], M.wall, { collide: true });
  // parede do fundo com o arco do corredor (x -1.3..1.3, altura 3.0)
  box(club, 'club_fundo_esq', [5.7, H, 0.3], [-4.15, H / 2, -12.15], M.wall, { collide: true });
  box(club, 'club_fundo_dir', [5.7, H, 0.3], [4.15, H / 2, -12.15], M.wall, { collide: true });
  box(club, 'club_fundo_topo', [2.6, H - 3.0, 0.3], [0, 3.0 + (H - 3.0) / 2, -12.15], M.wall);

  // corredor
  box(club, 'corredor_piso', [3.2, 0.2, 4], [0, -0.1, -14], M.floor, { collide: true, wet: true });
  box(club, 'corredor_teto', [3.2, 0.2, 3.7], [0, 3.1, -14.15], M.ceil);
  box(club, 'corredor_parede_esq', [0.3, 3.0, 3.7], [-1.45, 1.5, -14.15], M.wallDark, { collide: true });
  box(club, 'corredor_parede_dir', [0.3, 3.0, 3.7], [1.45, 1.5, -14.15], M.wallDark, { collide: true });
  [-12.75, -13.75, -14.75].forEach((z, i) => {
    const m = i % 2 ? M.pink : M.teal;
    box(club, 'corredor_neon', [0.05, 2.94, 0.05], [-1.26, 1.47, z], m);
    box(club, 'corredor_neon', [0.05, 2.94, 0.05], [1.26, 1.47, z], m);
    box(club, 'corredor_neon', [2.57, 0.05, 0.05], [0, 2.95, z], m);
  });
  // molduras de neon em volta do arco, do lado do lounge
  for (const [dx, top, m] of [
    [1.42, 3.12, M.teal],
    [1.66, 3.36, M.pink],
  ]) {
    box(club, 'arco_neon', [0.06, top, 0.06], [-dx, top / 2, -11.96], m);
    box(club, 'arco_neon', [0.06, top, 0.06], [dx, top / 2, -11.96], m);
    box(club, 'arco_neon', [dx * 2 + 0.06, 0.06, 0.06], [0, top, -11.96], m);
  }

  // letreiros na parede do fundo
  const signMat = (tex) =>
    new THREE.MeshBasicMaterial({
      map: tex,
      color: new THREE.Color(2.2, 2.2, 2.2),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  const lotus = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), signMat(signTexture(drawLotus)));
  put(club, lotus, 'letreiro_lotus', [-4.2, 2.35, -11.97]);
  const word = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.2), signMat(signTexture(drawWord, 768, 256)));
  put(club, word, 'letreiro_nome', [4.2, 2.75, -11.97]);

  // cabines circulares (esquerda)
  const boothX = -4.3;
  const curtainBooth = curtainGeo(2.42, 3.66, 142 * DEG, 256 * DEG);
  for (const [i, z] of [7, 1, -5].entries()) {
    const n = 'cabine' + (i + 1);
    cyl(club, n + '_plataforma', 2.3, 2.3, 0.14, [boothX, 0.07, z], M.platform, { collide: true }, 56);
    ring(club, n + '_neon_base', 2.3, 0.022, [boothX, 0.145, z], M.pink);
    cyl(club, n + '_sanca', 2.58, 2.58, 0.6, [boothX, H - 0.3, z], M.ceil, {}, 56);
    ring(club, n + '_neon_teto', 2.58, 0.05, [boothX, H - 0.6, z], M.pink);
    ring(club, n + '_neon_teto2', 2.22, 0.035, [boothX, H - 0.6, z], M.hot);
    put(club, new THREE.Mesh(curtainBooth, M.curtain), n + '_cortina', [boothX, 0.14 + 1.83, z]);
    // sofá curvo com a abertura virada para o corredor central (+X)
    const seat = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.36, 10, 28, 200 * DEG), M.velvet);
    seat.rotation.set(Math.PI / 2, 0, 80 * DEG);
    seat.scale.z = 0.8;
    put(club, seat, n + '_sofa', [boothX, 0.14 + 0.3, z], { collide: true });
    const back = new THREE.Mesh(new THREE.TorusGeometry(1.82, 0.2, 8, 28, 200 * DEG), M.velvetDark);
    back.rotation.set(Math.PI / 2, 0, 80 * DEG);
    back.scale.z = 1.6;
    put(club, back, n + '_encosto', [boothX, 0.14 + 0.72, z], { collide: true });
    // mesa
    cyl(club, n + '_mesa_pe', 0.06, 0.16, 0.5, [boothX + 0.15, 0.39, z], M.gold);
    cyl(club, n + '_mesa', 0.45, 0.45, 0.05, [boothX + 0.15, 0.665, z], M.gloss);
    cyl(club, n + '_vela', 0.05, 0.05, 0.12, [boothX + 0.15, 0.75, z], M.warm, {}, 10);
    cyl(club, 'COL_' + n + '_mesa', 0.46, 0.46, 0.7, [boothX + 0.15, 0.49, z], M.gloss, {}, 12);
    latticePanel(club, n + '_trelica', 3.6, 3.0, [-6.99, 2.0, z], Math.PI / 2);
    light(club, PINK, 26, 9, [boothX, 2.9, z]);
  }
  box(club, 'coluna_neon', [0.05, 3.7, 0.05], [-6.96, 2.05, 4], M.violet);
  box(club, 'coluna_neon', [0.05, 3.7, 0.05], [-6.96, 2.05, -2], M.violet);
  box(club, 'coluna_neon', [0.05, 3.7, 0.05], [-6.96, 2.05, -8], M.violet);
  box(club, 'coluna_neon', [0.05, 3.7, 0.05], [-6.96, 2.05, 10], M.violet);

  // bar (direita)
  box(club, 'bar_balcao', [0.7, 1.1, 14], [4.25, 0.55, 0], M.wallDark, { collide: true });
  box(club, 'bar_tampo', [0.95, 0.06, 14.2], [4.18, 1.13, 0], M.gloss);
  box(club, 'bar_neon_base', [0.03, 0.04, 14], [3.885, 0.07, 0], M.pink);
  box(club, 'bar_neon_tampo', [0.03, 0.035, 14.2], [3.7, 1.085, 0], M.teal);
  {
    const strips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.82, 0.05), M.hot, 20);
    strips.name = 'bar_frisos';
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 20; i++) strips.setMatrixAt(i, m4.makeTranslation(3.893, 0.58, -6.65 + i * 0.7));
    club.add(strips);
  }
  // banquetas (1 objeto instanciado) + colisores
  {
    const seat = new THREE.CylinderGeometry(0.2, 0.18, 0.07, 20).translate(0, 0.78, 0);
    const post = new THREE.CylinderGeometry(0.028, 0.028, 0.72, 8).translate(0, 0.39, 0);
    const foot = new THREE.CylinderGeometry(0.19, 0.21, 0.03, 20).translate(0, 0.015, 0);
    const geo = mergeGeometries([seat, post, foot], true);
    const stools = new THREE.InstancedMesh(geo, [M.velvet, M.gold, M.gold], 8);
    stools.name = 'banquetas';
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 8; i++) {
      const z = -6 + i * (12 / 7);
      stools.setMatrixAt(i, m4.makeTranslation(3.35, 0, z));
      cyl(club, 'COL_banqueta', 0.22, 0.22, 0.85, [3.35, 0.425, z], M.gloss, {}, 8);
    }
    club.add(stools);
  }
  // fundo do bar: bancada, prateleiras iluminadas e garrafas
  box(club, 'bar_bancada', [0.5, 0.95, 14], [6.75, 0.475, 0], M.wallDark, { collide: true });
  box(club, 'bar_sanca', [3.1, 0.35, 14.6], [5.45, H - 0.175, 0], M.ceil);
  [1.3, 1.82, 2.34].forEach((y, i) => {
    box(club, 'bar_prateleira', [0.32, 0.035, 14], [6.82, y, 0], M.gloss);
    box(club, 'bar_prateleira_neon', [0.02, 0.02, 14], [6.67, y - 0.03, 0], i % 2 ? M.teal : M.pink);
  });
  box(club, 'bar_fundo_luz', [0.02, 1.6, 14], [6.985, 1.95, 0], neon(VIOLET, 0.5));
  {
    const bottle = mergeGeometries([
      new THREE.CylinderGeometry(0.036, 0.036, 0.2, 8).translate(0, 0.1, 0),
      new THREE.CylinderGeometry(0.012, 0.03, 0.09, 8).translate(0, 0.245, 0),
    ]);
    const count = 132;
    const bottles = new THREE.InstancedMesh(bottle, new THREE.MeshBasicMaterial(), count);
    bottles.name = 'garrafas';
    bottles.userData.noReflect = true;
    const m4 = new THREE.Matrix4();
    const palette = [PINK, HOT, TEAL, VIOLET, WARM, 0xffffff];
    const col = new THREE.Color();
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      const shelf = i % 3;
      const z = -6.8 + ((i - shelf) / 3) * (13.6 / 43) + (rnd() - 0.5) * 0.08;
      const s = 0.85 + rnd() * 0.5;
      m4.makeScale(1, s, 1).setPosition(6.82 + (rnd() - 0.5) * 0.1, [1.3175, 1.8375, 2.3575][shelf], z);
      bottles.setMatrixAt(i, m4);
      bottles.setColorAt(i, col.set(palette[Math.floor(rnd() * palette.length)]).multiplyScalar(0.5 + rnd() * 0.9));
    }
    club.add(bottles);
  }
  // tubo de neon sinuoso sobre o balcão
  {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(4.5, 3.3, 7.2),
      new THREE.Vector3(3.9, 3.35, 3.4),
      new THREE.Vector3(4.6, 3.3, -0.6),
      new THREE.Vector3(3.95, 3.35, -4.2),
      new THREE.Vector3(4.4, 3.3, -7.2),
    ]);
    put(club, new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.035, 8), M.teal), 'bar_neon_teto', [0, 0, 0]);
  }
  // pendentes (1 objeto instanciado)
  {
    const cord = new THREE.CylinderGeometry(0.008, 0.008, 1.5, 5).translate(0, 3.25, 0);
    const shade = new THREE.CylinderGeometry(0.04, 0.11, 0.22, 16, 1, true).translate(0, 2.42, 0);
    const bulb = new THREE.SphereGeometry(0.05, 12, 8).translate(0, 2.33, 0);
    const geo = mergeGeometries([cord, shade, bulb], true);
    const shadeMat = M.metal.clone();
    shadeMat.side = THREE.DoubleSide;
    const pend = new THREE.InstancedMesh(geo, [M.metal, shadeMat, M.warm], 6);
    pend.name = 'pendentes';
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 6; i++) pend.setMatrixAt(i, m4.makeTranslation(4.2, 0, -5.5 + i * 2.2));
    club.add(pend);
  }
  light(club, TEAL, 22, 10, [5.3, 2.7, 3.5]);
  light(club, TEAL, 22, 10, [5.3, 2.7, -3.5]);
  light(club, HOT, 20, 9, [0, 2.7, -9.8]);

  // parede da frente e tubulação
  latticePanel(club, 'frente_trelica1', 4.2, 3.0, [-3.4, 2.0, 11.99], Math.PI);
  latticePanel(club, 'frente_trelica2', 4.2, 3.0, [3.4, 2.0, 11.99], Math.PI);
  box(club, 'frente_neon', [13.6, 0.05, 0.05], [0, 3.75, 11.96], M.violet);
  for (const [x, r] of [
    [-1.7, 0.09],
    [-1.25, 0.05],
    [0.9, 0.07],
    [1.5, 0.11],
  ]) {
    rod(club, 'tubulacao', [x, H - 0.25, -11.9], [x, H - 0.25, 11.9], r, M.metal);
  }
  for (const z of [-8, -2.5, 3, 8.5]) rod(club, 'tubulacao', [-6.9, H - 0.42, z], [3.9, H - 0.42, z], 0.045, M.metal);

  // ===================== PORTA + PAREDE DA PORTA (sempre visíveis) =====================
  box(root, 'porta_parede_esq', [2.2, H, 0.3], [-2.2, H / 2, -16.15], M.wall, { collide: true });
  box(root, 'porta_parede_dir', [8.2, H, 0.3], [5.2, H / 2, -16.15], M.wall, { collide: true });
  box(root, 'porta_parede_topo', [2.2, H - 2.8, 0.3], [0, 2.8 + (H - 2.8) / 2, -16.15], M.wall);
  box(root, 'porta_batente', [0.08, 2.8, 0.38], [-1.14, 1.4, -16.15], M.gold);
  box(root, 'porta_batente', [0.08, 2.8, 0.38], [1.14, 1.4, -16.15], M.gold);
  box(root, 'porta_batente', [2.36, 0.08, 0.38], [0, 2.84, -16.15], M.gold);

  const door = new THREE.Group();
  door.name = 'DOOR_spa';
  door.userData.door = 'slide';
  door.userData.rooms = 'club,spa';
  root.add(door);
  for (const side of [-1, 1]) {
    const leaf = new THREE.Group();
    leaf.name = side < 0 ? 'folha_esq' : 'folha_dir';
    leaf.position.set(side * 0.55, 1.4, -16.15);
    leaf.userData.slide = [side * 1.04, 0, 0];
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.8, 0.08), M.wallDark);
    panel.name = 'folha_painel';
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.86, 2.5, 0.1), M.velvetDark);
    trim.name = 'folha_almofada';
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.3, 0.12), M.pink);
    glow.name = 'folha_neon';
    glow.position.x = -side * 0.5;
    const pull = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.16), M.gold);
    pull.name = 'folha_puxador';
    pull.position.x = -side * 0.4;
    leaf.add(panel, trim, glow, pull);
    door.add(leaf);
  }

  // ===================== JACUZZI =====================
  const spa = new THREE.Group();
  spa.name = 'ROOM_spa';
  spa.userData.label = 'Jacuzzi';
  root.add(spa);
  const cx = 3;
  const cz = -23;

  box(spa, 'spa_piso', [12, 0.2, 14], [cx, -0.1, cz], M.floor, { collide: true, wet: true });
  box(spa, 'spa_teto', [12.6, 0.2, 14.6], [cx, H + 0.1, cz - 0.15], M.ceil);
  box(spa, 'spa_parede_oeste', [0.3, H, 14.3], [-3.15, H / 2, cz - 0.15], M.wall, { collide: true });
  box(spa, 'spa_parede_leste', [0.3, H, 14.3], [9.15, H / 2, cz - 0.15], M.wall, { collide: true });
  box(spa, 'spa_parede_fundo', [12.6, H, 0.3], [cx, H / 2, -30.15], M.wall, { collide: true });

  // plataforma, degraus e banheira
  cyl(spa, 'spa_degrau1', 3.5, 3.5, 0.18, [cx, 0.09, cz], M.platform, { collide: true }, 72);
  cyl(spa, 'spa_degrau2', 3.05, 3.05, 0.18, [cx, 0.27, cz], M.platform, { collide: true }, 72);
  ring(spa, 'spa_neon_degrau1', 3.5, 0.028, [cx, 0.03, cz], M.pink);
  ring(spa, 'spa_neon_degrau2', 3.05, 0.024, [cx, 0.2, cz], M.hot);
  {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.17, 12, 72), M.platform);
    rim.rotation.x = Math.PI / 2;
    rim.scale.z = 1.5;
    put(spa, rim, 'spa_banheira_borda', [cx, 0.5, cz]);
    ring(spa, 'spa_banheira_friso', 2.1, 0.018, [cx, 0.76, cz], M.gold);
    cyl(spa, 'COL_banheira', 2.3, 2.3, 1.7, [cx, 1.21, cz], M.gloss, {}, 24);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.98, 56), M.gloss);
    water.rotation.x = -Math.PI / 2;
    put(spa, water, 'WATER_jacuzzi', [cx, 0.6, cz]);
  }
  // anel luminoso do teto + cortinas
  cyl(spa, 'spa_sanca', 3.75, 3.75, 0.5, [cx, H - 0.25, cz], M.ceil, {}, 72);
  ring(spa, 'spa_anel1', 3.75, 0.065, [cx, H - 0.5, cz], M.pink);
  ring(spa, 'spa_anel2', 3.38, 0.045, [cx, H - 0.5, cz], M.hot);
  ring(spa, 'spa_anel3', 3.0, 0.03, [cx, H - 0.5, cz], M.pinkSoft);
  for (const a of [45, 135, 225, 315]) {
    const g = curtainGeo(3.58, H - 0.5, (a - 15) * DEG, 30 * DEG, 24, 0.09);
    put(spa, new THREE.Mesh(g, M.curtain), 'spa_cortina', [cx, (H - 0.5) / 2, cz]);
  }
  light(spa, PINK, 46, 13, [cx, 3.2, cz]);
  light(spa, TEAL, 20, 7, [cx, 1.2, cz]);

  // parede oeste: treliças, sofás, mesinha com luminária
  for (const [i, z] of [-19.4, -23, -26.6].entries()) latticePanel(spa, 'spa_trelica_o' + i, 3.2, 3.0, [-2.99, 2.0, z], Math.PI / 2);
  for (const [i, z] of [-20.1, -25.9].entries()) {
    box(spa, 'spa_sofa' + i, [0.95, 0.42, 2.7], [-2.3, 0.21, z], M.velvet, { collide: true });
    box(spa, 'spa_sofa_encosto' + i, [0.26, 0.52, 2.7], [-2.72, 0.68, z], M.velvetDark, { collide: true });
  }
  cyl(spa, 'spa_mesa_fundo', 0.3, 0.24, 0.6, [-2.4, 0.3, cz], M.gold, { collide: true }, 20);
  put(spa, new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), M.pink), 'spa_luminaria_mesa', [-2.4, 0.76, cz]);
  light(spa, HOT, 16, 8, [-1.6, 2.3, cz]);

  // parede do fundo: aparador com toalhas e treliças
  for (const [i, x] of [-0.6, 3, 6.6].entries()) latticePanel(spa, 'spa_trelica_f' + i, 3.2, 3.0, [x, 2.0, -29.99], 0);
  box(spa, 'spa_aparador', [2.6, 0.82, 0.5], [6.4, 0.41, -29.65], M.wallDark, { collide: true });
  box(spa, 'spa_aparador_tampo', [2.7, 0.04, 0.56], [6.4, 0.84, -29.65], M.gold);
  for (const dx of [-0.9, -0.55, 0.7]) box(spa, 'spa_toalhas', [0.3, 0.16, 0.34], [6.4 + dx, 0.94, -29.65], M.towel);
  light(spa, WARM, 12, 7, [6.4, 1.9, -28.6]);

  // lado leste: espreguiçadeiras viradas para a banheira
  for (const [i, z] of [-20.3, -25.7].entries()) {
    box(spa, 'spa_chaise' + i, [1.95, 0.3, 0.78], [7.0, 0.33, z], M.velvet);
    const back = box(spa, 'spa_chaise_encosto' + i, [0.8, 0.14, 0.78], [7.75, 0.66, z], M.velvet);
    back.rotation.z = 38 * DEG;
    box(spa, 'COL_chaise', [2.1, 0.8, 0.86], [7.05, 0.4, z], M.gloss);
    cyl(spa, 'spa_mesa_pedestal' + i, 0.22, 0.14, 0.52, [6.9, 0.26, z + (i ? 1.0 : -1.0)], M.gold, { collide: true }, 16);
    cyl(spa, 'spa_vela_mesa', 0.045, 0.045, 0.1, [6.9, 0.57, z + (i ? 1.0 : -1.0)], M.warm, {}, 8);
  }
  latticePanel(spa, 'spa_trelica_l', 4.4, 3.0, [8.99, 2.0, cz], -Math.PI / 2);
  box(spa, 'spa_neon_leste', [0.05, 3.7, 0.05], [8.96, 2.05, cz - 2.6], M.violet);
  box(spa, 'spa_neon_leste', [0.05, 3.7, 0.05], [8.96, 2.05, cz + 2.6], M.violet);

  // velas no piso em volta da plataforma
  for (const a of [20, 55, 125, 160, 200, 235, 305, 340]) {
    const x = cx + Math.cos(a * DEG) * 3.95;
    const z = cz + Math.sin(a * DEG) * 3.95;
    cyl(spa, 'spa_vela', 0.05, 0.05, 0.16, [x, 0.08, z], M.warm, {}, 8);
  }
  // plantas provisórias nos cantos
  for (const [x, z] of [
    [-2.3, -17.2],
    [-2.3, -29.2],
    [8.3, -29.2],
    [8.3, -17.2],
  ]) {
    cyl(spa, 'spa_vaso', 0.24, 0.16, 0.62, [x, 0.31, z], M.gold, { collide: true }, 16);
    put(spa, new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 1), M.leaf), 'spa_planta', [x, 1.25, z]).scale.y = 1.35;
  }
  // moldura de neon em volta da porta, do lado da jacuzzi, e tubulação
  box(spa, 'spa_porta_neon', [0.05, 3.0, 0.05], [-1.3, 1.5, -16.33], M.pink);
  box(spa, 'spa_porta_neon', [0.05, 3.0, 0.05], [1.3, 1.5, -16.33], M.pink);
  box(spa, 'spa_porta_neon', [2.65, 0.05, 0.05], [0, 3.0, -16.33], M.pink);
  for (const z of [-18.2, -27.6]) rod(spa, 'tubulacao', [-2.9, H - 0.25, z], [8.9, H - 0.25, z], 0.08, M.metal);
  rod(spa, 'tubulacao', [-2.9, H - 0.4, -28.4], [8.9, H - 0.4, -28.4], 0.045, M.metal);

  // ponto inicial
  const spawn = new THREE.Object3D();
  spawn.name = 'SPAWN';
  spawn.position.set(0.9, 0.05, 9.6);
  spawn.userData.yaw = 0;
  root.add(spawn);

  return root;
}

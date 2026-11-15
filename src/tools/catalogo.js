// Página de apoio (só em desenvolvimento): miniatura de cada GLB de assets/drive.
// Eixos na miniatura: vermelho = +X, azul = +Z (frente do glTF), verde = +Y.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BASE = '/assets/drive/Objetos/';
const params = new URLSearchParams(location.search);
const SIZE = Number(params.get('s')) || 320; // resolução de cada miniatura
const filter = params.get('f'); // trechos do nome separados por vírgula
const views = (params.get('v') || 'iso').split(','); // iso | frente | costas | topo | lado
if (params.get('w')) document.documentElement.style.setProperty('--tile', params.get('w') + 'px');
const DIRS = {
  iso: [0.75, 0.55, 1],
  frente: [0, 0.12, 1],
  costas: [0, 0.12, -1],
  topo: [0, 1, 0.001],
  lado: [1, 0.12, 0],
};

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(SIZE, SIZE);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
const pmrem = new THREE.PMREMGenerator(renderer);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x24182a);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.9;
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(3, 6, 5);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 200);
const loader = new GLTFLoader();
const out = document.getElementById('out');

const inventory = await (await fetch('/assets/inventario.json')).json();
let keys = Object.keys(inventory);
if (filter) {
  const parts = filter.toLowerCase().split(',');
  keys = keys.filter((k) => parts.some((p) => k.toLowerCase().includes(p)));
}

let group = '';
let grid = null;
let done = 0;
for (const key of keys) {
  const folder = key.split('/').slice(0, -1).join(' / ');
  if (folder !== group) {
    group = folder;
    const h = document.createElement('h2');
    h.textContent = folder;
    grid = document.createElement('div');
    grid.className = 'grid';
    out.append(h, grid);
  }
  const info = inventory[key];
  const shots = [];
  try {
    const gltf = await loader.loadAsync(BASE + key);
    const obj = gltf.scene;
    scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    const r = Math.max(s.length() / 2, 0.02);
    const axes = new THREE.AxesHelper(r * 0.55);
    scene.add(axes);
    const dist = (r / Math.sin((camera.fov * Math.PI) / 360)) * 1.05;
    for (const view of views) {
      const dir = new THREE.Vector3(...(DIRS[view] || DIRS.iso)).normalize();
      camera.position.copy(c).addScaledVector(dir, dist);
      camera.near = dist / 100;
      camera.far = dist * 10;
      camera.updateProjectionMatrix();
      camera.lookAt(c);
      renderer.render(scene, camera);
      shots.push([view, renderer.domElement.toDataURL('image/jpeg', 0.85)]);
    }
    scene.remove(obj, axes);
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  } catch (e) {
    console.error(key, e);
  }
  const name = key.split('/').pop().replace('.glb', '');
  for (const [view, src] of shots) {
    const fig = document.createElement('figure');
    fig.innerHTML =
      `<img alt="${name}" src="${src}"><figcaption><b>${name}${views.length > 1 ? ' · ' + view : ''}</b>` +
      `<span>${info.size.map((v) => v.toFixed(2)).join(' × ')} m · ${info.tris} tris · ${info.mats.length} mat</span></figcaption>`;
    grid.append(fig);
  }
  document.getElementById('info').textContent =
    `${++done} de ${keys.length} peças · vistas: ${views.join(', ')} · eixos: vermelho +X, verde +Y, azul +Z`;
}
window.__catalogReady = true;

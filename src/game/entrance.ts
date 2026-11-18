import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const DOOR_CENTER_X = 0;
const OPEN_ANGLE = Math.PI * 0.44;

interface DoorLeaf {
  obj: THREE.Object3D;
  sign: number;
  baseY: number;
}

export class Entrance {
  readonly group = new THREE.Group();
  readonly lights = new THREE.Group();
  readonly ready: Promise<void>;
  private leaves: DoorLeaf[] = [];

  constructor(spawnX: number, wallZ: number) {
    this.group.position.set(spawnX - DOOR_CENTER_X, 0, wallZ);
    this.group.name = 'Entrance';

    const warm = new THREE.PointLight(0xffa54f, 80, 12, 2);
    warm.position.set(spawnX + 3, 2.5, wallZ + 0.4);
    const cool = new THREE.PointLight(0x4488ff, 50, 15, 2);
    cool.position.set(spawnX - 1.5, 3.2, wallZ + 2.5);
    const accent = new THREE.PointLight(0xff3fa4, 30, 8, 2);
    accent.position.set(spawnX + 0.3, 2.2, wallZ - 0.5);
    const hemi = new THREE.HemisphereLight(0x101828, 0x040408, 0.5);
    this.lights.add(warm, cool, accent, hemi);
    this.lights.name = 'EntranceLights';

    this.ready = this.load();
  }

  private async load(): Promise<void> {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync('./models/entrada.glb');
    this.group.add(gltf.scene);
    const root = gltf.scene;
    for (const o of root.children) {
      if (o.name.includes('Porta_Vidro')) {
        this.leaves.push({ obj: o, sign: o.name.includes('_E') ? 1 : -1, baseY: o.rotation.y });
      }
    }
  }

  setVisible(on: boolean): void {
    this.group.visible = on;
    this.lights.visible = on;
  }

  /** 0 = fechada, 1 = totalmente aberta. */
  setDoor(openness: number): void {
    for (const l of this.leaves) {
      const room = OPEN_ANGLE - Math.abs(l.baseY);
      l.obj.rotation.y = l.baseY + l.sign * Math.max(0, room) * openness;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.lights.removeFromParent();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry?.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }
}

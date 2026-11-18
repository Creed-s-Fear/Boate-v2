/**
 * Personagem placeholder low-poly (original, sem assets de terceiros), animado proceduralmente.
 * Quando houver um modelo GLTF próprio com rig, troca-se esta classe mantendo a mesma API
 * (root, update(dt, pose), setShirt).
 * Frente do personagem = +Z local.
 */
import * as THREE from 'three';
import { UNIT_BOX } from './materials';

/** Material único de todos os personagens: a cor de cada parte vai nos vértices. */
const SKIN_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });

interface Part { w: number; h: number; d: number; color: number; x: number; y: number; z: number; shirt: boolean }

export type Pose = 'idle' | 'walk' | 'run' | 'dance' | 'sit' | 'perch' | 'crouch' | 'crouchWalk';

export interface Look {
  shirt: number;
  pants: number;
  skin: number;
  hair: number;
  scale?: number;
  /** 'f' = silhueta feminina (vestido, cabelo longo). Padrão 'm'. */
  build?: 'm' | 'f';
}

const DANCE_W = (2 * Math.PI * 122) / 60; // sincronizado com o BPM da trilha

export class Character {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  /** trechos do atributo de cor que são roupa (trocados por setShirt) */
  private readonly shirtRanges: Array<{ attr: THREE.BufferAttribute; start: number; count: number }> = [];
  private t = Math.random() * 10;

  constructor(look: Look) {
    this.root.add(this.body);
    if (look.scale) this.body.scale.setScalar(look.scale);

    // As partes são juntadas por grupo animado (corpo, pernas, braços): 5 malhas por personagem
    // em vez de ~15. No Jack of Hearts, 21 NPCs com uma malha por parte custavam 558 draw calls e
    // +4,3 ms por quadro (medido com gl.finish).
    const groups = new Map<THREE.Object3D, Part[]>();
    const part = (w: number, h: number, d: number, color: number, parent: THREE.Object3D, x: number, y: number, z: number, shirt = false): void => {
      let list = groups.get(parent);
      if (!list) groups.set(parent, (list = []));
      list.push({ w, h, d, color, x, y, z, shirt });
    };

    const f = look.build === 'f';
    const hipX = f ? 0.1 : 0.12;
    for (const [leg, x] of [[this.legL, -hipX], [this.legR, hipX]] as const) {
      leg.position.set(x, 0.95, 0);
      this.body.add(leg);
      part(f ? 0.14 : 0.17, 0.88, f ? 0.15 : 0.18, look.pants, leg, 0, -0.44, 0);
      part(f ? 0.14 : 0.18, 0.08, f ? 0.24 : 0.27, 0x111111, leg, 0, -0.9, 0.04);
    }

    if (f) {
      // Vestido: tronco + saia na cor principal.
      part(0.4, 0.66, 0.25, look.shirt, this.body, 0, 1.28, 0, true);
      part(0.44, 0.4, 0.3, look.shirt, this.body, 0, 0.8, 0, true);
    } else {
      part(0.5, 0.66, 0.28, look.shirt, this.body, 0, 1.28, 0, true);
    }
    part(0.09, 0.08, 0.09, look.skin, this.body, 0, 1.64, 0);
    part(f ? 0.22 : 0.24, 0.27, f ? 0.23 : 0.25, look.skin, this.body, 0, 1.8, 0);
    part(0.26, 0.08, 0.27, look.hair, this.body, 0, 1.96, -0.01);
    if (f) {
      part(0.28, 0.55, 0.08, look.hair, this.body, 0, 1.7, -0.12); // cabelo longo
      part(0.04, 0.4, 0.2, look.hair, this.body, -0.125, 1.76, -0.02);
      part(0.04, 0.4, 0.2, look.hair, this.body, 0.125, 1.76, -0.02);
    } else {
      part(0.26, 0.2, 0.06, look.hair, this.body, 0, 1.85, -0.12);
    }
    part(0.04, 0.035, 0.01, 0x111111, this.body, -0.055, 1.82, 0.121);
    part(0.04, 0.035, 0.01, 0x111111, this.body, 0.055, 1.82, 0.121);

    const shoulder = f ? 0.27 : 0.33;
    for (const [arm, x] of [[this.armL, -shoulder], [this.armR, shoulder]] as const) {
      arm.position.set(x, 1.56, 0);
      this.body.add(arm);
      if (f) {
        part(0.11, 0.66, 0.11, look.skin, arm, 0, -0.31, 0);
      } else {
        part(0.15, 0.3, 0.15, look.shirt, arm, 0, -0.14, 0, true);
        part(0.12, 0.36, 0.12, look.skin, arm, 0, -0.46, 0);
      }
    }

    for (const [parent, parts] of groups) {
      const mesh = new THREE.Mesh(this.mergeParts(parts), SKIN_MAT);
      // Camada 1: a câmera vê, o reflexo do piso não (refletir personagens dobrava o custo do reflexo).
      mesh.layers.set(1);
      parent.add(mesh);
    }
  }

  private mergeParts(parts: Part[]): THREE.BufferGeometry {
    const src = UNIT_BOX;
    const sp = src.attributes.position;
    const sn = src.attributes.normal;
    const si = src.index as THREE.BufferAttribute;
    const nv = sp.count;
    const ni = si.count;
    const pos = new Float32Array(parts.length * nv * 3);
    const nor = new Float32Array(parts.length * nv * 3);
    const col = new Float32Array(parts.length * nv * 3);
    const idx = new Uint16Array(parts.length * ni);
    const c = new THREE.Color();
    const colorAttr = new THREE.BufferAttribute(col, 3);
    parts.forEach((p, k) => {
      c.set(p.color);
      for (let i = 0; i < nv; i++) {
        const o = (k * nv + i) * 3;
        pos[o] = sp.getX(i) * p.w + p.x;
        pos[o + 1] = sp.getY(i) * p.h + p.y;
        pos[o + 2] = sp.getZ(i) * p.d + p.z;
        nor[o] = sn.getX(i);
        nor[o + 1] = sn.getY(i);
        nor[o + 2] = sn.getZ(i);
        col[o] = c.r;
        col[o + 1] = c.g;
        col[o + 2] = c.b;
      }
      for (let i = 0; i < ni; i++) idx[k * ni + i] = si.getX(i) + k * nv;
      if (p.shirt) this.shirtRanges.push({ attr: colorAttr, start: k * nv, count: nv });
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', colorAttr);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }

  setShirt(color: number): void {
    const c = new THREE.Color(color);
    for (const r of this.shirtRanges) {
      for (let i = r.start; i < r.start + r.count; i++) r.attr.setXYZ(i, c.r, c.g, c.b);
      r.attr.needsUpdate = true;
    }
  }

  update(dt: number, pose: Pose): void {
    this.t += dt;
    const t = this.t;
    const b = this.body;
    b.position.y = 0;
    b.rotation.set(0, 0, 0);
    this.legL.rotation.set(0, 0, 0);
    this.legR.rotation.set(0, 0, 0);
    this.armL.rotation.set(0, 0, 0);
    this.armR.rotation.set(0, 0, 0);

    switch (pose) {
      case 'walk':
      case 'run': {
        const f = pose === 'run' ? 11 : 7.5;
        const a = pose === 'run' ? 0.85 : 0.55;
        const s = Math.sin(t * f);
        this.legL.rotation.x = s * a;
        this.legR.rotation.x = -s * a;
        this.armL.rotation.x = -s * a * 0.8;
        this.armR.rotation.x = s * a * 0.8;
        b.position.y = Math.abs(Math.cos(t * f)) * (pose === 'run' ? 0.06 : 0.035);
        if (pose === 'run') b.rotation.x = 0.12;
        break;
      }
      case 'dance': {
        const half = Math.sin((t * DANCE_W) / 2);
        b.position.y = Math.abs(Math.sin(t * DANCE_W)) * 0.07;
        b.rotation.y = Math.sin((t * DANCE_W) / 4) * 0.45;
        this.armL.rotation.set(-2.5 + half * 0.4, 0, -0.35);
        this.armR.rotation.set(-2.5 - half * 0.4, 0, 0.35);
        this.legL.rotation.x = half * 0.18;
        this.legR.rotation.x = -half * 0.18;
        break;
      }
      case 'sit':
        b.position.y = -0.45;
        this.legL.rotation.x = -Math.PI / 2;
        this.legR.rotation.x = -Math.PI / 2;
        this.armL.rotation.x = -0.45;
        this.armR.rotation.x = -0.45;
        break;
      case 'crouch':
      case 'crouchWalk': {
        // agachado: quadril baixo, coxas para a frente, tronco inclinado; andando, passo curto
        const s = pose === 'crouchWalk' ? Math.sin(t * 6) : 0;
        b.position.y = -0.48;
        b.rotation.x = 0.28;
        this.legL.rotation.x = -1.15 + s * 0.3;
        this.legR.rotation.x = -1.15 - s * 0.3;
        this.armL.rotation.x = -0.55 - s * 0.25;
        this.armR.rotation.x = -0.55 + s * 0.25;
        break;
      }
      case 'perch':
        b.position.y = -0.25;
        this.legL.rotation.x = -0.65;
        this.legR.rotation.x = -0.65;
        this.armL.rotation.x = -0.7;
        this.armR.rotation.x = -0.5;
        break;
      default:
        b.position.y = Math.sin(t * 1.6) * 0.006;
        this.armL.rotation.z = -0.04 - Math.sin(t * 1.6) * 0.02;
        this.armR.rotation.z = 0.04 + Math.sin(t * 1.6) * 0.02;
    }
  }
}

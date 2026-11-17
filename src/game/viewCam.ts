/**
 * Câmera 1ª/3ª pessoa por cima do jogador do boate. O Player (engine/player.js) continua
 * dono do movimento, da colisão 3D e do olhar (yaw/pitch) e posiciona a câmera nos olhos;
 * depois disso esta classe:
 *  - em 3ª pessoa, recua a câmera atrás do ombro e faz um raio contra a colisão (BVH)
 *    para não atravessar paredes, cortinas de vidro ou o teto;
 *  - aplica o efeito do "buzz" (bebida): balanço e variação do campo de visão.
 */
import * as THREE from 'three';
import { clamp } from './utils';

export type CamMode = 'first' | 'third';

const SHOULDER = 0.4;
const _ray = new THREE.Ray();
const _head = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

/** O que esta câmera lê do Player do boate (JS). */
export interface PlayerView {
  position: THREE.Vector3;
  yaw: number;
  pitch: number;
  eyeOffset: number;
}

/** Colisão estática do boate (three-mesh-bvh). */
export interface BvhLike {
  raycastFirst(ray: THREE.Ray, side?: THREE.Side): { distance: number } | null;
}

export class ViewCam {
  mode: CamMode = 'first';
  distance = 2.6;
  private readonly baseFov: number;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.baseFov = camera.fov;
  }

  toggle(): CamMode {
    this.mode = this.mode === 'first' ? 'third' : 'first';
    return this.mode;
  }

  zoom(steps: number): void {
    if (this.mode === 'third' && steps) this.distance = clamp(this.distance + steps * 0.35, 1.4, 4.5);
  }

  /** Chamar depois de player.update (que já pôs a câmera nos olhos). */
  apply(p: PlayerView, bvh: BvhLike | null, buzz: number, time: number): void {
    const cam = this.camera;
    const fov = this.baseFov + Math.sin(time * 0.6) * 6 * buzz;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const roll = Math.sin(time * 0.8) * 0.07 * buzz;
    const sway = Math.sin(time * 1.1) * 0.03 * buzz;

    if (this.mode === 'third') {
      // olhos do personagem (a câmera do Player já está neles, com o balanço do passo)
      _head.copy(cam.position);
      const cp = Math.cos(p.pitch);
      _dir.set(Math.sin(p.yaw) * cp, -Math.sin(p.pitch), Math.cos(p.yaw) * cp); // para trás
      _right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      _dir.multiplyScalar(this.distance).addScaledVector(_right, SHOULDER);
      const len = _dir.length();
      _dir.divideScalar(len);
      _ray.origin.copy(_head);
      _ray.direction.copy(_dir);
      const hit = bvh ? bvh.raycastFirst(_ray, THREE.DoubleSide) : null;
      const d = hit && hit.distance < len ? Math.max(0.15, hit.distance - 0.2) : len;
      cam.position.copy(_head).addScaledVector(_dir, d);
    }
    if (buzz > 0.001) {
      _euler.set(p.pitch + sway, p.yaw, roll);
      cam.quaternion.setFromEuler(_euler);
    }
  }
}

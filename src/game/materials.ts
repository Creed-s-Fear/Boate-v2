/**
 * Geometria e materiais compartilhados dos personagens (bonecos procedurais do PeekHole).
 * Performance: uma caixa unitária para todas as partes e um material por cor (cache):
 * dezenas de personagens não multiplicam buffers nem programas de shader.
 */
import * as THREE from 'three';

export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

const cache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: number, roughness = 0.8, metalness = 0): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}|${metalness}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    cache.set(key, m);
  }
  return m;
}

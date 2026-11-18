/**
 * Shared geometry and materials for characters (PeekHole procedural figures).
 * Performance: one unit box for all parts and one material per color (cache):
 * dozens of characters don't multiply buffers or shader programs.
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

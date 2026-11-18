/**
 * 2D obstacles (boxes on the XZ plane) for roaming NPCs, read from the GLB pieces
 * BEFORE world.build (which merges meshes and removes individual pieces).
 * The player keeps using the 3D (BVH) collision; NPCs only need to avoid furniture
 * on the floor, and a linear sweep of ~80 boxes costs microseconds per frame.
 */
import * as THREE from 'three';
import type { AABB } from './collision2d';

const PIECE = /^(KIT_|JAC_)/;
// pieces that don't block walkers (walls and floors are already in the venue.ts outline)
const SKIP = /^(KIT_(Parede|Piso|Teto|Portal|Porta_Portal|Neon|Cortina|Tapete|Placa|Pendente|Arandela|Camera|Espelho|Globo|Luminaria)|JAC_(03|04|3[1-8])_)/;

export function collectObstacles(root: THREE.Object3D): AABB[] {
  root.updateMatrixWorld(true);
  const out: AABB[] = [];
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  root.traverse((o) => {
    if (!PIECE.test(o.name) || (o.parent && PIECE.test(o.parent.name))) return;
    if (SKIP.test(o.name)) return;
    box.setFromObject(o);
    if (box.isEmpty()) return;
    box.getSize(size);
    if (box.min.y > 0.5 || Math.max(size.x, size.z) < 0.3) return; // on tables / small items
    out.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z });
  });
  return out;
}

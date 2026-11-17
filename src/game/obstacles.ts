/**
 * Obstáculos 2D (caixas no plano XZ) para os NPCs que circulam, lidos das peças do GLB
 * ANTES de world.build (que junta as malhas e apaga as peças individuais).
 * O jogador continua usando a colisão 3D (BVH) do boate; os NPCs só precisam desviar dos
 * móveis no chão, e uma varredura linear de ~80 caixas custa microssegundos por quadro.
 */
import * as THREE from 'three';
import type { AABB } from './collision2d';

const PIECE = /^(KIT_|JAC_)/;
// peças que não atrapalham quem anda (paredes e pisos já estão no contorno de venue.ts)
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
    if (box.min.y > 0.5 || Math.max(size.x, size.z) < 0.3) return; // sobre mesas / miudezas
    out.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z });
  });
  return out;
}

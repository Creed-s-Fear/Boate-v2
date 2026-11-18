import * as THREE from 'three';

export interface Interactable {
  /** Position on the floor (y ignored). Can be a live reference (e.g. NPC position). */
  pos: THREE.Vector3;
  radius: number;
  /** null = not interactable right now (no prompt shown). */
  label: () => string | null;
  use: () => void;
}

const tmp = new THREE.Vector3();

/** Picks the nearest interactable in front of the camera. */
export class Interactions {
  private readonly list: Interactable[] = [];

  add(i: Interactable): void {
    this.list.push(i);
  }

  find(playerPos: THREE.Vector3, camForward: THREE.Vector3): { item: Interactable; label: string } | null {
    let best: { item: Interactable; label: string } | null = null;
    let bestScore = Infinity;
    for (const item of this.list) {
      tmp.set(item.pos.x - playerPos.x, 0, item.pos.z - playerPos.z);
      const dist = tmp.length();
      if (dist > item.radius) continue;
      const facing = dist < 0.9 ? 1 : tmp.divideScalar(dist).dot(camForward);
      if (facing < 0.2) continue;
      const label = item.label();
      if (!label) continue;
      const score = dist - facing * 0.8;
      if (score < bestScore) {
        bestScore = score;
        best = { item, label };
      }
    }
    return best;
  }
}

/**
 * 2D collision (XZ plane): circles (characters) vs AABBs (walls, furniture, doors).
 * The map has ~150 boxes, so linear sweep costs microseconds per frame.
 * If the map grows much (>2k colliders), switch to uniform grid — see memory/decisions.md.
 */
export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Point2 {
  x: number;
  z: number;
}

type DynamicCollider = () => AABB | null;

export class CollisionWorld {
  private readonly statics: AABB[] = [];
  private readonly dynamics: DynamicCollider[] = [];

  addStatic(box: AABB): void {
    this.statics.push(box);
  }

  addDynamic(fn: DynamicCollider): void {
    this.dynamics.push(fn);
  }

  /** Pushes the circle out of any overlapping box. Mutates `p`. */
  resolveCircle(p: Point2, r: number): void {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of this.statics) moved = pushOut(p, r, b) || moved;
      for (const fn of this.dynamics) {
        const b = fn();
        if (b) moved = pushOut(p, r, b) || moved;
      }
      if (!moved) break;
    }
  }
}

export function pointInRect(x: number, z: number, b: AABB): boolean {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

function pushOut(p: Point2, r: number, b: AABB): boolean {
  const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
  const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
  const dx = p.x - cx;
  const dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;

  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    const push = r - d;
    p.x += (dx / d) * push;
    p.z += (dz / d) * push;
    return true;
  }
  // Center inside the box: exits along the axis of least penetration.
  const left = p.x - b.minX;
  const right = b.maxX - p.x;
  const top = p.z - b.minZ;
  const bottom = b.maxZ - p.z;
  const m = Math.min(left, right, top, bottom);
  if (m === left) p.x = b.minX - r;
  else if (m === right) p.x = b.maxX + r;
  else if (m === top) p.z = b.minZ - r;
  else p.z = b.maxZ + r;
  return true;
}

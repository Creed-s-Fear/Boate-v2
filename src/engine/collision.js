import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeMeshes } from './merge.js';

const _box = new THREE.Box3();
const _triPoint = new THREE.Vector3();
const _capPoint = new THREE.Vector3();

// Static scene collision: all marked meshes become a single world-space BVH.
// Doors are added as toggleable box blockers.
export class Collision {
  constructor() {
    this.bvh = null;
    this.blockers = []; // { bvh, enabled }
  }

  setStatic(meshes) {
    if (!meshes.length) return;
    for (const m of meshes) m.updateWorldMatrix(true, false);
    const geo = mergeMeshes(meshes, { normals: false }); // world space, positions only
    this.bvh = new MeshBVH(geo);
    this.triangles = geo.index.count / 3;
  }

  // Axis-aligned box in world space that can be toggled off (open door).
  addBlocker(box3) {
    const size = box3.getSize(new THREE.Vector3());
    const center = box3.getCenter(new THREE.Vector3());
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    geo.translate(center.x, center.y, center.z);
    const blocker = { bvh: new MeshBVH(geo), enabled: true };
    this.blockers.push(blocker);
    return blocker;
  }

  // Pushes the capsule (segment + radius, world space) out of the geometry.
  resolveCapsule(segment, radius) {
    _box.makeEmpty();
    _box.expandByPoint(segment.start);
    _box.expandByPoint(segment.end);
    _box.min.addScalar(-radius);
    _box.max.addScalar(radius);

    const cast = {
      intersectsBounds: (box) => box.intersectsBox(_box),
      intersectsTriangle: (tri) => {
        const dist = tri.closestPointToSegment(segment, _triPoint, _capPoint);
        if (dist < radius) {
          const depth = radius - dist;
          const dir = _capPoint.sub(_triPoint).normalize();
          segment.start.addScaledVector(dir, depth);
          segment.end.addScaledVector(dir, depth);
        }
        return false;
      },
    };

    if (this.bvh) this.bvh.shapecast(cast);
    for (const b of this.blockers) if (b.enabled) b.bvh.shapecast(cast);
  }
}

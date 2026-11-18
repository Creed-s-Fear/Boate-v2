import * as THREE from 'three';
import { Collision } from './collision.js';
import { WetFloor } from './wetfloor.js';
import { createWaterMaterial, Steam } from './water.js';
import { batchStatic, isKitLevel, prepareKit } from '../level/kit.js';
import { FX } from '../level/shaderFx.js';
import { StringCurtain } from './stringCurtain.js';
import { createHologram, createHoloSign } from './hologram.js';

// Conventions read from the scene (applies to the GLB exported from Blender and to the
// provisional scene). Blender custom properties arrive in userData.
//
//   SPAWN*            empty: player's initial position and direction
//   ROOM_<name>       parent of everything belonging to a room (toggles the whole room)
//   DOOR_<name>       door; userData.door = 'slide' | 'hinge', userData.rooms = 'a,b'
//                     children with userData.slide = [x,y,z] slide by that amount on open
//   COL_*             invisible collision-only mesh
//   userData.collide  visible mesh that also collides
//   userData.wet      floor that receives the wet floor reflection
//   WATER* / userData.water   water surface (jacuzzi)
//   userData.noReflect        excluded from the reflection pass (small objects)

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const _box = new THREE.Box3();
const _v = new THREE.Vector3();
const _size = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _zero = new THREE.Vector3();

function ancestor(o, test) {
  for (let p = o.parent; p; p = p.parent) if (test(p)) return p;
  return null;
}
const isDoor = (n) => (n.name || '').startsWith('DOOR_');
const isRoom = (n) => (n.name || '').startsWith('ROOM_');

export class World {
  constructor(scene, renderer, camera) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.collision = new Collision();
    this.rooms = [];
    this.doors = [];
    this.steams = [];
    this.spawn = { position: new THREE.Vector3(0, 0.05, 0), yaw: 0 };
    this.wet = null;
    this.water = createWaterMaterial();
    this.current = null;
    this.onRoomChange = null;
    this._outside = false;
    this.stats = {};
  }

  build(root) {
    this.root = root;
    this.scene.add(root);
    root.updateMatrixWorld(true);

    // scene built with KIT_/JAC_ pieces: materials and colliders come from piece names
    const ms = {}; // time per step, in ms (shown in stats.build)
    let mark = performance.now();
    const lap = (name) => {
      const now = performance.now();
      ms[name] = Math.round(now - mark);
      mark = now;
    };
    this.kit = isKitLevel(root) ? prepareKit(root) : null;
    lap('materials');
    this.spinners = this.kit ? this.kit.spinners : [];
    root.updateMatrixWorld(true);

    // pieces with their own behavior: string curtain (physics) and hologram (shader)
    this.fx = [];
    this.pools = [];
    this.inWater = false;
    if (this.kit) {
      const special = [];
      const SPECIAL = /^KIT_(Cortina_Fios_Neon|Holo_Projetor|Placa_Lotus|Placa_Glifos)/;
      root.traverse((o) => {
        if (SPECIAL.test(o.name) && !ancestor(o, (p) => SPECIAL.test(p.name))) special.push(o);
      });
      for (const piece of special) {
        const room = ancestor(piece, isRoom) || root;
        let fx = null;
        if (piece.name.startsWith('KIT_Holo')) fx = createHologram(piece, room);
        else if (piece.name.startsWith('KIT_Placa')) fx = createHoloSign(piece, room);
        else fx = new StringCurtain(piece, room);
        if (fx) this.fx.push(fx);
      }
      root.updateMatrixWorld(true);
    }

    lap('effects');
    const colliders = [];
    const hideAfter = [];
    const doorNodes = [];
    const waters = [];
    const wetRect = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    let wetY = 0;
    let wetCount = 0;
    let meshes = 0;

    root.traverse((o) => {
      const name = o.name || '';
      const ud = o.userData || {};

      if (name.startsWith('SPAWN')) {
        o.getWorldPosition(this.spawn.position);
        // the player looks along the empty's local +Z (in Blender: the empty's local -Y)
        o.getWorldDirection(_v);
        this.spawn.yaw = Math.atan2(-_v.x, -_v.z);
        if (ud.yaw !== undefined) this.spawn.yaw = ud.yaw * DEG;
        return;
      }
      if (isRoom(o)) {
        this.rooms.push({ name: name.slice(5), label: ud.label || name.slice(5), node: o, box: new THREE.Box3(), env: null });
      }
      if (isDoor(o)) doorNodes.push(o);
      if (!o.isMesh) return;
      meshes++;

      const inDoor = isDoor(o) || ancestor(o, isDoor);
      if (name.startsWith('COL_')) {
        if (!inDoor) colliders.push(o);
        hideAfter.push(o);
        return;
      }
      if (ud.collide && !inDoor) colliders.push(o);

      if (name.startsWith('WATER') || ud.water) {
        o.material = this.water;
        waters.push(o);
      }
      if (ud.wet) {
        _box.setFromObject(o);
        wetRect.minX = Math.min(wetRect.minX, _box.min.x);
        wetRect.maxX = Math.max(wetRect.maxX, _box.max.x);
        wetRect.minZ = Math.min(wetRect.minZ, _box.min.z);
        wetRect.maxZ = Math.max(wetRect.maxZ, _box.max.z);
        wetY = Math.max(wetCount ? wetY : -Infinity, _box.max.y);
        wetCount++;
      }
      if (ud.noReflect) o.layers.set(1);
      else if (!ud.wet && !ud.collide) {
        // small objects are excluded from the reflection: fewer draw calls in the extra pass
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        o.getWorldScale(_size);
        const r = o.geometry.boundingSphere.radius * Math.max(_size.x, _size.y, _size.z);
        if (r < 0.22) o.layers.set(1);
      }
    });

    lap('traverse');
    // static collision
    this.collision.setStatic(colliders);
    lap('collision');
    hideAfter.forEach((o) => (o.visible = false));

    // rooms
    for (const room of this.rooms) room.box.setFromObject(room.node).expandByScalar(0.05);

    // doors
    for (const node of doorNodes) this._addDoor(node);

    // floor reflection
    if (wetCount) {
      this.wet = new WetFloor(wetRect, wetY, 0xffffff);
      this.scene.add(this.wet.mesh);
    }

    // water: the original mesh is replaced by a disc with the water shader; steam on top.
    // The modeled foam is removed: the shader draws the jet foam.
    const foam = [];
    root.traverse((o) => {
      if (o.isMesh && o.material && o.material.name === 'KIT_j_foam') foam.push(o);
    });
    foam.forEach((o) => o.removeFromParent());
    for (const w of waters) {
      _box.setFromObject(w);
      const c = _box.getCenter(new THREE.Vector3());
      _box.getSize(_size);
      const radius = Math.min(_size.x, _size.z) / 2;
      const level = _box.max.y - 0.015;
      const room = ancestor(w, isRoom);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 72).rotateX(-Math.PI / 2), this.water);
      disc.name = 'WATER_superficie';
      disc.position.set(c.x, level, c.z);
      disc.userData.dynamic = true;
      disc.renderOrder = 1;
      (room || root).add(disc);
      w.removeFromParent();
      this.water.uniforms.uCenter.value.set(c.x, c.z);
      this.water.uniforms.uRadius.value = radius;
      this.pools.push({ x: c.x, z: c.z, r: radius, y: level });
      const steam = new Steam(new THREE.Vector3(c.x, level, c.z), radius * 0.85);
      steam.room = room; // steam lives in world space and hides with the room
      this.scene.add(steam.object);
      this.steams.push(steam);
    }

    lap('roomsAndWater');
    // batches static meshes by material: hundreds of pieces become few draw calls
    let batches = 0;
    if (this.kit) {
      hideAfter.forEach((o) => o.removeFromParent());
      const live = (p) => p.userData.spin || p.userData.dynamic;
      const dynamic = (o) => o.userData.water || isDoor(o) || ancestor(o, isDoor) || live(o) || ancestor(o, live);
      for (const room of this.rooms) batches += batchStatic(room.node, dynamic).batches;
      batches += batchStatic(root, (o) => dynamic(o) || ancestor(o, isRoom)).batches;
    }

    lap('batch');
    this.camera.layers.enable(1);
    this.stats = { meshes, batches, colliders: colliders.length, triangles: this.collision.triangles || 0, build: ms };
    this.updateRooms(this.spawn.position, true);
  }

  _addDoor(node) {
    const ud = node.userData || {};
    const door = {
      node,
      name: node.name.slice(5),
      type: ud.door || 'hinge',
      rooms: String(ud.rooms || '').split(',').map((s) => s.trim()).filter(Boolean),
      open: 0,
      target: 0,
      leaves: [],
      center: new THREE.Vector3(),
    };
    _box.setFromObject(node);
    _box.getCenter(door.center);
    door.blocker = this.collision.addBlocker(_box.clone().expandByScalar(0.03));

    if (door.type === 'slide') {
      node.traverse((c) => {
        if (Array.isArray(c.userData.slide)) {
          door.leaves.push({ obj: c, from: c.position.clone(), offset: new THREE.Vector3().fromArray(c.userData.slide) });
        }
      });
      if (!door.leaves.length) {
        _box.getSize(_size);
        const along = new THREE.Vector3(1, 0, 0).applyQuaternion(node.quaternion).multiplyScalar(Math.max(_size.x, _size.z) * 0.96);
        door.leaves.push({ obj: node, from: node.position.clone(), offset: along });
      }
    } else {
      door.q0 = node.quaternion.clone();
      door.angle = (ud.angle !== undefined ? ud.angle : 100) * DEG;
    }
    this.doors.push(door);
  }

  // nearest door the player can reach
  doorInReach(pos, dir) {
    let best = null;
    let bestD = 2.7;
    for (const d of this.doors) {
      _v.set(d.center.x - pos.x, 0, d.center.z - pos.z);
      const dist = _v.length();
      if (dist > bestD) continue;
      if (dist > 1.1 && _v.normalize().dot(dir) < 0.35) continue;
      best = d;
      bestD = dist;
    }
    return best;
  }

  toggleDoor(door, pos) {
    const closing = door.target === 1;
    if (closing) {
      // don't close on top of the player
      _v.set(door.center.x - pos.x, 0, door.center.z - pos.z);
      if (_v.length() < 0.9) return false;
    }
    door.target = closing ? 0 : 1;
    return true;
  }

  updateRooms(pos, force = false) {
    if (!this.rooms.length) return;
    _v.set(pos.x, pos.y + 1, pos.z);
    const found = this.rooms.find((r) => r.box.containsPoint(_v)) || this.current || this.rooms[0];
    if (found !== this.current || force) {
      this.current = found;
      if (found.env) this.scene.environment = found.env;
      if (this.onRoomChange) this.onRoomChange(found);
    }
    for (const r of this.rooms) r.show = r === this.current;
    for (const d of this.doors) {
      if (d.open <= 0.002) continue;
      for (const r of this.rooms) if (!d.rooms.length || d.rooms.includes(r.name)) r.show = true;
    }
    this._show();
  }

  setOutside(on) {
    this._outside = on;
    if (this.root) this.root.visible = !on;
    if (!on) this.updateRooms(this.spawn.position, true);
  }

  // Shows and hides rooms: those marked in updateRooms or, during preparation, a given list.
  _show(list = null) {
    if (this._outside) return;
    for (const r of this.rooms) r.node.visible = list ? list.includes(r) : r.show;
    // floor reflection reappears (preparation hides it when capturing the environment)
    if (this.wet) this.wet.mesh.visible = this.wet.scale > 0;
  }

  // Jacuzzi in reach: the player is near the edge (on the top steps of the platform or
  // already in the water) AND looking toward the tub. Without the second condition the
  // prompt appeared with their back to it or near the surrounding furniture.
  poolInReach(pos, dir) {
    for (const p of this.pools) {
      const dx = p.x - pos.x;
      const dz = p.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (pos.y > p.y + 0.5 || d > p.r + 1.3) continue;
      // inside the water any direction works; outside, must be facing it
      if (d > p.r && (dx * dir.x + dz * dir.z) / d < 0.6) continue;
      return p;
    }
    return null;
  }

  // Where to sit in the water (feet), eye height, where to look and where to exit.
  // The player enters from the side they are on and faces the center.
  seatFor(pool, pos) {
    let dx = pos.x - pool.x;
    let dz = pos.z - pool.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.05) {
      dx = 0;
      dz = 1;
    } else {
      dx /= l;
      dz /= l;
    }
    const floor = pool.y - 0.47; // tub floor
    return {
      to: new THREE.Vector3(pool.x + dx * pool.r * 0.5, floor, pool.z + dz * pool.r * 0.5),
      eye: pool.y + 0.36 - floor, // eyes about 36 cm above the water
      yaw: Math.atan2(dx, dz),
      exit: new THREE.Vector3(pool.x + dx * pool.r * 1.84, pool.y - 0.31, pool.z + dz * pool.r * 1.84),
    };
  }

  update(dt, time, pos, vel = _zero) {
    for (const f of this.fx) f.update(dt, time, pos, vel, this.renderer);
    // inside the jacuzzi water (the player walks slower and the water reacts to them)
    this.inWater = this.pools.some((p) => pos.y < p.y - 0.12 && Math.hypot(pos.x - p.x, pos.z - p.z) < p.r);
    const wp = this.water.uniforms.uPlayer.value;
    wp.x = pos.x;
    wp.y = pos.z;
    wp.z += ((this.inWater ? 1 : 0) - wp.z) * Math.min(1, dt * 3);
    FX.uTime.value = time;
    FX.uPlayer.value.copy(pos);
    for (const d of this.doors) {
      if (d.open !== d.target) {
        const step = dt / 0.9;
        d.open = d.target > d.open ? Math.min(d.target, d.open + step) : Math.max(d.target, d.open - step);
        const t = d.open * d.open * (3 - 2 * d.open);
        if (d.type === 'slide') {
          for (const l of d.leaves) l.obj.position.copy(l.from).addScaledVector(l.offset, t);
        } else {
          d.node.quaternion.copy(d.q0).multiply(_q.setFromAxisAngle(UP, d.angle * t));
        }
        d.blocker.enabled = d.open < 0.55;
      }
    }
    for (const s of this.spinners) s.rotateY(dt * s.userData.spin);
    this.water.uniforms.uTime.value = time;
    this.updateRooms(pos);
    for (const s of this.steams) {
      s.object.visible = s.room ? s.room.visible : true;
      if (s.object.visible) s.update(dt, time);
    }
  }

  // Prepares everything that depends on the GPU without blocking the page.
  //
  // Each combination of visible rooms has a different number of lights and, therefore,
  // its own shaders. Instead of compiling one by one on first draw (which blocked the page
  // for over a second), all shaders are requested at once and the browser compiles them
  // in parallel, off the main thread.
  //
  // Before enabling the "Enter" button only what the initial room needs is ready: its
  // shaders, its environment map (the pinkish sheen on metals, glass and velvet) and the
  // first frame. The rest (other rooms, open doors) finishes in the background, in short
  // chunks, while the player reads the menu: well before anyone reaches the door.
  async prepare(gfx, onProgress = () => {}) {
    const renderer = this.renderer;
    const scene = this.scene;
    const programs = renderer.info.programs;
    const here = this.current || this.rooms[0] || null;
    const others = this.rooms.filter((r) => r !== here);
    const ms = {}; // time per step, in ms (shown in stats.prepare)
    let mark = performance.now();
    const lap = (name) => {
      const now = performance.now();
      ms[name] = Math.round(now - mark);
      mark = now;
    };

    // Provisional black environment, same type and size as the final one: the environment
    // map type is part of the shader, so what is compiled now is exactly what the game
    // uses later (and the environment capture doesn't need a separate set).
    const pmrem = new THREE.PMREMGenerator(renderer);
    const blank = pmrem.fromScene(new THREE.Scene(), 0, 0.1, 10, { size: 128 });

    // The scene is drawn to an offscreen target (effects come after). Compile and warm-up
    // must happen with this type of target active, otherwise the shader comes out different.
    const offscreen = (fn) => {
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(gfx.composer.renderTarget1);
      fn();
      renderer.setRenderTarget(previous);
    };
    const restore = () => {
      this._show();
      scene.environment = (this.current && this.current.env) || null;
    };

    // Requests shaders for a combination. Outside rooms are removed from the scene briefly,
    // so their materials aren't compiled with the lights from other rooms.
    const homes = this.rooms.map((r) => r.node.parent);
    const request = (combo) => {
      this.rooms.forEach((r, i) => (combo.includes(r) ? homes[i].add(r.node) : r.node.removeFromParent()));
      for (const r of combo) r.node.visible = true;
      scene.environment = blank.texture;
      offscreen(() => renderer.compile(scene, this.camera));
      this.rooms.forEach((r, i) => homes[i].add(r.node));
      restore();
    };
    // Full-screen passes: drawn outside the scene, no lights. The geometry mimics theirs
    // (position and uv, no normals): mesh attributes are also part of the shader.
    const requestPasses = () => {
      const quad = new THREE.BufferGeometry();
      quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
      quad.setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
      const holder = (materials) => {
        const s = new THREE.Scene();
        for (const m of materials) s.add(new THREE.Mesh(quad, m));
        return s;
      };
      const passes = gfx.passMaterials();
      offscreen(() => renderer.compile(holder(passes.offscreen), this.camera));
      renderer.compile(holder(passes.screen), this.camera); // the last pass draws to the screen
      quad.dispose();
    };
    // Waits for the first `count` shaders without blocking. Without the parallel compilation
    // extension, isReady() already returns true and they compile on first use, as before.
    const compiled = async (count, report) => {
      const started = performance.now();
      for (;;) {
        const n = Math.min(count, programs.length);
        let ready = 0;
        for (let i = 0; i < n; i++) if (programs[i].isReady()) ready++;
        if (report) report(n ? ready / n : 1);
        if (ready >= n || performance.now() - started > 20000) return;
        await new Promise((r) => setTimeout(r, 12));
      }
    };
    // Environment map of a room, captured from its center, without the floor reflection.
    const bake = (room) => {
      this._show([room]);
      if (this.wet) this.wet.mesh.visible = false;
      scene.environment = blank.texture;
      const c = room.box.getCenter(new THREE.Vector3());
      c.y = room.box.min.y + 1.7;
      if (room.node.userData.envPos) c.fromArray(room.node.userData.envPos);
      room.env = pmrem.fromScene(scene, 0.03, 0.05, 80, { size: 128, position: c }).texture;
      restore();
    };
    // Draws a combination offscreen, from afar and seeing everything: first use of each
    // shader and geometry upload to the GPU. Without this the game stutters the first time
    // each thing enters the field of view.
    const far = new THREE.PerspectiveCamera(90, 1, 0.1, 600);
    far.layers.mask = this.camera.layers.mask;
    const sphere = new THREE.Sphere();
    const warm = (combo) => {
      _box.makeEmpty();
      for (const r of combo) _box.union(r.box);
      _box.getBoundingSphere(sphere);
      far.position.copy(sphere.center);
      far.position.z += sphere.radius * 1.5;
      far.lookAt(sphere.center);
      far.updateMatrixWorld(true);
      this._show(combo);
      scene.environment = combo[0].env || blank.texture;
      offscreen(() => renderer.render(scene, far));
      restore();
    };

    // ----- before the "Enter" button: only the initial room -----
    request(here ? [here] : []);
    requestPasses();
    lap('request');
    await compiled(programs.length, onProgress);
    lap('compile');
    if (here) bake(here);
    lap('environment');
    gfx.render(0, 0, false);
    lap('firstFrame');
    this.stats.prepare = ms;
    this.stats.programs = programs.length;

    // ----- background: the rest, in short chunks -----
    const pause = () => new Promise((r) => setTimeout(r, 30));
    const rest = async () => {
      const started = performance.now();
      await pause();
      // request shaders for other combinations now: they compile while the rest happens
      for (const room of others) request([room]);
      if (others.length) request(this.rooms);
      await pause();
      if (here) warm([here]);
      for (const room of others) {
        await pause();
        await compiled(programs.length);
        bake(room);
        await pause();
        warm([room]);
      }
      if (others.length) {
        await pause();
        warm(this.rooms);
      }
      blank.dispose();
      pmrem.dispose();
      ms.background = Math.round(performance.now() - started);
    };
    this.ready = rest().catch((err) => console.warn('Background preparation failed:', err));
  }
}

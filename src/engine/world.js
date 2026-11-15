import * as THREE from 'three';
import { Collision } from './collision.js';
import { WetFloor } from './wetfloor.js';
import { createWaterMaterial, Steam } from './water.js';
import { batchStatic, isKitLevel, prepareKit } from '../level/kit.js';
import { FX } from '../level/shaderFx.js';
import { StringCurtain } from './stringCurtain.js';
import { createHologram, createHoloSign } from './hologram.js';

// Convenções lidas do cenário (vale para o GLB exportado do Blender e para o
// cenário provisório). Propriedades personalizadas do Blender chegam em userData.
//
//   SPAWN*            vazio: posição e direção inicial do jogador
//   ROOM_<nome>       pai de tudo que pertence a uma sala (liga/desliga a sala inteira)
//   DOOR_<nome>       porta; userData.door = 'slide' | 'hinge', userData.rooms = 'a,b'
//                     filhos com userData.slide = [x,y,z] deslizam esse tanto ao abrir
//   COL_*             malha invisível só de colisão
//   userData.collide  malha visível que também colide
//   userData.wet      piso que recebe o reflexo de chão molhado
//   WATER* / userData.water   superfície de água (jacuzzi)
//   userData.noReflect        não entra no passe de reflexo (objetos pequenos)

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
    this.stats = {};
  }

  build(root) {
    this.root = root;
    this.scene.add(root);
    root.updateMatrixWorld(true);

    // cenário feito com as peças KIT_/JAC_: materiais e colisores saem do nome das peças
    this.kit = isKitLevel(root) ? prepareKit(root) : null;
    this.spinners = this.kit ? this.kit.spinners : [];
    root.updateMatrixWorld(true);

    // peças com vida própria: cortina de fios (física) e holograma (shader)
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
        // o jogador olha para o +Z local do vazio (no Blender: o -Y local do vazio)
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
        // objetos pequenos não aparecem no reflexo: menos draw calls no passe extra
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        o.getWorldScale(_size);
        const r = o.geometry.boundingSphere.radius * Math.max(_size.x, _size.y, _size.z);
        if (r < 0.22) o.layers.set(1);
      }
    });

    // colisão estática
    this.collision.setStatic(colliders);
    hideAfter.forEach((o) => (o.visible = false));

    // salas
    for (const room of this.rooms) room.box.setFromObject(room.node).expandByScalar(0.05);

    // portas
    for (const node of doorNodes) this._addDoor(node);

    // reflexo do piso
    if (wetCount) {
      this.wet = new WetFloor(wetRect, wetY, 0xffffff);
      this.scene.add(this.wet.mesh);
    }

    // água: a malha original dá lugar a um disco com o shader de água; vapor por cima.
    // A espuma modelada sai: o shader desenha a espuma dos jatos.
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
      steam.room = room; // o vapor fica em mundo e some junto com a sala
      this.scene.add(steam.object);
      this.steams.push(steam);
    }

    // junta as malhas estáticas por material: centenas de peças viram poucos draw calls
    let batches = 0;
    if (this.kit) {
      hideAfter.forEach((o) => o.removeFromParent());
      const live = (p) => p.userData.spin || p.userData.dynamic;
      const dynamic = (o) => o.userData.water || isDoor(o) || ancestor(o, isDoor) || live(o) || ancestor(o, live);
      for (const room of this.rooms) batches += batchStatic(room.node, dynamic).batches;
      batches += batchStatic(root, (o) => dynamic(o) || ancestor(o, isRoom)).batches;
    }

    this.camera.layers.enable(1);
    this.stats = { meshes, batches, colliders: colliders.length, triangles: this.collision.triangles || 0 };
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

  // porta mais próxima que o jogador consegue acionar
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
      // não fecha em cima do jogador
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
    for (const r of this.rooms) r.node.visible = r.show;
  }

  // Jacuzzi ao alcance: o jogador está perto da borda (nos degraus de cima da plataforma
  // ou já dentro da água) E olhando para a banheira. Sem a segunda condição o aviso
  // aparecia de costas para ela ou junto dos móveis em volta.
  poolInReach(pos, dir) {
    for (const p of this.pools) {
      const dx = p.x - pos.x;
      const dz = p.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (pos.y > p.y + 0.5 || d > p.r + 1.3) continue;
      // dentro da água qualquer direção serve; fora, tem de estar de frente
      if (d > p.r && (dx * dir.x + dz * dir.z) / d < 0.6) continue;
      return p;
    }
    return null;
  }

  // Onde sentar dentro da água (pés), altura dos olhos, para onde olhar e por onde sair.
  // O jogador entra pelo lado em que está e fica de frente para o centro.
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
    const floor = pool.y - 0.47; // fundo da banheira
    return {
      to: new THREE.Vector3(pool.x + dx * pool.r * 0.5, floor, pool.z + dz * pool.r * 0.5),
      eye: pool.y + 0.36 - floor, // olhos uns 36 cm acima da água
      yaw: Math.atan2(dx, dz),
      exit: new THREE.Vector3(pool.x + dx * pool.r * 1.84, pool.y - 0.31, pool.z + dz * pool.r * 1.84),
    };
  }

  update(dt, time, pos, vel = _zero) {
    for (const f of this.fx) f.update(dt, time, pos, vel, this.renderer);
    // dentro da água da jacuzzi (o jogador anda mais devagar e a água reage a ele)
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

  // Captura um mapa de ambiente por sala (uma vez, no carregamento): dá o brilho
  // rosado nos metais, vidros e veludos sem custo por quadro.
  bakeEnvironments() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const wetVisible = this.wet ? this.wet.mesh.visible : false;
    if (this.wet) this.wet.mesh.visible = false;
    this.scene.environment = null;
    for (const room of this.rooms) {
      for (const r of this.rooms) r.node.visible = r === room;
      const c = room.box.getCenter(new THREE.Vector3());
      c.y = room.box.min.y + 1.7;
      if (room.node.userData.envPos) c.fromArray(room.node.userData.envPos);
      room.env = pmrem.fromScene(this.scene, 0.03, 0.05, 80, { size: 128, position: c }).texture;
    }
    pmrem.dispose();
    if (this.wet) this.wet.mesh.visible = wetVisible;
    this.updateRooms(this.spawn.position, true);
  }

  // Renderiza cada combinação de salas visíveis uma vez, para compilar os shaders
  // durante o carregamento e não travar ao abrir a porta.
  prewarm(renderFrame) {
    const combos = this.rooms.map((r) => [r]);
    combos.push(this.rooms.slice());
    for (const combo of combos) {
      for (const r of this.rooms) r.node.visible = combo.includes(r);
      if (combo.length === 1 && combo[0].env) this.scene.environment = combo[0].env;
      renderFrame();
    }
    this.updateRooms(this.spawn.position, true);
  }
}

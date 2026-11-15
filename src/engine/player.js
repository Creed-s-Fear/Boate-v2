import * as THREE from 'three';

const RADIUS = 0.3;
const HEIGHT = 1.74;
const EYE = 1.62;
const WALK = 2.5;
const RUN = 4.4;
const GRAVITY = -22;

const _seg = new THREE.Line3();
const _move = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _new = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

// Controle em primeira pessoa: teclado + mouse (pointer lock) e toque.
export class Player {
  constructor(camera, dom, collision) {
    this.camera = camera;
    this.dom = dom;
    this.collision = collision;
    this.position = new THREE.Vector3(); // pés
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.enabled = false;
    this.keys = new Set();
    this.stick = { x: 0, y: 0 };
    this.bob = 0;
    this.clock = 0;
    this.eyeOffset = EYE; // altura dos olhos acima dos pés (baixa dentro da água)
    this.wading = false; // andando dentro da água
    this.seat = null; // transição ou permanência sentado (jacuzzi)
    this.onInteract = null;
    this.onQuality = null;
    this._bind();
  }

  // Leva o jogador até `to` (pés) e o deixa sentado com os olhos em `eye` acima dos pés.
  sit(to, eye, yawTo) {
    this.seat = {
      from: this.position.clone(), to: to.clone(), t: 0, dur: 1.2, arc: 0.5,
      eyeFrom: this.eyeOffset, eyeTo: eye, yawFrom: this.yaw, yawTo, leaving: false,
    };
    this.keys.clear();
  }

  // Sai do assento até `to` e devolve o controle.
  stand(to) {
    this.seat = {
      from: this.position.clone(), to: to.clone(), t: 0, dur: 1.1, arc: 0.55,
      eyeFrom: this.eyeOffset, eyeTo: EYE, yawFrom: this.yaw, yawTo: null, leaving: true,
    };
  }

  get seated() {
    return !!this.seat && !this.seat.leaving && this.seat.t >= 1;
  }

  _seatUpdate(dt) {
    const s = this.seat;
    s.t = Math.min(1, s.t + dt / s.dur);
    const k = s.t * s.t * (3 - 2 * s.t);
    this.position.lerpVectors(s.from, s.to, k);
    this.position.y += Math.sin(Math.PI * k) * s.arc; // passa por cima da borda
    this.eyeOffset = s.eyeFrom + (s.eyeTo - s.eyeFrom) * k;
    if (s.yawTo !== null) {
      let d = (s.yawTo - s.yawFrom) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.yaw = s.yawFrom + d * k;
      if (s.t >= 1) s.yawTo = null; // depois de sentar, olhar fica livre
    }
    this.velocity.set(0, 0, 0);
    this._eyeY = this.position.y;
    this._bobAmp = 0;
    if (s.t >= 1 && s.leaving) {
      this.seat = null;
      this.onGround = true;
    }
    this._applyCamera();
  }

  spawn(pos, yaw = 0) {
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this._applyCamera(0);
  }

  _bind() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (!this.enabled) return;
      if (e.code === 'KeyE' && this.onInteract) this.onInteract();
      if (e.code === 'KeyG' && this.onQuality) this.onQuality();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.dom) return;
      this.look(e.movementX * 0.0022, e.movementY * 0.0022);
    });
  }

  look(dx, dy) {
    this.yaw -= dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy, -1.35, 1.35);
  }

  update(dt) {
    this.clock += dt;
    if (this.seat) {
      this._seatUpdate(dt);
      return;
    }
    if (!this.enabled) {
      this._applyCamera(dt);
      return;
    }
    // dentro da água o jogador afunda um pouco: olhos mais perto da superfície
    this.eyeOffset += ((this.wading ? 1.22 : EYE) - this.eyeOffset) * (1 - Math.exp(-dt * 4));
    const k = this.keys;
    let fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let side = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    fwd += -this.stick.y;
    side += this.stick.x;
    const len = Math.hypot(fwd, side);
    if (len > 1) {
      fwd /= len;
      side /= len;
    }
    const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? RUN : WALK) * (this.speedScale ?? 1);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // frente = -Z quando yaw = 0
    _move.set(side * cos - fwd * sin, 0, -side * sin - fwd * cos).multiplyScalar(speed);

    // aceleração suave no plano
    const blend = 1 - Math.exp(-dt * (len > 0.01 ? 10 : 14));
    this.velocity.x += (_move.x - this.velocity.x) * blend;
    this.velocity.z += (_move.z - this.velocity.z) * blend;
    // No chão a queda é mínima: o suficiente para ficar colado, pouco o bastante
    // para a cápsula conseguir subir degraus baixos empurrando contra a quina.
    this.velocity.y = this.onGround ? GRAVITY * dt : this.velocity.y + GRAVITY * dt;

    // subpassos para não atravessar paredes finas
    const dist = this.velocity.length() * dt;
    const steps = Math.min(5, Math.max(1, Math.ceil(dist / (RADIUS * 0.5))));
    const h = dt / steps;
    let grounded = false;
    for (let i = 0; i < steps; i++) {
      this.position.addScaledVector(this.velocity, h);
      _seg.start.set(this.position.x, this.position.y + RADIUS, this.position.z);
      _seg.end.set(this.position.x, this.position.y + HEIGHT - RADIUS, this.position.z);
      this.collision.resolveCapsule(_seg, RADIUS);
      _new.set(_seg.start.x, _seg.start.y - RADIUS, _seg.start.z);
      _delta.subVectors(_new, this.position);
      if (_delta.y > Math.abs(h * this.velocity.y * 0.25) + 1e-5) grounded = true;
      this.position.copy(_new);
      if (_delta.lengthSq() > 1e-10 && !grounded) {
        _delta.normalize();
        const into = _delta.dot(this.velocity);
        if (into < 0) this.velocity.addScaledVector(_delta, -into);
      }
    }
    this.onGround = grounded;
    if (this.position.y < -20) this.position.y = 2; // rede de segurança

    const planar = Math.hypot(this.velocity.x, this.velocity.z);
    this.bob += dt * planar * 2.6;
    this._bobAmp = THREE.MathUtils.lerp(this._bobAmp || 0, Math.min(1, planar / WALK), 1 - Math.exp(-dt * 8));
    this._applyCamera(dt);
  }

  _applyCamera() {
    const amp = this._bobAmp || 0;
    const bobY = Math.sin(this.bob * 2) * 0.022 * amp;
    const bobX = Math.cos(this.bob) * 0.012 * amp;
    this._eyeY = THREE.MathUtils.lerp(this._eyeY ?? this.position.y, this.position.y, 0.35);
    // sentado na água: balanço leve, como quem boia
    const float = this.seated ? Math.sin(this.clock * 1.3) * 0.012 : 0;
    this.camera.position.set(this.position.x, this._eyeY + this.eyeOffset + bobY + float, this.position.z);
    _euler.set(this.pitch, this.yaw, bobX * 0.4);
    this.camera.quaternion.setFromEuler(_euler);
  }
}

// Toque: metade esquerda move (joystick), metade direita olha.
export function bindTouch(player, root, stickEl, knobEl) {
  let moveId = null;
  let lookId = null;
  let origin = null;
  let last = null;
  const R = 46;

  const setKnob = (x, y) => {
    knobEl.style.transform = `translate(${x}px, ${y}px)`;
  };

  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    if (e.clientX < innerWidth * 0.45 && moveId === null) {
      moveId = e.pointerId;
      origin = { x: e.clientX, y: e.clientY };
    } else if (lookId === null) {
      lookId = e.pointerId;
      last = { x: e.clientX, y: e.clientY };
    }
  });
  root.addEventListener('pointermove', (e) => {
    if (e.pointerId === moveId) {
      let dx = e.clientX - origin.x;
      let dy = e.clientY - origin.y;
      const l = Math.hypot(dx, dy);
      if (l > R) {
        dx = (dx / l) * R;
        dy = (dy / l) * R;
      }
      player.stick.x = dx / R;
      player.stick.y = dy / R;
      setKnob(dx, dy);
    } else if (e.pointerId === lookId) {
      player.look((e.clientX - last.x) * 0.005, (e.clientY - last.y) * 0.005);
      last = { x: e.clientX, y: e.clientY };
    }
  });
  const end = (e) => {
    if (e.pointerId === moveId) {
      moveId = null;
      player.stick.x = 0;
      player.stick.y = 0;
      setKnob(0, 0);
    }
    if (e.pointerId === lookId) lookId = null;
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
}

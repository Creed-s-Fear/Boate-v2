/**
 * Minimapa 2D. O layout estático é desenhado uma vez num canvas fora da tela;
 * por quadro só se copia a imagem e desenha os marcadores (barato).
 */
import type { AABB } from '../game/collision2d';
import { MAP_BOUNDS as B, RECTS, WALLS, ZONES } from '../game/venue';

export interface MapMarker {
  x: number;
  z: number;
  color: string;
}

const ZONE_FILL: Record<string, string> = { club: '#1d1426', corridor: '#24121c', spa: '#2a1222' };

export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly base: HTMLCanvasElement;
  private readonly scale: number;

  constructor(canvas: HTMLCanvasElement) {
    this.scale = canvas.width / (B.maxX - B.minX);
    canvas.height = Math.round((B.maxZ - B.minZ) * this.scale);
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    this.base = document.createElement('canvas');
    this.base.width = canvas.width;
    this.base.height = canvas.height;
    const b = this.base.getContext('2d') as CanvasRenderingContext2D;
    b.fillStyle = '#0a0910';
    b.fillRect(0, 0, this.base.width, this.base.height);
    for (const z of ZONES) {
      b.fillStyle = ZONE_FILL[z.id] ?? '#24121c';
      this.rect(b, z);
    }
    b.fillStyle = '#ff3fa4';
    this.rect(b, RECTS.danceFloor, 0.3);
    b.fillStyle = '#19f0e0';
    this.circle(b, -4.1, -21.45, 1.6, 0.35); // jacuzzi
    b.fillStyle = '#8c6a8c';
    for (const w of WALLS) this.rect(b, w);
  }

  private rect(c: CanvasRenderingContext2D, r: AABB, alpha = 1): void {
    c.globalAlpha = alpha;
    c.fillRect((r.minX - B.minX) * this.scale, (r.minZ - B.minZ) * this.scale, Math.max(1, (r.maxX - r.minX) * this.scale), Math.max(1, (r.maxZ - r.minZ) * this.scale));
    c.globalAlpha = 1;
  }

  private circle(c: CanvasRenderingContext2D, x: number, z: number, r: number, alpha: number): void {
    c.globalAlpha = alpha;
    c.beginPath();
    c.arc((x - B.minX) * this.scale, (z - B.minZ) * this.scale, r * this.scale, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
  }

  /** camYaw: yaw da câmera (olhando para -Z com yaw 0). */
  draw(px: number, pz: number, camYaw: number, markers: MapMarker[]): void {
    const c = this.ctx;
    c.drawImage(this.base, 0, 0);
    for (const m of markers) {
      c.fillStyle = m.color;
      c.fillRect((m.x - B.minX) * this.scale - 1.5, (m.z - B.minZ) * this.scale - 1.5, 3, 3);
    }
    c.save();
    c.translate((px - B.minX) * this.scale, (pz - B.minZ) * this.scale);
    c.rotate(-camYaw);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(0, -6);
    c.lineTo(4, 4);
    c.lineTo(-4, 4);
    c.closePath();
    c.fill();
    c.restore();
  }
}

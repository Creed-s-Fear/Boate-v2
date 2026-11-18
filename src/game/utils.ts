export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

export const rand = (min: number, max: number): number => min + Math.random() * (max - min);

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Interpolates angle along the shortest path. */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function money(v: number): string {
  return `$${Math.floor(v).toLocaleString('en-US')}`;
}

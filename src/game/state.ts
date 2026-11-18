/**
 * Player state and economy rules.
 * - Guest: play money, saved in the browser.
 * - Account: balance (tokens bought with SOL) lives on the server; each purchase is
 *   charged there by item id and the client only displays the result.
 */
import { api, ApiError } from '../net/api';
import { ROOM_DURATION_SEC, priceOf, type ItemId } from './catalog';
import { ROOM_IDS, type RoomId } from './venue';

const SAVE_KEY = 'joh.save.v1';
const NAME_MAX = 16;

export type RoomStatus = 'free' | 'occupied' | 'mine';
export type SpendResult = { ok: true; fromBank: boolean } | { ok: false; error: string };

export interface Reservation {
  room: RoomId;
  expiresAt: number;
}

interface SaveData {
  name: string;
  shirt: number;
  cash: number;
  bank: number;
  vip: boolean;
}

export function sanitizeName(raw: string): string {
  const clean = raw.replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return clean || 'Guest';
}

export class GameState {
  name = 'Guest';
  shirt = 0x3a7bd5;
  cash = 200;
  bank = 1000;
  vip = false;
  /** Logged-in user; null = guest. */
  account: string | null = null;

  wristband = false;
  reservation: Reservation | null = null;
  buzz = 0;
  vibe = 0;
  elapsed = 0;
  readonly occupiedUntil: Record<RoomId, number> = { suite: 0 };

  private readonly listeners = new Set<() => void>();
  private paying = false;

  onChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  emit(): void {
    for (const fn of this.listeners) fn();
    this.save();
  }

  setAccount(username: string, balance: number, vip: boolean): void {
    this.account = username;
    this.name = username;
    this.cash = balance;
    this.bank = 0;
    this.vip = vip;
    this.emit();
  }

  setBalance(balance: number): void {
    if (!this.account || !isValidAmount(balance)) return;
    this.cash = balance;
    this.emit();
  }

  /** Guest: wallet and shortfall from bank. Account: charged on the server. */
  async spend(item: ItemId): Promise<SpendResult> {
    const amount = priceOf(item);
    if (amount === null) return { ok: false, error: 'Unknown item.' };
    if (!this.account) {
      if (this.cash + this.bank < amount) return { ok: false, error: 'Insufficient balance (wallet + bank).' };
      const fromCash = Math.min(this.cash, amount);
      this.cash -= fromCash;
      this.bank -= amount - fromCash;
      this.emit();
      return { ok: true, fromBank: fromCash < amount };
    }
    if (this.paying) return { ok: false, error: 'Wait for the previous payment.' };
    if (this.cash < amount) return { ok: false, error: 'Insufficient balance. Deposits: Solana Wallet, at the entrance terminal.' };
    this.paying = true;
    const requestId = crypto.randomUUID();
    try {
      let r: { balance: number };
      try {
        r = await api.spend(item, requestId);
      } catch (e) {
        // no response: retry with the same id — the server won't charge twice
        if (!(e instanceof ApiError) || e.status !== 0) throw e;
        r = await api.spend(item, requestId);
      }
      this.setBalance(r.balance);
      return { ok: true, fromBank: false };
    } catch (e) {
      if (e instanceof ApiError && typeof e.body.balance === 'number') this.setBalance(e.body.balance);
      return { ok: false, error: (e as Error).message };
    } finally {
      this.paying = false;
    }
  }

  /** Dance contest prize. With an account, the server draws the amount and rate-limits. */
  async reward(localAmount: number): Promise<{ prize: number } | { error: string }> {
    if (!this.account) {
      if (!isValidAmount(localAmount)) return { error: 'Invalid amount.' };
      this.cash += localAmount;
      this.emit();
      return { prize: localAmount };
    }
    try {
      const r = await api.danceReward();
      this.setBalance(r.balance);
      return { prize: r.prize };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  withdraw(amount: number): boolean {
    if (this.account || !isValidAmount(amount) || this.bank < amount) return false;
    this.bank -= amount;
    this.cash += amount;
    this.emit();
    return true;
  }

  depositAll(): number {
    if (this.account) return 0;
    const v = this.cash;
    this.bank += v;
    this.cash = 0;
    this.emit();
    return v;
  }

  roomStatus(id: RoomId): RoomStatus {
    if (this.reservation?.room === id) return 'mine';
    return this.occupiedUntil[id] > this.elapsed ? 'occupied' : 'free';
  }

  async reserve(id: RoomId): Promise<string | null> {
    if (this.reservation) return 'You already have the suite booked.';
    if (this.roomStatus(id) !== 'free') return 'The suite is occupied.';
    const r = await this.spend('room');
    if (!r.ok) return r.error;
    this.reservation = { room: id, expiresAt: this.elapsed + ROOM_DURATION_SEC };
    this.emit();
    return null;
  }

  async extendReservation(): Promise<string | null> {
    if (!this.reservation) return 'No active reservation.';
    const r = await this.spend('roomExtend');
    if (!r.ok) return r.error;
    if (!this.reservation) return null;
    this.reservation.expiresAt += ROOM_DURATION_SEC;
    this.emit();
    return null;
  }

  releaseRoom(): void {
    this.reservation = null;
    this.emit();
  }

  load(): void {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as Partial<SaveData>;
      // Fail secure: any invalid field keeps the default.
      if (typeof d.name === 'string') this.name = sanitizeName(d.name);
      if (Number.isInteger(d.shirt) && (d.shirt as number) >= 0 && (d.shirt as number) <= 0xffffff) this.shirt = d.shirt as number;
      if (isValidAmount(d.cash)) this.cash = d.cash;
      if (isValidAmount(d.bank)) this.bank = d.bank;
      if (typeof d.vip === 'boolean') this.vip = d.vip;
    } catch {
      /* corrupted save: ignore */
    }
  }

  /** Only guests are saved in the browser; account balances live on the server. */
  save(): void {
    if (this.account) return;
    const data: SaveData = { name: this.name, shirt: this.shirt, cash: this.cash, bank: this.bank, vip: this.vip };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* storage unavailable (private tab etc.) — the game continues without saving */
    }
  }

  isRoom(id: string): id is RoomId {
    return (ROOM_IDS as readonly string[]).includes(id);
  }
}

function isValidAmount(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e9;
}

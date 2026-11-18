/**
 * Single price table, read by the game and the server. With an account, the server
 * charges by item id and never accepts a value from the client.
 */

export const PRICES = {
  wristband: 50,
  vipPass: 300,
  room: 120,
  roomExtend: 100,
  hostessDrink: 30,
  hostessTip: 50,
  privateDance: 80,
  roomChampagne: 120,
  specialNight: 200,
  vipChampagne: 200,
} as const;

export const ROOM_DURATION_SEC = 180;
export const PREMIUM_MULT = 1.5;

export const HOSTESS_PRICES = {
  Valentina: 180,
  Yasmin: 150,
  Bianca: 220,
  Luna: 160,
} as const;

export type HostessName = keyof typeof HOSTESS_PRICES;

export const DRINKS = [
  { id: 'agua', name: 'Water', price: 5, buzz: -0.25, alcohol: false },
  { id: 'refri', name: 'Soda', price: 8, buzz: 0, alcohol: false },
  { id: 'cerveja', name: 'Beer', price: 15, buzz: 0.12, alcohol: true },
  { id: 'olho-magico', name: 'Peekhole (house drink)', price: 25, buzz: 0.2, alcohol: true },
  { id: 'tequila', name: 'Tequila shot', price: 30, buzz: 0.3, alcohol: true },
] as const;

/** Purchasable item: `wristband`, `drink:cerveja`, `hostess:Luna`, `hostessPremium:Luna`. */
export type ItemId = string;

export const itemId = {
  fixed: (k: keyof typeof PRICES): ItemId => k,
  drink: (id: string): ItemId => `drink:${id}`,
  hostess: (name: string): ItemId => `hostess:${name}`,
  hostessPremium: (name: string): ItemId => `hostessPremium:${name}`,
};

const has = <T extends object>(o: T, k: string): k is Extract<keyof T, string> => Object.prototype.hasOwnProperty.call(o, k);

/** Price of the item, or null if the id doesn't exist. */
export function priceOf(id: ItemId): number | null {
  if (typeof id !== 'string' || id.length > 48) return null;
  if (has(PRICES, id)) return PRICES[id];
  const [kind, arg, extra] = id.split(':');
  if (!arg || extra !== undefined) return null;
  if (kind === 'drink') return DRINKS.find((d) => d.id === arg)?.price ?? null;
  if (kind === 'hostess' && has(HOSTESS_PRICES, arg)) return HOSTESS_PRICES[arg];
  if (kind === 'hostessPremium' && has(HOSTESS_PRICES, arg)) return Math.round(HOSTESS_PRICES[arg] * PREMIUM_MULT);
  return null;
}

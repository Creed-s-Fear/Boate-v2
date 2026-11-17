/**
 * Derivação SLIP-0010 (ed25519, só índices endurecidos) no caminho m/44'/501'/i'/0',
 * o mesmo das carteiras Solana. Um segredo mestre gera um endereço por conta; o banco
 * guarda só o índice e o endereço público.
 */
import { createHmac } from 'node:crypto';
import { Keypair } from '@solana/web3.js';

const HARDENED = 0x80000000;

export function deriveEd25519(master: Buffer, path: number[]): Buffer {
  let I = createHmac('sha512', 'ed25519 seed').update(master).digest();
  let key = I.subarray(0, 32);
  let chain = I.subarray(32);
  for (const index of path) {
    if (!Number.isInteger(index) || index < 0 || index >= HARDENED) throw new Error('índice inválido');
    const data = Buffer.alloc(37);
    key.copy(data, 1);
    data.writeUInt32BE((index + HARDENED) >>> 0, 33);
    I = createHmac('sha512', chain).update(data).digest();
    key = I.subarray(0, 32);
    chain = I.subarray(32);
  }
  return Buffer.from(key);
}

export function depositKeypair(master: Buffer, userId: number): Keypair {
  return Keypair.fromSeed(deriveEd25519(master, [44, 501, userId, 0]));
}

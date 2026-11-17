import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveEd25519 } from './hd';

// Vetor de teste 1 da SLIP-0010 (ed25519).
const seed = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');

test('SLIP-0010 m', () => {
  assert.equal(deriveEd25519(seed, []).toString('hex'), '2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7');
});

test("SLIP-0010 m/0'", () => {
  assert.equal(deriveEd25519(seed, [0]).toString('hex'), '68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3');
});

test('índice fora do intervalo é recusado', () => {
  assert.throws(() => deriveEd25519(seed, [0x80000000]));
});

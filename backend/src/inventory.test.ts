import { expect, test, describe } from 'vitest';
import { loadInventory, bundledInventory, INVENTORY_KEY } from './inventory';

// A KVNamespace stub that serves one `_inventory` value (or throws / returns null).
function kvStub(value: unknown, { key = INVENTORY_KEY } = {}) {
  return {
    get: async (k: string) => (k === key ? value : null),
  } as unknown as KVNamespace;
}

const CUSTOM = [
  { id: '999', guid: 'guid-from-kv', name: 'KV Camp', kind: 'rec', ref: '999', agency: 'usfs', collect: true },
];

describe('loadInventory — KV is the source of truth, bundled is the fallback', () => {
  test('prefers the KV _inventory when present', async () => {
    const inv = await loadInventory(kvStub(CUSTOM));
    expect(inv).toEqual(CUSTOM);
    expect(inv).not.toBe(bundledInventory);
  });

  test('falls back to the bundled inventory when KV has no namespace', async () => {
    const inv = await loadInventory(undefined);
    expect(inv).toBe(bundledInventory);
    expect(inv.length).toBeGreaterThan(0);
  });

  test('falls back when KV returns null (unseeded key)', async () => {
    const inv = await loadInventory(kvStub(null));
    expect(inv).toBe(bundledInventory);
  });

  test('falls back when KV returns an empty array', async () => {
    const inv = await loadInventory(kvStub([]));
    expect(inv).toBe(bundledInventory);
  });

  test('falls back when the KV get throws', async () => {
    const throwing = { get: async () => { throw new Error('kv down'); } } as unknown as KVNamespace;
    const inv = await loadInventory(throwing);
    expect(inv).toBe(bundledInventory);
  });
});

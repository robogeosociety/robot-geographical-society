/**
 * The campsite inventory — which sites exist, their provider mapping (kind + ref/id),
 * guid, geo, and the `collect` flag. This is the **collector's source of truth**.
 *
 * KV (`CAMPSITES` under the single `_inventory` key) is authoritative at runtime; the
 * bundled `campsites-index.json` is the fallback used when KV is empty/unavailable.
 * The KV copy is refreshed on deploy (`.github/workflows/deploy-kv.yaml`) from the
 * inventory the camping-vault pydoit job lands in the repo — so the collector picks up
 * inventory changes **without a Worker redeploy**, while a fresh/empty KV still works
 * off the bundled fallback.
 */
import bundled from './campsites-index.json';

// Single KV key holding the whole inventory array (one get, not 156 keys). Underscored
// so it can't collide with a campsite slug used by GET /campsite/:id.
export const INVENTORY_KEY = '_inventory';

export type InventoryEntry = {
  id: string;
  guid: string;
  name: string;
  kind?: 'rec' | 'wa';
  ref?: string | number;
  agency?: string;
  agency_full?: string;
  lat?: number | null;
  lng?: number | null;
  collect?: boolean | null;
};

export const bundledInventory = bundled as unknown as InventoryEntry[];

/**
 * Load the inventory, preferring the KV copy and falling back to the bundled JSON.
 * Any KV miss/parse error/empty array falls back, so a Worker with an unseeded KV
 * still collects off the build-time inventory.
 */
export async function loadInventory(kv?: KVNamespace): Promise<InventoryEntry[]> {
  if (kv) {
    try {
      const fromKv = await kv.get<InventoryEntry[]>(INVENTORY_KEY, { type: 'json' });
      if (Array.isArray(fromKv) && fromKv.length > 0) return fromKv;
    } catch {
      // fall through to the bundled fallback
    }
  }
  return bundledInventory;
}

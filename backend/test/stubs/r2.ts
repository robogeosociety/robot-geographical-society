// Minimal in-memory R2Bucket stub for read-endpoint tests. Supports the subset
// the read API uses: get/head/put/delete and list() with a prefix + optional
// delimiter (for date-partition discovery). Values are stored as JSON strings;
// get() returns an object exposing json()/text() like the real R2ObjectBody.
export type Seed = Record<string, unknown>;

export function makeR2(seed: Seed = {}) {
  const store = new Map<string, string>();
  const enc = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
  for (const [k, v] of Object.entries(seed)) store.set(k, enc(v));

  return {
    _store: store,
    async get(key: string) {
      if (!store.has(key)) return null;
      const body = store.get(key)!;
      return { text: async () => body, json: async () => JSON.parse(body) };
    },
    async head(key: string) {
      return store.has(key) ? ({ key } as any) : null;
    },
    async put(key: string, value: unknown) {
      store.set(key, enc(value));
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list(opts: { prefix?: string; delimiter?: string; cursor?: string } = {}) {
      const prefix = opts.prefix ?? '';
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
      if (opts.delimiter) {
        const delimited = new Set<string>();
        const objects: { key: string }[] = [];
        for (const k of keys) {
          const rest = k.slice(prefix.length);
          const i = rest.indexOf(opts.delimiter);
          if (i >= 0) delimited.add(prefix + rest.slice(0, i + opts.delimiter.length));
          else objects.push({ key: k });
        }
        return { objects, delimitedPrefixes: [...delimited], truncated: false };
      }
      return { objects: keys.map((key) => ({ key })), delimitedPrefixes: [], truncated: false };
    },
  };
}

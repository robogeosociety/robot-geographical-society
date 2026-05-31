import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Resolve the Workers-runtime `cloudflare:workers` module to a stub in Node tests
// (build/runtime use the real one). Keeps the Hono route tests importable now
// that index.ts re-exports the Workflow classes.
export default defineConfig({
  resolve: {
    alias: {
      'cloudflare:workers': resolve(__dirname, 'test/stubs/cloudflare-workers.ts'),
    },
  },
});

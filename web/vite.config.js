import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load ALL env vars (the empty prefix includes non-VITE_ secrets). These are read
  // here in Node, for the dev server only — they are NEVER inlined into the client
  // bundle (only VITE_-prefixed vars are). This is what keeps the backend token off
  // the browser. See web/BACKEND_AUTH.md.
  const env = loadEnv(mode, process.cwd(), '');
  // The app always talks to the backend via the same-origin `/api` proxy (see
  // src/apiBase.js). Target the deployed Worker when BACKEND_URL is set, else a local
  // `wrangler dev` backend. The deployed Worker is its own auth boundary (the 404
  // wall, tailnet migration Phase 2 — Access retired): the dev server attaches the
  // pre-shared RGS_KEY as the X-RGS-Key header — server-side, so the browser never
  // holds the secret. Get the key with `rgs-admin env`. See web/BACKEND_AUTH.md.
  const backend = env.BACKEND_URL || 'http://127.0.0.1:8787';
  const proxy = {
    '/api': {
      target: backend,
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/api/, ''),
      headers: {
        ...(env.RGS_KEY && { 'X-RGS-Key': env.RGS_KEY }),
      },
    },
  };

  return {
    plugins: [react()],
    server: {
      // rgs Vite port (registry: ~/.claude/vite-ports.json). CI overrides with --port 5173.
      port: 5191,
      strictPort: true,
      allowedHosts: true,
      fs: {
        allow: ['..'],
      },
      proxy,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/setupTests.js'],
      globals: true,
    },
  };
});

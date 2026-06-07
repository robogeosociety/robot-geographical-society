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
  // src/apiBase.js). Target the deployed Access-protected Worker when BACKEND_URL is
  // set, else a local `wrangler dev` backend. When the Access service-token creds are
  // present (CF_ACCESS_CLIENT_ID/SECRET), the dev server attaches them as request
  // headers here — server-side, so the browser never holds the secret, and the same
  // path works against the gated backend. See web/BACKEND_AUTH.md.
  const backend = env.BACKEND_URL || 'http://127.0.0.1:8787';
  const proxy = {
    '/api': {
      target: backend,
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/api/, ''),
      headers: {
        ...(env.CF_ACCESS_CLIENT_ID && { 'CF-Access-Client-Id': env.CF_ACCESS_CLIENT_ID }),
        ...(env.CF_ACCESS_CLIENT_SECRET && { 'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET }),
      },
    },
  };

  return {
    plugins: [react()],
    server: {
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

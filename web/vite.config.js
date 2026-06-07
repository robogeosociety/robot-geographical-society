import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load ALL env vars (the empty prefix includes non-VITE_ secrets). These are read
  // here in Node, for the dev server only — they are NEVER inlined into the client
  // bundle (only VITE_-prefixed vars are). This is what keeps the backend token off
  // the browser. See web/BACKEND_AUTH.md.
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.BACKEND_URL;

  // Same-origin `/api` proxy → the deployed Worker. When the Worker sits behind
  // Cloudflare Access, the dev server attaches a service token as request headers
  // here (server-side), so the browser authenticates without ever holding the
  // secret. No BACKEND_URL set → no proxy: the app talks to the local `wrangler
  // dev` backend directly, exactly as before (unchanged for CI/e2e).
  const proxy = backend
    ? {
        '/api': {
          target: backend,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
          headers: {
            ...(env.CF_ACCESS_CLIENT_ID && { 'CF-Access-Client-Id': env.CF_ACCESS_CLIENT_ID }),
            ...(env.CF_ACCESS_CLIENT_SECRET && { 'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET }),
          },
        },
      }
    : undefined;

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

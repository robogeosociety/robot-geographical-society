import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { setupTailscaleHttpProxy, getTailscaleStatus } from './tailscale.js';
import { isPortFree, waitForPort } from './process.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const UI_DIR = path.join(__dirname, '..', '..', 'dev-server-ui');
export const PUBLIC_DIR = path.join(UI_DIR, 'public');
export const DASHBOARD_FILE = path.join(PUBLIC_DIR, 'dev-servers.json');
export const DASHBOARD_TS_PATH = '/servers';
export const DASHBOARD_PORT = 5099;

export function writeDashboard(servers) {
  const data = {
    updated: new Date().toISOString(),
    servers: Object.fromEntries(
      Object.entries(servers || {}).map(([port, s]) => [port, {
        project: s.project_dir ? path.basename(s.project_dir) : '?',
        type: s.type || '?',
        port: s.port,
        localUrl: s.localUrl || null,
        tailscaleUrl: s.tailscaleUrl || null,
        started_at: s.started_at || null,
      }])
    ),
  };

  try {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    fs.writeFileSync(DASHBOARD_FILE, JSON.stringify(data, null, 2));
  } catch {
    // Ignore write errors
  }
}

export async function ensureTailscaleDashboard() {
  if (await isPortFree(DASHBOARD_PORT)) {
    const child = spawn('npx', ['vite'], {
      cwd: UI_DIR,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });
    child.unref();
    await waitForPort(DASHBOARD_PORT, 15000);
  }

  const status = await getTailscaleStatus();
  if (!status.available) return;
  try {
    await setupTailscaleHttpProxy(DASHBOARD_TS_PATH, DASHBOARD_PORT);
  } catch {
    // Already configured or unavailable
  }
}

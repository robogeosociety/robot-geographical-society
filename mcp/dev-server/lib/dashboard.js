import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { setupTailscaleHttpProxy, getTailscaleStatus } from './tailscale.js';
import { isPortFree, waitForPort } from './process.js';

const SERVER_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dashboard-server.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PUBLIC_DIR = path.join(__dirname, '..', 'public');
export const DASHBOARD_FILE = path.join(PUBLIC_DIR, 'dev-servers.md');
export const DASHBOARD_TS_PATH = '/servers';
export const DASHBOARD_PORT = 5099;

export function writeDashboard(servers) {
  const entries = Object.values(servers || {});

  const lines = [
    '# Active Dev Servers',
    '',
    `_Updated: ${new Date().toLocaleString()}_`,
    '',
  ];

  if (entries.length === 0) {
    lines.push('_No active dev servers._');
  } else {
    lines.push('| Project | Type | Port | Local URL | Tailscale URL |');
    lines.push('|---------|------|------|-----------|---------------|');
    for (const s of entries) {
      const project = s.project_dir ? path.basename(s.project_dir) : '?';
      const local = s.localUrl ? `[${s.localUrl}](${s.localUrl})` : '-';
      const ts = s.tailscaleUrl ? `[${s.tailscaleUrl}](${s.tailscaleUrl})` : '-';
      lines.push(`| ${project} | ${s.type || '?'} | ${s.port} | ${local} | ${ts} |`);
    }
  }

  try {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    fs.writeFileSync(DASHBOARD_FILE, lines.join('\n') + '\n');
  } catch {
    // Ignore write errors
  }
}

export async function ensureTailscaleDashboard() {
  // Start the dashboard server if not already running on the dashboard port
  if (await isPortFree(DASHBOARD_PORT)) {
    const child = spawn(process.execPath, [SERVER_SCRIPT], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, DASHBOARD_PORT: String(DASHBOARD_PORT), DASHBOARD_FILE },
    });
    child.unref();
    await waitForPort(DASHBOARD_PORT, 3000);
  }

  const status = await getTailscaleStatus();
  if (!status.available) return;
  try {
    await setupTailscaleHttpProxy(DASHBOARD_TS_PATH, DASHBOARD_PORT);
  } catch {
    // Already configured or unavailable
  }
}

import { execFile } from 'child_process';

function exec(cmd, args, timeout = 5000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

export async function getTailscaleStatus() {
  try {
    const { stdout } = await exec('tailscale', ['status', '--self', '--json']);
    const data = JSON.parse(stdout);
    const hostname = data.Self.DNSName.replace(/\.$/, '');
    return { available: true, hostname };
  } catch {
    return { available: false, hostname: null };
  }
}

export async function setupTailscaleServe(tsPath, localPort, viteBase = "/") {
  const status = await getTailscaleStatus();
  if (!status.available) {
    throw new Error('Tailscale is not available or not connected');
  }

  await exec('tailscale', [
    'serve', '--bg',
    '--set-path', tsPath,
    `http://127.0.0.1:${localPort}${tsPath}/`,
  ]);

  return `https://${status.hostname}${tsPath}`;
}

export async function removeTailscaleServe(tsPath) {
  try {
    await exec('tailscale', ['serve', '--set-path', tsPath, 'off']);
    return true;
  } catch {
    return false; // Already removed or not set up
  }
}

export async function setupTailscaleHttpProxy(tsPath, localPort, localPath = '/') {
  const status = await getTailscaleStatus();
  if (!status.available) throw new Error('Tailscale not available');
  await exec('tailscale', ['serve', '--bg', '--set-path', tsPath, `http://127.0.0.1:${localPort}${localPath}`]);
  return `https://${status.hostname}${tsPath}`;
}

export async function getTailscaleUrl(port) {
  const status = await getTailscaleStatus();
  if (!status.available) return null;

  // Check tailscale serve status for routes pointing to this port
  try {
    const { stdout } = await exec('tailscale', ['serve', 'status', '--json']);
    const data = JSON.parse(stdout);
    // Walk the serve config to find paths mapping to this port
    const tcp = data?.TCP || {};
    const web = data?.Web || {};
    for (const [, handlers] of Object.entries(web)) {
      for (const [pathKey, handler] of Object.entries(handlers?.Handlers || {})) {
        if (handler.Proxy && handler.Proxy.includes(`:${port}`)) {
          return `https://${status.hostname}${pathKey}`;
        }
      }
    }
  } catch {
    // serve status not available
  }
  return null;
}

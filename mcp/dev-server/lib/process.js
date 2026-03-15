import { execFile } from 'child_process';
import net from 'net';

function exec(cmd, args, timeout = 5000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

export async function getProcessOnPort(port) {
  // Try lsof first (macOS + Linux)
  try {
    const { stdout } = await exec('lsof', ['-ti', `:${port}`]);
    if (!stdout) return null;
    const pid = parseInt(stdout.split('\n')[0], 10);
    if (isNaN(pid)) return null;
    // Get command name
    try {
      const { stdout: cmdOut } = await exec('ps', ['-p', String(pid), '-o', 'comm=']);
      return { pid, command: cmdOut };
    } catch {
      return { pid, command: 'unknown' };
    }
  } catch {
    // lsof not available or no process found
  }

  // Fallback: ss (Linux)
  try {
    const { stdout } = await exec('ss', ['-tlnp', `sport = :${port}`]);
    const match = stdout.match(/pid=(\d+)/);
    if (match) {
      const pid = parseInt(match[1], 10);
      try {
        const { stdout: cmdOut } = await exec('ps', ['-p', String(pid), '-o', 'comm=']);
        return { pid, command: cmdOut };
      } catch {
        return { pid, command: 'unknown' };
      }
    }
  } catch {
    // ss not available either
  }

  return null;
}

export async function killProcessOnPort(port) {
  const proc = await getProcessOnPort(port);
  if (!proc) return false;

  try {
    process.kill(proc.pid, 'SIGTERM');
  } catch {
    return false;
  }

  // Wait up to 3 seconds for graceful shutdown
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      process.kill(proc.pid, 0);
    } catch {
      return true; // Process is dead
    }
  }

  // Force kill
  try {
    process.kill(proc.pid, 'SIGKILL');
    await new Promise(r => setTimeout(r, 500));
    return true;
  } catch {
    return true;
  }
}

export function isPortFree(port) {
  return new Promise((resolve) => {
    const conn = net.createConnection({ port, host: '127.0.0.1' });
    conn.on('connect', () => {
      conn.destroy();
      resolve(false); // Port is in use
    });
    conn.on('error', () => {
      resolve(true); // Port is free
    });
  });
}

export async function waitForPort(port, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const free = await isPortFree(port);
    if (!free) return true; // Something is now listening
    await new Promise(r => setTimeout(r, 500));
  }
  return false; // Timed out
}

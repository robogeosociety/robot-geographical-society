import assert from 'node:assert/strict';
import net from 'node:net';
import { describe, it } from 'node:test';
import { getProcessOnPort, isPortFree, waitForPort } from '../lib/process.js';

describe('isPortFree', () => {
  it('returns true for a port nothing is listening on', async () => {
    // Use a high ephemeral port unlikely to be in use
    const free = await isPortFree(59123);
    assert.equal(free, true);
  });

  it('returns false for a port with an active listener', async () => {
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const free = await isPortFree(port);
      assert.equal(free, false);
    } finally {
      server.close();
    }
  });
});

describe('waitForPort', () => {
  it('resolves true when a server starts listening', async () => {
    const server = net.createServer();
    const port = 59200 + Math.floor(Math.random() * 100);

    // Start listening after a short delay
    setTimeout(() => {
      server.listen(port);
    }, 200);

    try {
      const result = await waitForPort(port, 3000);
      assert.equal(result, true);
    } finally {
      server.close();
    }
  });

  it('resolves false on timeout when nothing listens', async () => {
    const result = await waitForPort(59399, 500);
    assert.equal(result, false);
  });
});

describe('getProcessOnPort', () => {
  it('returns null for a free port', async () => {
    const result = await getProcessOnPort(59400);
    assert.equal(result, null);
  });

  it('returns process info for an occupied port', async () => {
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const result = await getProcessOnPort(port);
      // Should find the current node process
      assert.ok(result, 'Expected process info for occupied port');
      assert.equal(typeof result.pid, 'number');
      assert.ok(result.pid > 0);
    } finally {
      server.close();
    }
  });
});

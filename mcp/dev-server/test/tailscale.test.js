import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getTailscaleStatus, removeTailscaleServe } from '../lib/tailscale.js';

describe('getTailscaleStatus', () => {
  it('returns an object with available and hostname fields', async () => {
    const status = await getTailscaleStatus();
    assert.equal(typeof status.available, 'boolean');
    if (status.available) {
      assert.equal(typeof status.hostname, 'string');
      assert.ok(status.hostname.length > 0);
      assert.ok(
        !status.hostname.endsWith('.'),
        'Hostname should not end with a dot',
      );
    } else {
      assert.equal(status.hostname, null);
    }
  });
});

describe('removeTailscaleServe', () => {
  it('returns false gracefully when tailscale is unavailable or path not set', async () => {
    const result = await removeTailscaleServe('/nonexistent-test-path-xyz');
    // Should not throw, just return false
    assert.equal(typeof result, 'boolean');
  });
});

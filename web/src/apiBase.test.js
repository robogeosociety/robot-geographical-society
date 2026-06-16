import { describe, test, expect } from 'vitest';
import { apiBase } from './apiBase';

describe('apiBase', () => {
  test('always the same-origin /api path (proxied in dev, Pages Function in prod)', () => {
    expect(apiBase()).toBe('/api');
  });
});

import { getAvailability, getCollectors, reactivate, _resetCaches } from './api';

beforeEach(() => _resetCaches()); // drop the persistent (localStorage) cache between cases
afterEach(() => vi.restoreAllMocks());

function jsonOk(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

describe('api data layer', () => {
  it('getCollectors fetches /collectors through the proxy base', async () => {
    const spy = vi.spyOn(global, 'fetch').mockReturnValue(jsonOk([{ guid: 'a' }]));
    const rows = await getCollectors();
    expect(rows).toEqual([{ guid: 'a' }]);
    expect(String(spy.mock.calls[0][0])).toMatch(/\/collectors$/);
  });

  it('getAvailability caches per date — a repeated date does not refetch', async () => {
    const spy = vi.spyOn(global, 'fetch').mockReturnValue(jsonOk([{ guid: 'x' }]));
    await getAvailability('2026-07-01');
    await getAvailability('2026-07-01');
    await getAvailability('2026-07-02');
    const dates = spy.mock.calls.map(([u]) => String(u));
    expect(dates.filter((u) => u.includes('2026-07-01'))).toHaveLength(1);
    expect(dates.filter((u) => u.includes('2026-07-02'))).toHaveLength(1);
  });

  it('getCollectors serves from the persistent cache — a reload-style repeat does not refetch', async () => {
    const spy = vi.spyOn(global, 'fetch').mockReturnValue(jsonOk([{ guid: 'a' }]));
    await getCollectors();
    // getCollectors holds nothing in memory, so this second call only avoids the
    // network if it read the body back out of localStorage — i.e. survives a reload.
    const rows = await getCollectors();
    expect(rows).toEqual([{ guid: 'a' }]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('reactivate busts the fleet cache so the next read refetches', async () => {
    const spy = vi
      .spyOn(global, 'fetch')
      .mockReturnValueOnce(jsonOk([{ guid: 'a', state: 'quarantined' }])) // getCollectors (cold)
      .mockReturnValueOnce(jsonOk({ status: 'reactivated' }))             // reactivate POST
      .mockReturnValueOnce(jsonOk([{ guid: 'a', state: 'healthy' }]));    // getCollectors (refetch)
    await getCollectors();
    await reactivate('247585');
    const rows = await getCollectors();
    expect(rows).toEqual([{ guid: 'a', state: 'healthy' }]);
    expect(spy).toHaveBeenCalledTimes(3); // the cache was invalidated, so the reread went to network
  });

  it('reactivate POSTs /collect/reactivate keyed on provider id', async () => {
    const spy = vi.spyOn(global, 'fetch').mockReturnValue(jsonOk({ status: 'reactivated' }));
    await reactivate('247585');
    const [url, opts] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/collect\/reactivate\?id=247585$/);
    expect(opts.method).toBe('POST');
  });

  it('throws on a non-ok response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 502 });
    await expect(getCollectors()).rejects.toThrow(/502/);
  });
});

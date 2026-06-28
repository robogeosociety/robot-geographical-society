import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildSubscriptionEmbed,
  buildHotEmbed,
  computeFillRate,
  notifyHotCampground,
  sendWebhook,
  notifySubscriptionMatches,
  loadPreviousSites,
  formatDate,
  reservationUrl,
  type SiteInfo,
} from "./discord";
import type { Subscription, SiteMatch } from "./subscriptions";

// --- buildSubscriptionEmbed --------------------------------------------------

describe("buildSubscriptionEmbed", () => {
  const site: SiteInfo = {
    id: "usfs/middle-fork",
    name: "Middle Fork",
    agency: "usfs",
    kind: "rec",
    ref: 233864,
  };

  it("builds a green embed with subscription context", () => {
    const sub: Subscription = {
      id: "1",
      campgroundId: "usfs/middle-fork",
      siteLabel: "24",
      note: "weekend trip",
      createdAt: "2026-06-27T00:00:00Z",
    };
    const matches: SiteMatch[] = [
      { siteId: "81835", label: "24", date: "2026-07-04", status: "available" },
    ];
    const embed = buildSubscriptionEmbed(site, sub, matches);
    expect(embed.color).toBe(0x2ecc71);
    expect(embed.title).toContain("Middle Fork");
    expect(embed.title).toContain("Site 24");
    expect(embed.description).toContain("subscription");
    expect(embed.description).toContain("weekend trip");
  });

  it("includes site labels in the Sites field", () => {
    const sub: Subscription = {
      id: "2",
      campgroundId: "usfs/middle-fork",
      createdAt: "2026-06-27T00:00:00Z",
    };
    const matches: SiteMatch[] = [
      { siteId: "81835", label: "24", date: "2026-07-04", status: "available" },
      { siteId: "81836", label: "25", date: "2026-07-04", status: "available" },
    ];
    const embed = buildSubscriptionEmbed(site, sub, matches);
    const sitesField = embed.fields.find((f) => f.name === "Sites");
    expect(sitesField).toBeDefined();
    expect(sitesField!.value).toContain("24");
    expect(sitesField!.value).toContain("25");
  });

  it("includes a book-now link using the provider ref", () => {
    const sub: Subscription = {
      id: "3",
      campgroundId: "usfs/middle-fork",
      createdAt: "2026-06-27T00:00:00Z",
    };
    const matches: SiteMatch[] = [
      { siteId: "81835", label: "24", date: "2026-07-04", status: "available" },
    ];
    const embed = buildSubscriptionEmbed(site, sub, matches);
    const bookField = embed.fields.find((f) => f.name === "Book Now");
    expect(bookField).toBeDefined();
    expect(bookField!.value).toContain("/campgrounds/233864");
  });

  it("caps match lines at 15", () => {
    const sub: Subscription = {
      id: "4",
      campgroundId: "usfs/middle-fork",
      createdAt: "2026-06-27T00:00:00Z",
    };
    const matches: SiteMatch[] = Array.from({ length: 20 }, (_, i) => ({
      siteId: `site-${i}`,
      label: String(i),
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      status: "available" as const,
    }));
    const embed = buildSubscriptionEmbed(site, sub, matches);
    const availField = embed.fields.find((f) => f.name === "Availability");
    expect(availField!.value).toContain("…and 5 more");
  });

  it("pluralizes correctly for single match", () => {
    const sub: Subscription = {
      id: "5",
      campgroundId: "usfs/middle-fork",
      createdAt: "2026-06-27T00:00:00Z",
    };
    const matches: SiteMatch[] = [
      { siteId: "81835", label: "24", date: "2026-07-04", status: "available" },
    ];
    const embed = buildSubscriptionEmbed(site, sub, matches);
    expect(embed.description).toContain("campsite-night ");
    expect(embed.description).not.toContain("campsite-nights");
  });
});

// --- reservationUrl ----------------------------------------------------------

describe("reservationUrl", () => {
  it("uses numeric ref for rec.gov", () => {
    const site: SiteInfo = { id: "usfs/middle-fork", name: "Middle Fork", agency: "usfs", kind: "rec", ref: 233864 };
    expect(reservationUrl(site)).toBe("https://www.recreation.gov/camping/campgrounds/233864");
  });

  it("prefers explicit reservation_url", () => {
    const site: SiteInfo = { id: "usfs/middle-fork", name: "Middle Fork", agency: "usfs", kind: "rec", reservation_url: "https://example.org/book" };
    expect(reservationUrl(site)).toBe("https://example.org/book");
  });

  it("returns goingtocamp for WA", () => {
    const site: SiteInfo = { id: "wa/deception-pass", name: "Deception Pass", agency: "wa", kind: "wa" };
    expect(reservationUrl(site)).toBe("https://washington.goingtocamp.com/");
  });
});

// --- sendWebhook -------------------------------------------------------------

describe("sendWebhook", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns true on 204", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    expect(await sendWebhook("https://discord.com/api/webhooks/test", { embeds: [] })).toBe(true);
  });

  it("returns false on 429", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 429 }));
    expect(await sendWebhook("https://discord.com/api/webhooks/test", { embeds: [] })).toBe(false);
  });

  it("returns false on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    expect(await sendWebhook("https://discord.com/api/webhooks/test", { embeds: [] })).toBe(false);
  });
});

// --- loadPreviousSites (R2 mock) ---------------------------------------------

function mockR2Bucket(data: Record<string, any>): R2Bucket {
  return {
    get: vi.fn(async (key: string) => {
      if (key in data) {
        return { json: async () => data[key] } as any;
      }
      return null;
    }),
  } as any;
}

describe("loadPreviousSites", () => {
  it("finds the most recent prior sites snapshot", async () => {
    const raw = mockR2Bucket({
      "sites/2026-06-25/usfs/middle-fork.json": {
        sites: { "81835": { label: "24", loop: null, type: null, use: null, by_date: { "2026-07-04": "reserved" } } },
      },
    });
    const prev = await loadPreviousSites(raw, "usfs/middle-fork", "2026-06-27");
    expect(prev).toBeDefined();
    expect(prev!["81835"].by_date["2026-07-04"]).toBe("reserved");
    expect(raw.get).toHaveBeenCalledWith("sites/2026-06-26/usfs/middle-fork.json");
    expect(raw.get).toHaveBeenCalledWith("sites/2026-06-25/usfs/middle-fork.json");
  });

  it("returns null when no prior snapshot exists", async () => {
    const raw = mockR2Bucket({});
    expect(await loadPreviousSites(raw, "usfs/middle-fork", "2026-06-27")).toBeNull();
  });
});

// --- notifySubscriptionMatches (integration) ---------------------------------

function mockKVNamespace(data: Record<string, any>): KVNamespace {
  return {
    list: vi.fn(async ({ prefix }: { prefix: string }) => ({
      keys: Object.keys(data)
        .filter((k) => k.startsWith(prefix))
        .map((k) => ({ name: k })),
    })),
    get: vi.fn(async (key: string, opts?: any) => {
      if (!(key in data)) return null;
      if (opts?.type === "json") return data[key];
      return JSON.stringify(data[key]);
    }),
    put: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  } as any;
}

describe("notifySubscriptionMatches", () => {
  beforeEach(() => vi.restoreAllMocks());

  const site: SiteInfo = {
    id: "usfs/middle-fork",
    name: "Middle Fork",
    agency: "usfs",
    kind: "rec",
  };

  it("skips when DISCORD_WEBHOOK_URL is not set", async () => {
    const env = { RAW: mockR2Bucket({}), CAMPSITES: mockKVNamespace({}), DISCORD_WEBHOOK_URL: undefined };
    const result = await notifySubscriptionMatches(env as any, site, "2026-06-27");
    expect(result).toEqual({ notified: 0, matches: 0 });
  });

  it("skips when no subscriptions exist", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const kv = mockKVNamespace({});
    const env = { RAW: mockR2Bucket({}), CAMPSITES: kv, DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/test" };
    const result = await notifySubscriptionMatches(env as any, site, "2026-06-27");
    expect(result).toEqual({ notified: 0, matches: 0 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("notifies when a subscription matches", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    const sub: Subscription = {
      id: "test-sub",
      campgroundId: "usfs/middle-fork",
      siteLabel: "24",
      weekdays: [0, 6],
      createdAt: "2026-06-27T00:00:00Z",
    };

    const kv = mockKVNamespace({ "sub:test-sub": sub });
    const raw = mockR2Bucket({
      "sites/2026-06-27/usfs/middle-fork.json": {
        sites: {
          "81835": {
            label: "24",
            loop: "Riverbend",
            type: "STANDARD NONELECTRIC",
            use: "Overnight",
            by_date: { "2026-07-04": "available", "2026-07-05": "available" },
          },
        },
      },
      "sites/2026-06-26/usfs/middle-fork.json": {
        sites: {
          "81835": {
            label: "24",
            loop: "Riverbend",
            type: "STANDARD NONELECTRIC",
            use: "Overnight",
            by_date: { "2026-07-04": "reserved", "2026-07-05": "reserved" },
          },
        },
      },
    });

    const env = { RAW: raw, CAMPSITES: kv, DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/test" };
    const result = await notifySubscriptionMatches(env as any, site, "2026-06-27");
    expect(result.notified).toBe(1);
    expect(result.matches).toBe(2);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it("does not notify when subscription site label doesn't match", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    const sub: Subscription = {
      id: "wrong-site",
      campgroundId: "usfs/middle-fork",
      siteLabel: "99",
      createdAt: "2026-06-27T00:00:00Z",
    };

    const kv = mockKVNamespace({ "sub:wrong-site": sub });
    const raw = mockR2Bucket({
      "sites/2026-06-27/usfs/middle-fork.json": {
        sites: {
          "81835": { label: "24", loop: null, type: null, use: null, by_date: { "2026-07-04": "available" } },
        },
      },
    });

    const env = { RAW: raw, CAMPSITES: kv, DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/test" };
    const result = await notifySubscriptionMatches(env as any, site, "2026-06-27");
    expect(result).toEqual({ notified: 0, matches: 0 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

// --- computeFillRate ---------------------------------------------------------

describe("computeFillRate", () => {
  it("returns 1.0 when all future dates are full", () => {
    const byDate = {
      "2026-07-01": { available: 0, reserved: 50, total: 50 },
      "2026-07-02": { available: 0, reserved: 50, total: 50 },
      "2026-07-03": { available: 0, reserved: 50, total: 50 },
    };
    expect(computeFillRate(byDate, "2026-07-01")).toBe(1.0);
  });

  it("returns 0 when all future dates have availability", () => {
    const byDate = {
      "2026-07-01": { available: 10, reserved: 40, total: 50 },
      "2026-07-02": { available: 5, reserved: 45, total: 50 },
    };
    expect(computeFillRate(byDate, "2026-07-01")).toBe(0);
  });

  it("excludes past dates", () => {
    const byDate = {
      "2026-06-25": { available: 0, reserved: 50, total: 50 }, // past
      "2026-07-01": { available: 10, reserved: 40, total: 50 },
    };
    expect(computeFillRate(byDate, "2026-07-01")).toBe(0);
  });

  it("computes the correct ratio", () => {
    const byDate = {
      "2026-07-01": { available: 0, reserved: 50, total: 50 },
      "2026-07-02": { available: 0, reserved: 50, total: 50 },
      "2026-07-03": { available: 0, reserved: 50, total: 50 },
      "2026-07-04": { available: 0, reserved: 50, total: 50 },
      "2026-07-05": { available: 0, reserved: 50, total: 50 },
      "2026-07-06": { available: 0, reserved: 50, total: 50 },
      "2026-07-07": { available: 0, reserved: 50, total: 50 },
      "2026-07-08": { available: 0, reserved: 50, total: 50 },
      "2026-07-09": { available: 0, reserved: 50, total: 50 },
      "2026-07-10": { available: 5, reserved: 45, total: 50 },
    };
    expect(computeFillRate(byDate, "2026-07-01")).toBe(0.9);
  });

  it("returns 0 for empty byDate", () => {
    expect(computeFillRate({}, "2026-07-01")).toBe(0);
  });
});

// --- buildHotEmbed -----------------------------------------------------------

describe("buildHotEmbed", () => {
  const site: SiteInfo = {
    id: "247592",
    name: "Hoh Rain Forest",
    agency: "nps",
    kind: "rec",
    ref: 247592,
  };

  it("builds an orange-red embed with fill rate", () => {
    const matches = [
      { siteId: "s1", label: "A1", date: "2026-07-04", status: "available" as const },
    ];
    const embed = buildHotEmbed(site, 0.95, matches);
    expect(embed.color).toBe(0xff4500);
    expect(embed.title).toContain("🔥");
    expect(embed.title).toContain("Hoh Rain Forest");
    expect(embed.description).toContain("95%");
    const fillField = embed.fields.find((f) => f.name === "Fill Rate");
    expect(fillField).toBeDefined();
    expect(fillField!.value).toBe("95%");
  });
});

// --- notifyHotCampground (integration) ---------------------------------------

describe("notifyHotCampground", () => {
  beforeEach(() => vi.restoreAllMocks());

  const site: SiteInfo = {
    id: "247592",
    name: "Hoh Rain Forest",
    agency: "nps",
    kind: "rec",
    ref: 247592,
  };

  it("skips when fill rate is below threshold", async () => {
    const byDate: Record<string, any> = {};
    for (let i = 1; i <= 10; i++) {
      byDate[`2026-07-${String(i).padStart(2, "0")}`] = { available: 5, reserved: 45, total: 50 };
    }
    const raw = mockR2Bucket({
      "summary/2026-06-28/247592.json": { by_date: byDate },
    });
    const kv = mockKVNamespace({});
    const env = { RAW: raw, CAMPSITES: kv, DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/test" };
    const result = await notifyHotCampground(env as any, site, "2026-06-28");
    expect(result.hot).toBe(false);
    expect(result.notified).toBe(false);
  });

  it("notifies when fill rate exceeds threshold and availability opens", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    // 9 fully booked + 1 open = 90% fill rate
    const byDate: Record<string, any> = {};
    for (let i = 1; i <= 9; i++) {
      byDate[`2026-07-${String(i).padStart(2, "0")}`] = { available: 0, reserved: 50, total: 50 };
    }
    byDate["2026-07-10"] = { available: 2, reserved: 48, total: 50 };

    const raw = mockR2Bucket({
      "summary/2026-06-28/247592.json": { by_date: byDate },
      "sites/2026-06-28/247592.json": {
        sites: {
          s1: { label: "A1", loop: null, type: null, use: null, by_date: { "2026-07-10": "available" } },
        },
      },
      "sites/2026-06-27/247592.json": {
        sites: {
          s1: { label: "A1", loop: null, type: null, use: null, by_date: { "2026-07-10": "reserved" } },
        },
      },
    });

    const kv = mockKVNamespace({});
    const env = { RAW: raw, CAMPSITES: kv, DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/test" };
    const result = await notifyHotCampground(env as any, site, "2026-06-28");
    expect(result.hot).toBe(true);
    expect(result.notified).toBe(true);
    expect(result.fillRate).toBe(0.9);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it("does not notify when hot but no new availability", async () => {
    const byDate: Record<string, any> = {};
    for (let i = 1; i <= 10; i++) {
      byDate[`2026-07-${String(i).padStart(2, "0")}`] = { available: 0, reserved: 50, total: 50 };
    }

    const raw = mockR2Bucket({
      "summary/2026-06-28/247592.json": { by_date: byDate },
      "sites/2026-06-28/247592.json": {
        sites: {
          s1: { label: "A1", loop: null, type: null, use: null, by_date: { "2026-07-01": "reserved" } },
        },
      },
      "sites/2026-06-27/247592.json": {
        sites: {
          s1: { label: "A1", loop: null, type: null, use: null, by_date: { "2026-07-01": "reserved" } },
        },
      },
    });

    const kv = mockKVNamespace({});
    const env = { RAW: raw, CAMPSITES: kv, DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/test" };
    const result = await notifyHotCampground(env as any, site, "2026-06-28");
    expect(result.hot).toBe(true);
    expect(result.notified).toBe(false);
  });

  it("alerts on first collection (no previous snapshot)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    const byDate: Record<string, any> = {};
    for (let i = 1; i <= 10; i++) {
      byDate[`2026-07-${String(i).padStart(2, "0")}`] = { available: 0, reserved: 50, total: 50 };
    }
    byDate["2026-07-10"] = { available: 1, reserved: 49, total: 50 };

    const raw = mockR2Bucket({
      "summary/2026-06-28/247592.json": { by_date: byDate },
      "sites/2026-06-28/247592.json": {
        sites: {
          s1: { label: "A1", loop: null, type: null, use: null, by_date: { "2026-07-10": "available" } },
        },
      },
    });

    const kv = mockKVNamespace({});
    const env = { RAW: raw, CAMPSITES: kv, DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/test" };
    const result = await notifyHotCampground(env as any, site, "2026-06-28");
    expect(result.hot).toBe(true);
    expect(result.notified).toBe(true);
  });

  it("respects custom threshold via HOT_FILL_THRESHOLD", async () => {
    const byDate: Record<string, any> = {};
    for (let i = 1; i <= 10; i++) {
      byDate[`2026-07-${String(i).padStart(2, "0")}`] = { available: 0, reserved: 50, total: 50 };
    }
    byDate["2026-07-10"] = { available: 2, reserved: 48, total: 50 };
    // 90% fill — below 0.95 threshold
    const raw = mockR2Bucket({
      "summary/2026-06-28/247592.json": { by_date: byDate },
    });
    const kv = mockKVNamespace({});
    const env = { RAW: raw, CAMPSITES: kv, DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/test", HOT_FILL_THRESHOLD: "0.95" };
    const result = await notifyHotCampground(env as any, site, "2026-06-28");
    expect(result.hot).toBe(false);
  });
});

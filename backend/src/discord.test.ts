import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectChanges,
  buildEmbed,
  sendWebhook,
  notifyAvailabilityChanges,
  loadPreviousSummary,
  type AvailabilityChange,
  type SiteInfo,
} from "./discord";
import type { ByDate } from "./availability";

// --- detectChanges -----------------------------------------------------------

describe("detectChanges", () => {
  const today = "2026-06-27";

  it("returns empty when current has no availability", () => {
    const prev: ByDate = { "2026-06-28": { available: 0, reserved: 10, total: 10 } };
    const curr: ByDate = { "2026-06-28": { available: 0, reserved: 10, total: 10 } };
    expect(detectChanges(prev, curr, today)).toEqual([]);
  });

  it("detects 0 → >0 transition", () => {
    const prev: ByDate = { "2026-06-28": { available: 0, reserved: 10, total: 10 } };
    const curr: ByDate = { "2026-06-28": { available: 3, reserved: 7, total: 10 } };
    const changes = detectChanges(prev, curr, today);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      date: "2026-06-28",
      previousAvailable: 0,
      currentAvailable: 3,
      total: 10,
    });
  });

  it("detects newly appeared date (absent in prev)", () => {
    const prev: ByDate = {};
    const curr: ByDate = { "2026-07-04": { available: 5, reserved: 15, total: 20 } };
    const changes = detectChanges(prev, curr, today);
    expect(changes).toHaveLength(1);
    expect(changes[0].previousAvailable).toBe(0);
    expect(changes[0].currentAvailable).toBe(5);
  });

  it("handles null prev (first collection)", () => {
    const curr: ByDate = { "2026-07-04": { available: 2, reserved: 8, total: 10 } };
    const changes = detectChanges(null, curr, today);
    expect(changes).toHaveLength(1);
  });

  it("ignores dates before today", () => {
    const curr: ByDate = { "2026-06-20": { available: 5, reserved: 5, total: 10 } };
    expect(detectChanges(null, curr, today)).toEqual([]);
  });

  it("ignores dates that were already available", () => {
    const prev: ByDate = { "2026-06-28": { available: 3, reserved: 7, total: 10 } };
    const curr: ByDate = { "2026-06-28": { available: 5, reserved: 5, total: 10 } };
    // Was already >0, so this is NOT a new appearance.
    expect(detectChanges(prev, curr, today)).toEqual([]);
  });

  it("does NOT alert on availability loss (>0 → 0)", () => {
    // Sites filling up is the opposite of what we notify on — silence, not noise.
    const prev: ByDate = { "2026-06-28": { available: 4, reserved: 6, total: 10 } };
    const curr: ByDate = { "2026-06-28": { available: 0, reserved: 10, total: 10 } };
    expect(detectChanges(prev, curr, today)).toEqual([]);
  });

  it("does NOT alert on a decrease that stays available (5 → 2)", () => {
    // Still bookable, but it never went 0 → >0, so it's not a fresh opening.
    const prev: ByDate = { "2026-06-28": { available: 5, reserved: 5, total: 10 } };
    const curr: ByDate = { "2026-06-28": { available: 2, reserved: 8, total: 10 } };
    expect(detectChanges(prev, curr, today)).toEqual([]);
  });

  it("returns multiple changes sorted by date", () => {
    const prev: ByDate = {
      "2026-07-10": { available: 0, reserved: 10, total: 10 },
      "2026-07-05": { available: 0, reserved: 10, total: 10 },
    };
    const curr: ByDate = {
      "2026-07-10": { available: 2, reserved: 8, total: 10 },
      "2026-07-05": { available: 1, reserved: 9, total: 10 },
    };
    const changes = detectChanges(prev, curr, today);
    expect(changes).toHaveLength(2);
    expect(changes[0].date).toBe("2026-07-05");
    expect(changes[1].date).toBe("2026-07-10");
  });
});

// --- buildEmbed --------------------------------------------------------------

describe("buildEmbed", () => {
  const site: SiteInfo = {
    id: "usfs/middle-fork",
    name: "Middle Fork",
    agency: "usfs",
    kind: "rec",
    lat: 47.55,
    lng: -121.53,
  };

  it("builds a green embed with campsite info", () => {
    const changes: AvailabilityChange[] = [
      { date: "2026-07-04", previousAvailable: 0, currentAvailable: 3, total: 20 },
    ];
    const embed = buildEmbed(site, changes);
    expect(embed.color).toBe(0x2ecc71);
    expect(embed.title).toContain("Middle Fork");
    expect(embed.title).toContain("Available");
    expect(embed.fields.find((f) => f.name === "Park / Agency")?.value).toBe("US Forest Service");
  });

  it("includes a book-now link for rec.gov sites", () => {
    const changes: AvailabilityChange[] = [
      { date: "2026-07-04", previousAvailable: 0, currentAvailable: 1, total: 10 },
    ];
    const embed = buildEmbed(site, changes);
    const bookField = embed.fields.find((f) => f.name === "Book Now");
    expect(bookField).toBeDefined();
    expect(bookField!.value).toContain("recreation.gov");
  });

  it("uses the numeric provider ref (not the slug) in the rec.gov link", () => {
    // rec.gov campground URLs are keyed by the numeric id; the slug would 404.
    const refSite: SiteInfo = { ...site, ref: 233864 };
    const changes: AvailabilityChange[] = [
      { date: "2026-07-04", previousAvailable: 0, currentAvailable: 1, total: 10 },
    ];
    const embed = buildEmbed(refSite, changes);
    const bookField = embed.fields.find((f) => f.name === "Book Now");
    expect(bookField!.value).toContain("/campgrounds/233864");
    expect(bookField!.value).not.toContain("usfs/middle-fork");
  });

  it("prefers an explicit reservation_url when provided", () => {
    const urlSite: SiteInfo = { ...site, reservation_url: "https://example.org/book/here" };
    const changes: AvailabilityChange[] = [
      { date: "2026-07-04", previousAvailable: 0, currentAvailable: 1, total: 10 },
    ];
    const embed = buildEmbed(urlSite, changes);
    const bookField = embed.fields.find((f) => f.name === "Book Now");
    expect(bookField!.value).toContain("https://example.org/book/here");
  });

  it("handles WA state parks", () => {
    const waSite: SiteInfo = { id: "wa/deception-pass", name: "Deception Pass", agency: "wa", kind: "wa" };
    const changes: AvailabilityChange[] = [
      { date: "2026-08-01", previousAvailable: 0, currentAvailable: 5, total: 30 },
    ];
    const embed = buildEmbed(waSite, changes);
    expect(embed.fields.find((f) => f.name === "Park / Agency")?.value).toBe("Washington State Parks");
  });

  it("caps date lines at 15 with overflow indicator", () => {
    const changes: AvailabilityChange[] = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      previousAvailable: 0,
      currentAvailable: 1,
      total: 10,
    }));
    const embed = buildEmbed(site, changes);
    const availField = embed.fields.find((f) => f.name === "Availability");
    expect(availField!.value).toContain("…and 5 more dates");
  });

  it("pluralizes correctly for single change", () => {
    const changes: AvailabilityChange[] = [
      { date: "2026-07-04", previousAvailable: 0, currentAvailable: 1, total: 10 },
    ];
    const embed = buildEmbed(site, changes);
    // The number is bold-wrapped (**1**), so check for the singular noun form.
    expect(embed.description).toContain("campsite-night ");
    expect(embed.description).not.toContain("campsite-nights");
  });
});

// --- sendWebhook -------------------------------------------------------------

describe("sendWebhook", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns true on 204", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const ok = await sendWebhook("https://discord.com/api/webhooks/test", { embeds: [] });
    expect(ok).toBe(true);
  });

  it("returns false on 429 (rate limit)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 429 }));
    const ok = await sendWebhook("https://discord.com/api/webhooks/test", { embeds: [] });
    expect(ok).toBe(false);
  });

  it("returns false on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const ok = await sendWebhook("https://discord.com/api/webhooks/test", { embeds: [] });
    expect(ok).toBe(false);
  });
});

// --- loadPreviousSummary (R2 mock) -------------------------------------------

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

describe("loadPreviousSummary", () => {
  it("finds the most recent prior snapshot", async () => {
    const raw = mockR2Bucket({
      "summary/2026-06-25/usfs/middle-fork.json": {
        by_date: { "2026-07-04": { available: 0, reserved: 10, total: 10 } },
      },
    });
    const prev = await loadPreviousSummary(raw, "usfs/middle-fork", "2026-06-27");
    expect(prev).toEqual({ "2026-07-04": { available: 0, reserved: 10, total: 10 } });
    // Should have tried 2026-06-26 first, then 2026-06-25.
    expect(raw.get).toHaveBeenCalledWith("summary/2026-06-26/usfs/middle-fork.json");
    expect(raw.get).toHaveBeenCalledWith("summary/2026-06-25/usfs/middle-fork.json");
  });

  it("returns null when no prior snapshot exists", async () => {
    const raw = mockR2Bucket({});
    const prev = await loadPreviousSummary(raw, "usfs/middle-fork", "2026-06-27");
    expect(prev).toBeNull();
  });
});

// --- notifyAvailabilityChanges (integration) ---------------------------------

describe("notifyAvailabilityChanges", () => {
  beforeEach(() => vi.restoreAllMocks());

  const site: SiteInfo = {
    id: "usfs/middle-fork",
    name: "Middle Fork",
    agency: "usfs",
    kind: "rec",
  };

  it("skips when DISCORD_WEBHOOK_URL is not set", async () => {
    const env = { RAW: mockR2Bucket({}), DISCORD_WEBHOOK_URL: undefined };
    const result = await notifyAvailabilityChanges(env as any, site, "2026-06-27");
    expect(result).toEqual({ notified: false, changes: 0 });
  });

  it("notifies on availability change", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    const raw = mockR2Bucket({
      // Previous day: fully booked
      "summary/2026-06-26/usfs/middle-fork.json": {
        by_date: { "2026-07-04": { available: 0, reserved: 20, total: 20 } },
      },
      // Current day: 3 opened up
      "summary/2026-06-27/usfs/middle-fork.json": {
        by_date: { "2026-07-04": { available: 3, reserved: 17, total: 20 } },
      },
    });
    const env = { RAW: raw, DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/test" };
    const result = await notifyAvailabilityChanges(env as any, site, "2026-06-27");
    expect(result).toEqual({ notified: true, changes: 1 });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it("skips when no changes detected", async () => {
    // Install a spy so the not-called assertion has a real spy to inspect (and so a
    // stray fetch can't escape to the network).
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const raw = mockR2Bucket({
      "summary/2026-06-26/usfs/middle-fork.json": {
        by_date: { "2026-07-04": { available: 3, reserved: 17, total: 20 } },
      },
      "summary/2026-06-27/usfs/middle-fork.json": {
        by_date: { "2026-07-04": { available: 3, reserved: 17, total: 20 } },
      },
    });
    const env = { RAW: raw, DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/test" };
    const result = await notifyAvailabilityChanges(env as any, site, "2026-06-27");
    expect(result).toEqual({ notified: false, changes: 0 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

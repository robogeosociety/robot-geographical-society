import { describe, it, expect } from "vitest";
import { dateMatches, siteMatches, matchSubscriptions, type Subscription } from "./subscriptions";
import type { BySite } from "./availability";

// --- dateMatches -------------------------------------------------------------

describe("dateMatches", () => {
  const baseSub: Subscription = {
    id: "1",
    campgroundId: "usfs/middle-fork",
    createdAt: "2026-06-27T00:00:00Z",
  };

  it("matches any date when no filters set", () => {
    expect(dateMatches(baseSub, "2026-07-04")).toBe(true);
    expect(dateMatches(baseSub, "2026-12-25")).toBe(true);
  });

  it("matches specific dates", () => {
    const sub = { ...baseSub, dates: ["2026-07-04", "2026-07-05"] };
    expect(dateMatches(sub, "2026-07-04")).toBe(true);
    expect(dateMatches(sub, "2026-07-06")).toBe(false);
  });

  it("matches weekdays (0=Sun, 6=Sat)", () => {
    const sub = { ...baseSub, weekdays: [0, 6] }; // weekends
    // 2026-07-04 is a Saturday (6)
    expect(dateMatches(sub, "2026-07-04")).toBe(true);
    // 2026-07-05 is a Sunday (0)
    expect(dateMatches(sub, "2026-07-05")).toBe(true);
    // 2026-07-06 is a Monday (1)
    expect(dateMatches(sub, "2026-07-06")).toBe(false);
  });

  it("OR logic: matches if either dates or weekdays match", () => {
    const sub = { ...baseSub, dates: ["2026-07-04"], weekdays: [1] }; // July 4 OR Mondays
    expect(dateMatches(sub, "2026-07-04")).toBe(true); // specific date
    expect(dateMatches(sub, "2026-07-06")).toBe(true); // Monday
    expect(dateMatches(sub, "2026-07-08")).toBe(false); // Wednesday, not in dates
  });
});

// --- siteMatches -------------------------------------------------------------

describe("siteMatches", () => {
  const baseSub: Subscription = {
    id: "1",
    campgroundId: "usfs/middle-fork",
    createdAt: "2026-06-27T00:00:00Z",
  };

  it("matches any site when no siteLabel filter", () => {
    expect(siteMatches(baseSub, "24")).toBe(true);
    expect(siteMatches(baseSub, null)).toBe(true);
  });

  it("matches specific site label (case-insensitive)", () => {
    const sub = { ...baseSub, siteLabel: "24" };
    expect(siteMatches(sub, "24")).toBe(true);
    expect(siteMatches(sub, "25")).toBe(false);
    expect(siteMatches(sub, null)).toBe(false);
  });

  it("matches case-insensitively (WA labels like A012)", () => {
    const sub = { ...baseSub, siteLabel: "a012" };
    expect(siteMatches(sub, "A012")).toBe(true);
  });
});

// --- matchSubscriptions ------------------------------------------------------

describe("matchSubscriptions", () => {
  const today = "2026-06-27";

  const currentSites: BySite = {
    "81835": {
      label: "24",
      loop: "Riverbend",
      type: "STANDARD NONELECTRIC",
      use: "Overnight",
      by_date: {
        "2026-07-04": "available",
        "2026-07-05": "available",
        "2026-07-06": "reserved",
      },
    },
    "81836": {
      label: "25",
      loop: "Riverbend",
      type: "STANDARD NONELECTRIC",
      use: "Overnight",
      by_date: {
        "2026-07-04": "available",
        "2026-07-05": "reserved",
      },
    },
  };

  const previousSites: BySite = {
    "81835": {
      label: "24",
      loop: "Riverbend",
      type: "STANDARD NONELECTRIC",
      use: "Overnight",
      by_date: {
        "2026-07-04": "reserved",
        "2026-07-05": "reserved",
        "2026-07-06": "reserved",
      },
    },
    "81836": {
      label: "25",
      loop: "Riverbend",
      type: "STANDARD NONELECTRIC",
      use: "Overnight",
      by_date: {
        "2026-07-04": "reserved",
        "2026-07-05": "reserved",
      },
    },
  };

  it("matches subscription for specific site on weekends", () => {
    const sub: Subscription = {
      id: "1",
      campgroundId: "usfs/middle-fork",
      siteLabel: "24",
      weekdays: [0, 6], // weekends
      createdAt: "2026-06-27T00:00:00Z",
    };
    const result = matchSubscriptions("usfs/middle-fork", currentSites, previousSites, [sub], today);
    expect(result.size).toBe(1);
    const matches = result.get(sub)!;
    // Site 24 became available on July 4 (Sat) and July 5 (Sun) — both weekends.
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({ siteId: "81835", label: "24", date: "2026-07-04" });
    expect(matches[1]).toMatchObject({ siteId: "81835", label: "24", date: "2026-07-05" });
  });

  it("matches subscription for any site on a specific date", () => {
    const sub: Subscription = {
      id: "2",
      campgroundId: "usfs/middle-fork",
      dates: ["2026-07-04"],
      createdAt: "2026-06-27T00:00:00Z",
    };
    const result = matchSubscriptions("usfs/middle-fork", currentSites, previousSites, [sub], today);
    const matches = result.get(sub)!;
    // Both site 24 and 25 became available on July 4.
    expect(matches).toHaveLength(2);
  });

  it("ignores campgrounds that don't match", () => {
    const sub: Subscription = {
      id: "3",
      campgroundId: "wa/deception-pass",
      createdAt: "2026-06-27T00:00:00Z",
    };
    const result = matchSubscriptions("usfs/middle-fork", currentSites, previousSites, [sub], today);
    expect(result.size).toBe(0);
  });

  it("ignores sites that were already available", () => {
    const prevWithAvail: BySite = {
      "81835": {
        ...currentSites["81835"],
        by_date: { "2026-07-04": "available", "2026-07-05": "reserved", "2026-07-06": "reserved" },
      },
      "81836": previousSites["81836"],
    };
    const sub: Subscription = {
      id: "4",
      campgroundId: "usfs/middle-fork",
      siteLabel: "24",
      dates: ["2026-07-04"],
      createdAt: "2026-06-27T00:00:00Z",
    };
    const result = matchSubscriptions("usfs/middle-fork", currentSites, prevWithAvail, [sub], today);
    // Site 24 on July 4 was already available — no change.
    expect(result.size).toBe(0);
  });

  it("ignores past dates", () => {
    const sub: Subscription = {
      id: "5",
      campgroundId: "usfs/middle-fork",
      createdAt: "2026-06-27T00:00:00Z",
    };
    const pastSites: BySite = {
      "81835": {
        label: "24",
        loop: null,
        type: null,
        use: null,
        by_date: { "2026-06-20": "available" },
      },
    };
    const result = matchSubscriptions("usfs/middle-fork", pastSites, null, [sub], today);
    expect(result.size).toBe(0);
  });

  it("handles null previous (first collection)", () => {
    const sub: Subscription = {
      id: "6",
      campgroundId: "usfs/middle-fork",
      siteLabel: "24",
      createdAt: "2026-06-27T00:00:00Z",
    };
    const result = matchSubscriptions("usfs/middle-fork", currentSites, null, [sub], today);
    const matches = result.get(sub)!;
    expect(matches).toHaveLength(2); // July 4 and 5
  });
});

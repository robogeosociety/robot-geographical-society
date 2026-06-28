import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleInteraction, COMMANDS, type InteractionsEnv } from "./discord-interactions";

// We can't easily mock Ed25519 verification in Vitest without a real key pair,
// so we test the command handlers by bypassing signature verification. The
// handleInteraction function is tested at the integration level via the Hono
// app tests; here we focus on the exported COMMANDS schema and autocomplete.

describe("COMMANDS schema", () => {
  it("defines subscribe, subscriptions, unsubscribe", () => {
    const names = COMMANDS.map((c) => c.name);
    expect(names).toEqual(["subscribe", "subscriptions", "unsubscribe"]);
  });

  it("subscribe has campground (required, autocomplete), site, when, note options", () => {
    const cmd = COMMANDS.find((c) => c.name === "subscribe")!;
    expect(cmd.options).toHaveLength(4);
    const campground = cmd.options!.find((o: any) => o.name === "campground")!;
    expect(campground.required).toBe(true);
    expect(campground.autocomplete).toBe(true);
  });

  it("unsubscribe has id (required) option", () => {
    const cmd = COMMANDS.find((c) => c.name === "unsubscribe")!;
    expect(cmd.options).toHaveLength(1);
    expect(cmd.options![0].name).toBe("id");
    expect(cmd.options![0].required).toBe(true);
  });
});

// Test handleInteraction with signature verification disabled by passing
// an empty public key (should return 500, which is the correct behavior).
describe("handleInteraction", () => {
  function mockKV(data: Record<string, any> = {}): KVNamespace {
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

  it("returns 500 when DISCORD_APP_PUBLIC_KEY is not set", async () => {
    const env: InteractionsEnv = { CAMPSITES: mockKV() };
    const req = new Request("https://example.com/discord/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: 1 }),
    });
    const res = await handleInteraction(req, env);
    expect(res.status).toBe(500);
  });

  it("returns 401 when signature headers are missing", async () => {
    const env: InteractionsEnv = {
      CAMPSITES: mockKV(),
      DISCORD_APP_PUBLIC_KEY: "abcd1234",
    };
    const req = new Request("https://example.com/discord/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: 1 }),
    });
    const res = await handleInteraction(req, env);
    expect(res.status).toBe(401);
  });
});

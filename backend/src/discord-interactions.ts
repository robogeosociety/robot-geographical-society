/**
 * Discord slash command interactions endpoint.
 *
 * Handles /subscribe, /subscriptions, /unsubscribe via Discord's HTTP
 * interactions API (no gateway/WebSocket needed — Cloudflare Worker receives
 * POSTs directly from Discord).
 *
 * Requires DISCORD_APP_PUBLIC_KEY env var for signature verification.
 */

import campsites from "./campsites-index.json";
import {
  listSubscriptions,
  getSubscription,
  putSubscription,
  deleteSubscription,
  type Subscription,
} from "./subscriptions";

// --- Discord interaction types -----------------------------------------------

const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  AUTOCOMPLETE: 4,
} as const;

const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE: 4,
  AUTOCOMPLETE_RESULT: 8,
} as const;

type InteractionOption = {
  name: string;
  type: number;
  value?: string | number;
  focused?: boolean;
};

type Interaction = {
  type: number;
  data?: {
    name: string;
    options?: InteractionOption[];
  };
};

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// --- Ed25519 signature verification ------------------------------------------

async function verifySignature(
  publicKeyHex: string,
  signature: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKeyHex),
      { name: "Ed25519", namedCurve: "Ed25519" },
      false,
      ["verify"],
    );
    const message = new TextEncoder().encode(timestamp + body);
    return crypto.subtle.verify("Ed25519", key, hexToBytes(signature), message);
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// --- Autocomplete: campground search -----------------------------------------

const collectible = (campsites as any[]).filter((c) => c.collect !== false);

function autocompleteCampground(query: string): { name: string; value: string }[] {
  const q = query.toLowerCase();
  return collectible
    .filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
    .slice(0, 25)
    .map((c) => ({ name: `${c.name} (${c.agency.toUpperCase()})`, value: c.id }));
}

// --- Command handlers --------------------------------------------------------

function getOption(opts: InteractionOption[] | undefined, name: string): string | undefined {
  return opts?.find((o) => o.name === name)?.value as string | undefined;
}

function parseWhen(when: string | undefined): { dates?: string[]; weekdays?: number[] } {
  if (!when) return {};
  const w = when.toLowerCase().trim();
  if (w === "weekends") return { weekdays: [0, 6] };
  if (w === "weekdays") return { weekdays: [1, 2, 3, 4, 5] };
  if (w === "fri-sun" || w === "friday-sunday") return { weekdays: [5, 6, 0] };
  if (w === "thu-sun" || w === "thursday-sunday") return { weekdays: [4, 5, 6, 0] };
  // Try parsing as a date (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) return { dates: [w] };
  // Comma-separated dates
  const parts = w.split(/[,\s]+/).filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p));
  if (parts.length) return { dates: parts };
  return {};
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatSubscription(sub: Subscription): string {
  const camp = collectible.find((c) => c.id === sub.campgroundId);
  const name = camp?.name ?? sub.campgroundId;
  let desc = `**${name}**`;
  if (sub.siteLabel) desc += ` · Site ${sub.siteLabel}`;
  if (sub.weekdays?.length) {
    desc += ` · ${sub.weekdays.map((d) => WEEKDAY_NAMES[d]).join("/")}`;
  }
  if (sub.dates?.length) {
    desc += ` · ${sub.dates.join(", ")}`;
  }
  if (sub.note) desc += ` · _${sub.note}_`;
  return desc;
}

async function handleSubscribe(
  kv: KVNamespace,
  opts: InteractionOption[] | undefined,
): Promise<Response> {
  const campgroundId = getOption(opts, "campground");
  if (!campgroundId) {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE,
      data: { content: "Missing campground.", flags: 64 },
    });
  }

  const known = collectible.find((c) => c.id === campgroundId);
  if (!known) {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE,
      data: { content: `Unknown campground: \`${campgroundId}\``, flags: 64 },
    });
  }

  const siteLabel = getOption(opts, "site") ?? null;
  const when = parseWhen(getOption(opts, "when"));
  const note = getOption(opts, "note") ?? undefined;

  const sub: Subscription = {
    id: crypto.randomUUID(),
    campgroundId,
    siteLabel,
    dates: when.dates,
    weekdays: when.weekdays,
    note,
    createdAt: new Date().toISOString(),
  };
  await putSubscription(kv, sub);

  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE,
    data: {
      content: `Subscribed! I'll notify you when availability opens up.\n${formatSubscription(sub)}\n\n_ID: \`${sub.id}\`_`,
      flags: 64,
    },
  });
}

async function handleSubscriptions(kv: KVNamespace): Promise<Response> {
  const subs = await listSubscriptions(kv);
  if (!subs.length) {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE,
      data: { content: "No active subscriptions. Use `/subscribe` to add one.", flags: 64 },
    });
  }

  const lines = subs.map((s, i) => `${i + 1}. ${formatSubscription(s)}\n   _ID: \`${s.id}\`_`);
  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE,
    data: {
      content: `**Active Subscriptions (${subs.length})**\n\n${lines.join("\n\n")}`,
      flags: 64,
    },
  });
}

async function handleUnsubscribe(
  kv: KVNamespace,
  opts: InteractionOption[] | undefined,
): Promise<Response> {
  const id = getOption(opts, "id");
  if (!id) {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE,
      data: { content: "Missing subscription ID.", flags: 64 },
    });
  }

  const existed = await deleteSubscription(kv, id);
  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE,
    data: {
      content: existed
        ? `Unsubscribed \`${id}\`.`
        : `Subscription \`${id}\` not found.`,
      flags: 64,
    },
  });
}

// --- Main handler ------------------------------------------------------------

export type InteractionsEnv = {
  CAMPSITES: KVNamespace;
  DISCORD_APP_PUBLIC_KEY?: string;
};

export async function handleInteraction(
  request: Request,
  env: InteractionsEnv,
): Promise<Response> {
  const publicKey = env.DISCORD_APP_PUBLIC_KEY;
  if (!publicKey) {
    return jsonResponse({ error: "DISCORD_APP_PUBLIC_KEY not configured" }, 500);
  }

  // Verify the request signature.
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  const body = await request.text();

  if (!signature || !timestamp) {
    return jsonResponse({ error: "Missing signature headers" }, 401);
  }

  const valid = await verifySignature(publicKey, signature, timestamp, body);
  if (!valid) {
    return jsonResponse({ error: "Invalid signature" }, 401);
  }

  const interaction: Interaction = JSON.parse(body);

  // Discord sends a PING on initial endpoint validation.
  if (interaction.type === InteractionType.PING) {
    return jsonResponse({ type: InteractionResponseType.PONG });
  }

  // Autocomplete for the campground option.
  if (interaction.type === InteractionType.AUTOCOMPLETE) {
    const focused = interaction.data?.options?.find((o) => o.focused);
    if (focused?.name === "campground") {
      const choices = autocompleteCampground(String(focused.value ?? ""));
      return jsonResponse({
        type: InteractionResponseType.AUTOCOMPLETE_RESULT,
        data: { choices },
      });
    }
    return jsonResponse({
      type: InteractionResponseType.AUTOCOMPLETE_RESULT,
      data: { choices: [] },
    });
  }

  // Slash commands.
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const name = interaction.data?.name;
    const opts = interaction.data?.options;

    switch (name) {
      case "subscribe":
        return handleSubscribe(env.CAMPSITES, opts);
      case "subscriptions":
        return handleSubscriptions(env.CAMPSITES);
      case "unsubscribe":
        return handleUnsubscribe(env.CAMPSITES, opts);
      default:
        return jsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE,
          data: { content: `Unknown command: ${name}`, flags: 64 },
        });
    }
  }

  return jsonResponse({ error: "Unknown interaction type" }, 400);
}

// --- Command registration definition -----------------------------------------
// Used by the register-commands script; also documents the exact command schema.

export const COMMANDS = [
  {
    name: "subscribe",
    description: "Subscribe to campsite availability alerts",
    options: [
      {
        name: "campground",
        description: "Campground to watch",
        type: 3, // STRING
        required: true,
        autocomplete: true,
      },
      {
        name: "site",
        description: "Specific site label (e.g. 24). Omit for any site.",
        type: 3,
        required: false,
      },
      {
        name: "when",
        description: "When: weekends, weekdays, fri-sun, or YYYY-MM-DD",
        type: 3,
        required: false,
      },
      {
        name: "note",
        description: "A note for this subscription (shown in alerts)",
        type: 3,
        required: false,
      },
    ],
  },
  {
    name: "subscriptions",
    description: "List your active campsite subscriptions",
  },
  {
    name: "unsubscribe",
    description: "Remove a campsite subscription",
    options: [
      {
        name: "id",
        description: "Subscription ID (from /subscriptions)",
        type: 3,
        required: true,
      },
    ],
  },
];

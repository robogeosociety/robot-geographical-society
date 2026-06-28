#!/usr/bin/env bash
# Register Discord slash commands for the campsite subscription bot.
#
# Usage:
#   DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... ./scripts/register-discord-commands.sh
#
# Run once after creating the Discord application, or whenever the command
# schema changes. Uses the global commands endpoint (takes up to 1 hour to
# propagate; for instant testing, use the guild endpoint variant below).

set -euo pipefail

: "${DISCORD_APP_ID:?Set DISCORD_APP_ID}"
: "${DISCORD_BOT_TOKEN:?Set DISCORD_BOT_TOKEN}"

# Guild-scoped (instant, for testing): uncomment and set GUILD_ID
# GUILD_ID="..."
# URL="https://discord.com/api/v10/applications/$DISCORD_APP_ID/guilds/$GUILD_ID/commands"
URL="https://discord.com/api/v10/applications/$DISCORD_APP_ID/commands"

COMMANDS='[
  {
    "name": "subscribe",
    "description": "Subscribe to campsite availability alerts",
    "options": [
      {
        "name": "campground",
        "description": "Campground to watch",
        "type": 3,
        "required": true,
        "autocomplete": true
      },
      {
        "name": "site",
        "description": "Specific site label (e.g. 24). Omit for any site.",
        "type": 3,
        "required": false
      },
      {
        "name": "when",
        "description": "When: weekends, weekdays, fri-sun, or YYYY-MM-DD",
        "type": 3,
        "required": false
      },
      {
        "name": "note",
        "description": "A note for this subscription (shown in alerts)",
        "type": 3,
        "required": false
      }
    ]
  },
  {
    "name": "subscriptions",
    "description": "List your active campsite subscriptions"
  },
  {
    "name": "unsubscribe",
    "description": "Remove a campsite subscription",
    "options": [
      {
        "name": "id",
        "description": "Subscription ID (from /subscriptions)",
        "type": 3,
        "required": true
      }
    ]
  }
]'

echo "Registering commands with Discord..."
curl -sS -X PUT "$URL" \
  -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$COMMANDS" | python3 -m json.tool

echo "Done. Global commands may take up to 1 hour to propagate."

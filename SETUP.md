# SignalDesk — go-live checklist

The **ops app is built**. Neon + Telnyx SMS keys are live. What’s left: **Smartlead** for cold email, keep a **public webhook URL**, and wait on **10DLC brand** approval (up to ~48h) before volume SMS.

## Already done in SignalDesk

- [x] Shared lead upload + groups + verify-on-import  
- [x] Entity portals (Abstract, Ahava, Take More, Venture, TYH)  
- [x] Entity-scoped campaigns + reports  
- [x] Autopilot Ferris-wheel (daily email/SMS quotas)  
- [x] Entity inbox + manual forward (“Email team”)  
- [x] Telnyx SMS provider (live when keyed, mock otherwise)  
- [x] Inbound webhooks: `/api/webhooks/telnyx`, `/api/webhooks/email` (Smartlead EMAIL_REPLY shape)  
- [x] Neon database connected  
- [x] Telnyx API key + from-number in env  

## Status snapshot (while waiting on 10DLC)

| Piece | Status |
|---|---|
| Neon | Live |
| Telnyx send (API + number) | Live — low-volume / test only until 10DLC Brand approved |
| Telnyx inbound webhook | Needs public HTTPS (tunnel or Vercel) → `/api/webhooks/telnyx` |
| Smartlead cold email | **Next — paste keys** (see below) |
| 10DLC Brand | Pending Telnyx (up to ~48h) — blocks scaled US SMS |
| CRM / n8n | Not required today |

## You set up (accounts) — do in this order

### 1. Telnyx (SMS) — mostly done; 10DLC pending

1. ~~API Key → `TELNYX_API_KEY`~~  
2. ~~Default number → `TELNYX_FROM_NUMBER`~~ (E.164)  
3. Assign a Telnyx number on each entity portal (Entities → portal → texting numbers)  
4. **Wait** for **10DLC Brand** approval, then finish Campaign registration for volume  
5. Messaging profile webhook (profile `SignalDesk SMS`):  
   `https://YOUR_PUBLIC_HOST/api/webhooks/telnyx`  
   (localhost will not receive carrier webhooks)

### 2. Smartlead (cold email) — do this now

Instantly still works if you prefer it (`INSTANTLY_*` takes precedence when set). For this project we document **Smartlead first**.

1. Create account: [app.smartlead.ai](https://app.smartlead.ai)  
2. Connect / warm **sending domains** (ideally one subdomain per entity)  
3. Create a campaign (start with one shared test campaign)  
4. Paste into `.env` (or Cursor Cloud Agent Secrets):

```bash
SMARTLEAD_API_KEY=...
SMARTLEAD_CAMPAIGN_ID=...          # numeric campaign id from Smartlead
# Optional later — maps webhook campaign_id → entity inbox:
# SMARTLEAD_CAMPAIGN_ABSTRACT=
# SMARTLEAD_CAMPAIGN_AHAVA=
# SMARTLEAD_CAMPAIGN_TAKEMORE=
# SMARTLEAD_CAMPAIGN_VENTURE=
# SMARTLEAD_CAMPAIGN_TYH=
```

5. In Smartlead → Webhooks (user or campaign level), create a webhook:  
   - URL: `https://YOUR_PUBLIC_HOST/api/webhooks/email`  
   - Enable at least **EMAIL_REPLY** (opens/sent are ignored safely)  
6. Restart the app → **Settings** / **Go live** should show cold email as `smartlead`, not `mock`

### 3. Public URL for webhooks

Webhooks need a public HTTPS URL.

**Option A — Cloudflare Tunnel (fast for local/dev):**

```bash
# App already on http://127.0.0.1:43123
cloudflared tunnel --url http://127.0.0.1:43123
# Copy the https://….trycloudflare.com URL
```

Then set:

```bash
PUBLIC_APP_URL=https://YOUR_TUNNEL_HOST
```

Point Telnyx messaging profile webhook to  
`${PUBLIC_APP_URL}/api/webhooks/telnyx`  
and Smartlead to  
`${PUBLIC_APP_URL}/api/webhooks/email`.

**Option B — Deploy to Vercel** (stable production URL). Add the same env vars in the Vercel project, then use that host for both webhooks.

Quick tunnels change URL when restarted — re-PATCH Telnyx and update Smartlead if the host changes.

### 4. CRM / n8n — not required today

Manual inbox handoff is enough. When ready: n8n on “interested / CRM queued” → HubSpot/GHL/etc.

## Secrets checklist

```bash
DATABASE_URL=...                 # done
TELNYX_API_KEY=...               # done
TELNYX_FROM_NUMBER=+1...         # done
PUBLIC_APP_URL=https://...       # set when tunnel/deploy is up
SMARTLEAD_API_KEY=...            # ← paste when you have it
SMARTLEAD_CAMPAIGN_ID=...        # ← paste when you have it
# N8N_WEBHOOK_URL=...            # later
```

After pasting keys, restart the app and check **Go live** (`/setup`) — Telnyx **live**, email **smartlead**.

## Smoke test once keyed

1. Upload 2–3 real test leads (your own phone/email)  
2. Launch a tiny SMS campaign (may be limited until 10DLC)  
3. Reply to the text → should appear in that entity’s Inbox  
4. Click **Good lead** → **Email team**  
5. Add yourself as a Smartlead lead → reply → Inbox via `/api/webhooks/email`

## Realistic outcome while Brand is pending

| Goal | Now |
|---|---|
| Run SignalDesk ops UI | Yes |
| Send test SMS via Telnyx | Yes (low volume; carriers may filter without 10DLC) |
| Receive SMS into Inbox | Yes, with public webhook URL |
| Full 20k/day × 5 entities | No — needs 10DLC + warmed domains |
| Cold email | Start Smartlead warmup today after keys |
| CRM auto-push | Skip — use manual Email team |

**Still needs you:** Smartlead API key + campaign ID.  
**Blocked on Telnyx:** 10DLC Brand approval (then Campaign).  
**Blocked on deploy choice:** Stable production URL (Vercel) vs temporary tunnel.

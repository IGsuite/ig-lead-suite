# SignalDesk — go-live checklist (today)

The **ops app is built**. What’s left is connecting real senders and pointing webhooks at a public URL.

## Already done in SignalDesk

- [x] Shared lead upload + groups + verify-on-import  
- [x] Entity portals (Abstract, Ahava, Take More, Venture, TYH)  
- [x] Entity-scoped campaigns + reports  
- [x] Autopilot Ferris-wheel (daily email/SMS quotas)  
- [x] Entity inbox + manual forward (“Email team”)  
- [x] Telnyx SMS provider (live when keyed, mock otherwise)  
- [x] Inbound webhooks: `/api/webhooks/telnyx`, `/api/webhooks/email`  
- [x] Neon database connected  

## You set up (accounts) — do in this order

### 1. Telnyx (SMS) — required for texts today

1. Create account: [telnyx.com](https://telnyx.com) → Mission Control  
2. **API Key** → copy into secrets as `TELNYX_API_KEY`  
3. Buy **one phone number per entity** (or start with one shared number for testing)  
4. Paste numbers into each entity portal in SignalDesk (Entities → portal → texting numbers)  
5. Set `TELNYX_FROM_NUMBER` to your default test number (E.164, e.g. `+15551234567`)  
6. Register **10DLC** (brand + campaign) for US A2P — required for volume  
7. Messaging profile → webhook URL:  
   `https://YOUR_PUBLIC_HOST/api/webhooks/telnyx`  
   (needs a deployed/public URL — localhost won’t receive carrier webhooks)

### 2. Instantly or Smartlead (cold email)

1. Pick **Instantly** or **Smartlead** (not SES/SendGrid for cold)  
2. Connect / warm **sending domains** (ideally one subdomain per entity)  
3. Create a campaign per entity in that tool  
4. API key → `INSTANTLY_API_KEY` or `SMARTLEAD_API_KEY`  
5. Campaign ID(s) → `INSTANTLY_CAMPAIGN_ID` (single test) or map later per entity  
6. Reply webhook → `https://YOUR_PUBLIC_HOST/api/webhooks/email`

### 3. Host the app publicly

Webhooks need a public HTTPS URL. Options:

- Deploy this repo to **Vercel** (or similar), **or**  
- Use a tunnel (ngrok/Cloudflare Tunnel) for today’s test only  

Add the same env vars there (and in Cursor Cloud Agent Secrets).

### 4. CRM / n8n — not required today

Manual inbox handoff is enough for now. When ready: n8n workflow on “interested / CRM queued” → HubSpot/GHL/etc.

## Secrets to paste (when you have them)

```bash
DATABASE_URL=...                 # already set
TELNYX_API_KEY=...
TELNYX_FROM_NUMBER=+1...
INSTANTLY_API_KEY=...            # or SMARTLEAD_API_KEY
INSTANTLY_CAMPAIGN_ID=...        # optional for first test
# N8N_WEBHOOK_URL=...            # later
```

After pasting keys, restart the app and check **Settings** — Telnyx should show **live**, not mock.

## Smoke test once keyed

1. Upload 2–3 real test leads (your own phone/email)  
2. Launch a tiny SMS campaign for Abstract  
3. Reply to the text → should appear in Abstract’s Inbox  
4. Click **Good lead** → **Email team**  
5. Repeat with a 1-recipient Instantly campaign when email is keyed  

## Realistic “today” outcome

| Goal | Realistic today |
|---|---|
| Run SignalDesk ops UI | Yes |
| Send test SMS via Telnyx | Yes, after account + key + number |
| Receive SMS into Inbox | Yes, after public webhook URL |
| Full 20k/day × 5 entities | No — needs 10DLC approval + warmed domains (days) |
| Cold email at scale | Start Instantly/Smartlead warmup today; volume later |
| CRM auto-push | Skip today — use manual Email team |

**Blockers only you can unblock:** Telnyx account, Instantly/Smartlead account, public deploy URL, API keys pasted into env/secrets.

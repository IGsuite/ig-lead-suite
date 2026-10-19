# IG Lead Suite — go-live checklist

The **ops app is built**. Neon + Telnyx SMS + Smartlead are keyed. What’s left: **register the Telnyx 10DLC Campaign** (Brand is already **OK**), keep a **public webhook URL**, and set auth secrets on Vercel project **`ig-lead-suite`** (login is **on by default** in production).

## Already done in IG Lead Suite

- [x] Shared lead upload + groups + verify-on-import (CSV **or Excel .xlsx/.xls**, up to **30k rows**/upload, chunked Neon inserts, flexible vendor headers, skip invalid contacts on import + send)  
  - Soft platform limit: some Vercel plans reject request bodies over ~**4.5 MB** — split large files if upload fails with a body/size error. `maxDuration` is set to 300s for Pro/Fluid.
- [x] Entity portals (Abstract, Ahava, Take More, Venture, TYH)  
- [x] Entity-scoped campaigns + reports + inbox (hard isolation)  
- [x] Campaign **send windows** (morning / afternoon / evening / custom)  
- [x] Reports **Send timing** (reply performance by time of day)  
- [x] Reports **Performance** scorecards + **best message** ranking + **Improve** view  

- [x] Autopilot Ferris-wheel (daily email/SMS quotas + send windows)  
- [x] Multi-user access (admin / member + `allowedEntityIds`)  
- [x] Telnyx SMS + Smartlead email providers  
- [x] Inbound webhooks: `/api/webhooks/telnyx`, `/api/webhooks/email`  
- [x] Neon database connected  
- [x] Campaign **Cancel** (pauses — no further sends) + multi-select sources/groups  
- [x] Merge tags: `{{firstName}}`, `{{brand}}` (not `{FirstName}`)  

## Status snapshot

| Piece | Status |
|---|---|
| Neon | Live |
| Telnyx send (API + number) | Live — filtered / low throughput until 10DLC **Campaign** ACTIVE + number assigned |
| Telnyx **10DLC Brand** | **Approved (status OK, TCR BNHCFPV)** via API |
| Telnyx **10DLC Campaign** | **Pending — none registered yet** ← do this next for volume SMS |
| Live send cap | Default **2000** real provider calls per Launch (`SMS_LIVE_CAP` / `TELNYX_LIVE_CAP` / `EMAIL_LIVE_CAP`; hard max **10000**) |
| Smartlead cold email | Live (key + campaign id set) |
| Public webhook URL | `https://www.igleadsuite.com` (`PUBLIC_APP_URL`) |
| Users / ACL | Available at `/users` + `/login` |
| CRM / n8n | Not required today |

## You set up (accounts)

### 1. Telnyx — Brand done; Campaign next

1. ~~API Key → `TELNYX_API_KEY`~~  
2. ~~Default number → `TELNYX_FROM_NUMBER`~~  
3. Assign a Telnyx number on each entity portal (Entities → portal → phone numbers; Autopilot uses the first)  
4. ~~Wait for **10DLC Brand**~~ — Brand is **OK** (TCR **BNHCFPV**)  
5. **Register a 10DLC Campaign** in Telnyx Mission Control (you must click this — API cannot finish carrier approval for you):  
   1. Open [Mission Control](https://portal.telnyx.com) → **Messaging → 10DLC**  
   2. Select Brand **Abstract** (status OK / TCR BNHCFPV) → **Create campaign**  
   3. Choose use case (typically **Low Volume Mixed** or **Marketing** — match your traffic)  
   4. Fill sample messages that match what you send (soft tone, include `Reply STOP to opt out` / HELP)  
   5. Document opt-in / CTA, Terms + Privacy URLs, message frequency + “msg & data rates may apply”  
   6. Submit and wait for carrier / MNO approval (often hours–days; status must become **ACTIVE** / MNO approved)  
   7. **Assign number** `+15162661301` (and any other Abstract numbers) to the approved campaign → Phone Numbers / Assign Numbers  
   8. Confirm the number sits on a Messaging Profile first, then on the campaign  
6. Messaging profile webhook → `https://www.igleadsuite.com/api/webhooks/telnyx` (or `${PUBLIC_APP_URL}/api/webhooks/telnyx`)  
7. Optional: raise `SMS_LIVE_CAP` on Vercel (default **2000**, hard max **10000**) after Campaign is ACTIVE  

#### Blast checklist (SMS Own Launch)

1. Telnyx → **10DLC** → Campaign under Brand Abstract → wait until **ACTIVE** → assign `+15162661301`  
2. Confirm `/setup` or `GET /api/providers/ten-dlc` shows Brand OK + Campaign present  
3. Confirm `GET /api/providers/status` → `telnyx: live`, `smsLiveCap`, webhooks  
4. **Campaigns → Build** → Entity Abstract → channel SMS → mode **Own** → multi-select sources/groups as needed → volume → soft message with `{{firstName}}` + STOP → send window → **Launch** (inside window)  
5. Use **Cancel** on the campaign list to pause — no further sends  
6. Start small (volume 50–100), check Inbox + Telnyx delivery, then raise volume / `SMS_LIVE_CAP` (≤ 10000)

### 2. Smartlead — done when keys are in `.env`

```bash
SMARTLEAD_API_KEY=...
SMARTLEAD_CAMPAIGN_ID=...
```

**Copy ownership:** Create subject/body only in **IG Lead Suite**. On **Launch**, the app pauses the Smartlead campaign if needed, writes your CRM subject + message (HTML if present) onto sequence #1 (creating a one-step stub if empty), sets the campaign **Active**, then adds leads. You do **not** recreate the email sequence in Smartlead.

**Still required in Smartlead:** campaign stays **Active** and a **mailbox is connected**. Smartlead handles warmup/sending; Lead Suite owns the words.

Webhook: `${PUBLIC_APP_URL}/api/webhooks/email` (event **EMAIL_REPLY**).

**HTML / image emails:** Campaigns → Build email can store an optional public **image URL** (+ alt). IG Lead Suite builds a personalized HTML body (with image) and a plain-text fallback (no image), and passes `email_html` / `email_text` / `image_url` as Smartlead lead custom fields. Set the Smartlead campaign sequence to **HTML** (not plain-only) and reference those fields if you want the CRM copy/image in the send. After pulling this schema change: `npm run db:push` (Neon-safe; no migration files).

### 3. Public URL

Cloudflare Tunnel for local tests, or Vercel for production. Set `PUBLIC_APP_URL`.

### 4. Users & site lock (required on Vercel)

On **Vercel / production**, auth is required automatically (unless `AUTH_REQUIRED=false`). Local demos stay open unless you set `AUTH_REQUIRED=true`.

```bash
AUTH_SECRET=long-random-string           # required — signs cookies
AUTH_ADMIN_EMAIL=admin@signaldesk.local
AUTH_ADMIN_PASSWORD=your-strong-password # required on Vercel — do not use changeme
# SITE_ACCESS_CODE=optional-passcode     # optional alternate admin password
# AUTH_REQUIRED=true                     # force login locally
# AUTH_REQUIRED=false                    # only if you want an unlocked deploy
```

1. Set the vars above in Vercel → Project → Environment Variables (Production)  
2. Open `/login` with the admin email + `AUTH_ADMIN_PASSWORD`  
3. **Users** → add members and check only the entities they may see  
4. Members never see other companies’ campaigns / inbox / reports  

**Webhooks stay public** (no browser login): `/api/webhooks/telnyx`, `/api/webhooks/email`. Optional second layer: Vercel Deployment Protection.

### 5. Campaign timing

1. **Campaigns → Build** → pick Morning or Afternoon (or custom hours)  
2. Launch outside the window → stays **scheduled**  
3. Launch inside the window → SMS via Telnyx; email → CRM copy pushed to Smartlead sequence, then leads added  

4. **Reports → Send timing** to compare which windows get better replies  
5. **Reports → Performance / Improve** for reply rates, best copy, and what to scale next  


## Secrets checklist

```bash
DATABASE_URL=...                 # done
TELNYX_API_KEY=...               # done
TELNYX_FROM_NUMBER=+1...         # done
SMARTLEAD_API_KEY=...            # done
SMARTLEAD_CAMPAIGN_ID=...        # done
PUBLIC_APP_URL=https://...       # tunnel or Vercel
AUTH_SECRET=...                  # required on Vercel
AUTH_ADMIN_PASSWORD=...          # required on Vercel (not changeme)
# SMS_LIVE_CAP=2000              # live Telnyx SMS per Launch (default 2000, hard max 10000)
# TELNYX_LIVE_CAP=2000           # alias for SMS_LIVE_CAP
# EMAIL_LIVE_CAP=2000            # live Smartlead/Instantly calls per Launch
# SITE_ACCESS_CODE=...           # optional
# AUTH_REQUIRED=true             # local lock / explicit
# AUTH_REQUIRED=false            # unlock a deploy (not recommended)
# OPENAI_API_KEY=...             # optional — Campaigns → Build → Draft with AI
# AI_GATEWAY_API_KEY=...         # optional — Ads Gemini wording
# N8N_WEBHOOK_URL=...            # later
```

### Optional: OpenAI for campaign copy

1. Create a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Vercel → Project **`ig-lead-suite`** → Settings → Environment Variables  
   - Name: `OPENAI_API_KEY`  
   - Value: your key  
   - Environments: Production + Preview (and Development if you use `vercel env pull`)
3. Redeploy so the runtime picks up the var
4. **Campaigns → Build** → pick Soft or Growth tone → **Draft with AI** fills subject/body (`{{firstName}}` / `{{brand}}`, STOP/unsubscribe)

Without the key the button still works with a financing-safe demo draft and a clear toast. Ads creatives continue to use Gemini / AI Gateway keys separately.

## Realistic outcome while 10DLC Campaign is pending

| Goal | Now |
|---|---|
| Run IG Lead Suite ops UI | Yes |
| Send test SMS via Telnyx | Yes (carriers may filter without Campaign) |
| Receive SMS/email into Inbox | Yes, with public webhook URL |
| Full 20k/day × 5 entities | No — needs 10DLC Campaign + warmed domains |
| Morning vs afternoon sends | Yes — send windows enforced |
| Per-company user access | Yes — Users page |
| App live SMS / Launch | Up to `SMS_LIVE_CAP` (default 2000, max 10000) once Campaign + number assigned |

**Still needs you:** Telnyx **10DLC Campaign** registration + assign `+15162661301` to that campaign.  
**On Vercel:** set `AUTH_SECRET` + `AUTH_ADMIN_PASSWORD` (login is required by default; webhooks remain public). Optional: `SMS_LIVE_CAP`.

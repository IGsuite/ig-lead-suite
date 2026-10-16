# IG Lead Suite — go-live checklist

The **ops app is built**. Neon + Telnyx SMS + Smartlead are keyed. What’s left: **register the Telnyx 10DLC Campaign** (Brand is already **OK**), keep a **public webhook URL**, and set auth secrets on Vercel project **`ig-lead-suite`** (login is **on by default** in production).

## Already done in IG Lead Suite

- [x] Shared lead upload + groups + verify-on-import (up to **30k rows**/upload, chunked Neon inserts, flexible vendor headers, skip invalid contacts on import + send)  
  - Soft platform limit: some Vercel plans reject request bodies over ~**4.5 MB** — split large CSVs if upload fails with a body/size error. `maxDuration` is set to 300s for Pro/Fluid.
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

## Status snapshot

| Piece | Status |
|---|---|
| Neon | Live |
| Telnyx send (API + number) | Live — low-volume / test until 10DLC **Campaign** registered |
| Telnyx **10DLC Brand** | **Approved (status OK, TCR BNHCFPV)** via API |
| Telnyx **10DLC Campaign** | **Pending — none registered yet** ← do this next for volume SMS |
| Smartlead cold email | Live (key + campaign id set) |
| Public webhook URL | Set when tunnel/deploy is up (`PUBLIC_APP_URL`) |
| Users / ACL | Available at `/users` + `/login` |
| CRM / n8n | Not required today |

## You set up (accounts)

### 1. Telnyx — Brand done; Campaign next

1. ~~API Key → `TELNYX_API_KEY`~~  
2. ~~Default number → `TELNYX_FROM_NUMBER`~~  
3. Assign a Telnyx number on each entity portal  
4. ~~Wait for **10DLC Brand**~~ — Brand is **OK**  
5. **Register a 10DLC Campaign** in Telnyx Mission Control for Abstract (then other entities)  
6. Messaging profile webhook → `${PUBLIC_APP_URL}/api/webhooks/telnyx`

### 2. Smartlead — done when keys are in `.env`

```bash
SMARTLEAD_API_KEY=...
SMARTLEAD_CAMPAIGN_ID=...
```

Webhook: `${PUBLIC_APP_URL}/api/webhooks/email` (event **EMAIL_REPLY**).

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
3. Launch inside the window → sends through IG Lead Suite → Telnyx / Smartlead  
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
# SITE_ACCESS_CODE=...           # optional
# AUTH_REQUIRED=true             # local lock / explicit
# AUTH_REQUIRED=false            # unlock a deploy (not recommended)
# N8N_WEBHOOK_URL=...            # later
```

## Realistic outcome while 10DLC Campaign is pending

| Goal | Now |
|---|---|
| Run IG Lead Suite ops UI | Yes |
| Send test SMS via Telnyx | Yes (carriers may filter without Campaign) |
| Receive SMS/email into Inbox | Yes, with public webhook URL |
| Full 20k/day × 5 entities | No — needs 10DLC Campaign + warmed domains |
| Morning vs afternoon sends | Yes — send windows enforced |
| Per-company user access | Yes — Users page |

**Still needs you:** Telnyx **10DLC Campaign** registration.  
**On Vercel:** set `AUTH_SECRET` + `AUTH_ADMIN_PASSWORD` (login is required by default; webhooks remain public).

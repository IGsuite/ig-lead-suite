# IG Lead Suite

Master Marketing CRM — one backend for multi-entity outbound: a **shared lead pool** feeding separate company portals — each with its own offer, sending identity, and website/CRM API hook.

**Package / Vercel project name:** `ig-lead-suite` (use that name when creating or renaming the Vercel project). Internal env defaults like `admin@signaldesk.local` can stay.

## Entities

| Entity | Website | Focus |
|---|---|---|
| **Abstract Capital Group** | [abstractcapitalgroup.com](https://abstractcapitalgroup.com/) | Small business loans brokerage (MCA, LOC, term, SBA…) |
| **Ahava Capital** | [ahavacapital.com](https://www.ahavacapital.com/) | Working capital & merchant cash advance |
| **Take More Funding** | [takemorefunding.com](https://takemorefunding.com/) | Independent brokerage — shops 50+ lenders |
| **Venture Business Capital** | [venturebusinesscapital.com](https://www.venturebusinesscapital.com/) | Institutional business & real estate financing |
| **TYH Marketing** | [tyhmarketing.com](https://www.tyhmarketing.com/) | Paid ads, LLM SEO, social, media, websites |

## Stack

| Piece | Role |
|---|---|
| **Neon** | Postgres — shared lead pool + entity data + users |
| **Next.js** | IG Lead Suite ops UI — upload, campaigns, Autopilot, reports, users |
| **Telnyx** | SMS delivery backend (numbers + 10DLC per entity) |
| **Instantly / Smartlead** | Cold email delivery (warmup + inbox placement) |
| **n8n** | Interested reply → that entity’s CRM / website API |

IG Lead Suite is where you upload leads and run campaigns. **Telnyx sends the texts; Smartlead/Instantly send the emails.** Your CRM gets replies via n8n later — it is not the blast engine.

Without `DATABASE_URL`, the app uses a local JSON store under `.data/` so you can still demo the UI.

## Go live

See **[SETUP.md](SETUP.md)** and the in-app **Go live** page (`/setup`).

**Current:** Neon live · Telnyx SMS keyed · Smartlead keyed · **10DLC Brand approved (OK)** · **next = register 10DLC Campaign** for volume SMS · optional stable `PUBLIC_APP_URL` (Vercel project: `ig-lead-suite`).

## Campaign send windows

Each campaign (and Autopilot quota) has a **send window**: morning / afternoon / evening / custom / any (America/New_York).

- Launch outside the window → status stays **scheduled** (no send).
- Launch again inside the window → IG Lead Suite delivers via Telnyx or Smartlead.
- **Reports → Send timing** shows reply performance by morning / afternoon / evening.
- **Reports → Performance / Improve** — scorecards, best message copy, and source + timing + message in one view.

## Users & entity access

| Role | Sees |
|---|---|
| **Admin** | All entities + Users admin + Autopilot |
| **Member** | Only `allowedEntityIds` portals (campaigns, inbox, reports, brands) |

Shared leads remain shared. Portals never mix.

**Production (Vercel) locks the site behind login by default.** Local stays open for demos unless you set `AUTH_REQUIRED=true`.

```bash
# .env / Vercel Project → Settings → Environment Variables
AUTH_SECRET=long-random-string          # required — signs session cookies
AUTH_ADMIN_EMAIL=admin@signaldesk.local
AUTH_ADMIN_PASSWORD=your-strong-password  # required on Vercel (no changeme)
# AUTH_REQUIRED=true                    # force login locally
# AUTH_REQUIRED=false                   # only if you intentionally want an open deploy
# SITE_ACCESS_CODE=optional-passcode    # optional alternate admin password
```

Open **Users** in the sidebar to invite teammates. Sign in at `/login`.

**Still public without browser login** (providers need this):

- `/api/webhooks/telnyx`
- `/api/webhooks/email`
- `/api/providers/status` (health)

Optional second layer: enable [Vercel Deployment Protection](https://vercel.com/docs/security/deployment-protection) on the project (SSO / Vercel auth). App login still applies after that.

Upgrade path later: replace the cookie session with Clerk/Auth.js — keep the same `AppUser.allowedEntityIds` scoping.

## Connect Neon

1. Create a project at [console.neon.tech](https://console.neon.tech).
2. Copy the connection string (URI).
3. Put it in `.env`:

```bash
cp .env.example .env
# edit DATABASE_URL=
```

4. Push schema + seed:

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

## Ads (creators · copy, templates & files)

Yes — **creators work here**. Open **Ads** in the sidebar (`/creatives`):

1. **Pick a company first** (Shared, Abstract, Ahava, …). You only see that company’s library — folders, templates, and files never mix across entities.
2. **Folders + templates + files** — organize SMS/email templates in folders; upload images/docs (stored under `.data/ad-assets/{entityId}/…`, metadata in Neon/JSON).
3. **AI wording** (Create / Improve / Winners / Tips) is scoped to the selected company. After a draft: **Shorter** / **Stronger CTA** / **Softer** / **More variants**.
4. **Use in form** or **Save as template**, then **Campaigns → Use template** for that entity.
5. ACL: members only see entities they can access; shared library edits are admin-only.
6. Not a Canva clone — image-heavy email layouts stay in **Smartlead**.

AI keys (any one):

```bash
AI_GATEWAY_API_KEY=...                 # Vercel AI Gateway → google/gemini-3.5-flash
# or
GOOGLE_GENERATIVE_AI_API_KEY=...       # Google AI Studio
# or
GEMINI_API_KEY=...                     # same as Google key
```

Without a key the UI still works with demo drafts.

## Lead ops flow

1. **Leads** — Upload a provider CSV (source + group). Email and phone are **verified on import**.
2. **Ads** — Pick a company, organize folders/templates/files, draft SMS/email copy with AI, save templates.
3. **Reports** — Performance scorecards, best message ranking, Improve (source + timing + copy), Sources, Send timing, Costs & ROI — always filterable per company.
4. **Campaigns / Autopilot** — Build or spin daily volumes **in IG Lead Suite** with send windows. SMS → Telnyx; email → Smartlead/Instantly. Use Ads templates in the builder.
5. **Inbox** — Replies land in that entity’s inbox only. Good lead → Email team.
6. **Users** — Give Ahava staff Ahava-only access, etc.

### Telnyx / Smartlead

```bash
TELNYX_API_KEY=...
TELNYX_FROM_NUMBER=+1...
SMARTLEAD_API_KEY=...
SMARTLEAD_CAMPAIGN_ID=...
PUBLIC_APP_URL=https://your-public-host
```

## Architecture

```
Provider CSVs → Shared lead pool (Neon) → auto-verify email/phone
                         ↓
                    Autopilot wheel (+ send windows)
     ┌──────────┬──────────┬──────────┬──────────┬──────────┐
  Abstract    Ahava    Take More   Venture     TYH
  campaigns  campaigns  campaigns  campaigns campaigns
  (isolated — never mixed; ACL per user)
     ↓          ↓          ↓          ↓          ↓
  Telnyx / Smartlead delivery backends
```

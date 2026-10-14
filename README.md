# Master Marketing CRM

One backend for multi-entity outbound: a **shared lead pool** feeding separate company portals — each with its own offer, sending identity, and website/CRM API hook.

*(Internal package name remains `signaldesk`.)*

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
| **Next.js** | Master Marketing CRM ops UI — upload, campaigns, Autopilot, reports, users |
| **Telnyx** | SMS delivery backend (numbers + 10DLC per entity) |
| **Instantly / Smartlead** | Cold email delivery (warmup + inbox placement) |
| **n8n** | Interested reply → that entity’s CRM / website API |

Master Marketing CRM is where you upload leads and run campaigns. **Telnyx sends the texts; Smartlead/Instantly send the emails.** Your CRM gets replies via n8n later — it is not the blast engine.

Without `DATABASE_URL`, the app uses a local JSON store under `.data/` so you can still demo the UI.

## Go live

See **[SETUP.md](SETUP.md)** and the in-app **Go live** page (`/setup`).

**Current:** Neon live · Telnyx SMS keyed · Smartlead keyed · **10DLC Brand approved (OK)** · **next = register 10DLC Campaign** for volume SMS · optional stable `PUBLIC_APP_URL` (Vercel).

## Campaign send windows

Each campaign (and Autopilot quota) has a **send window**: morning / afternoon / evening / custom / any (America/New_York).

- Launch outside the window → status stays **scheduled** (no send).
- Launch again inside the window → Master Marketing CRM delivers via Telnyx or Smartlead.
- **Reports → Send timing** shows reply performance by morning / afternoon / evening.
- **Reports → Performance / Improve** — scorecards, best message copy, and source + timing + message in one view.

## Users & entity access

| Role | Sees |
|---|---|
| **Admin** | All entities + Users admin + Autopilot |
| **Member** | Only `allowedEntityIds` portals (campaigns, inbox, reports, brands) |

Shared leads remain shared. Portals never mix.

```bash
# .env
AUTH_SECRET=long-random-string
AUTH_ADMIN_EMAIL=admin@signaldesk.local
AUTH_ADMIN_PASSWORD=changeme
# Optional: force login for every page/API (except webhooks)
# AUTH_REQUIRED=true
```

Open **Users** in the sidebar to invite teammates. Sign in at `/login`.

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

## Creatives (ads development)

Open **Creatives** in the sidebar (`/creatives`):

1. **Creative assistant** (top panel) — pick a mode chip:
   - **Create new** — brief / offer / tone / CTA → 2–3 variations.
   - **Improve existing** — dropdown of saved creatives → AI rewrite (or use **Improve with AI** on a library card).
   - **Suggest from winners** — remixes top-performing campaign messages + recent templates for that entity/channel.
   - **Quick tips** — short SMS/email coaching for the selected entity.
2. After a draft: **Shorter** / **Stronger CTA** / **Softer / compliance-safe** / **More variants** iterates from the selected option.
3. **Use in form** or **Save as template**, then pick the template from the campaign builder.
4. Compliance-minded prompts (no guaranteed funding; SMS samples include STOP). Works in **demo mode** without an AI key.
5. Image-heavy email design stays in **Smartlead** for now — this library is copy, not a Canva clone.

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
2. **Creatives** — Draft SMS/email copy (AI optional) and save templates.
3. **Reports** — Performance scorecards, best message ranking, Improve (source + timing + copy), Sources, Send timing, Costs & ROI — always filterable per company.
4. **Campaigns / Autopilot** — Build or spin daily volumes **in Master Marketing CRM** with send windows. SMS → Telnyx; email → Smartlead/Instantly. Use Creatives templates in the builder.
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

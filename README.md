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

## Email HTML + images

Own email campaigns can include a public image URL. At send time the suite builds:

- **HTML** — personalized copy + optional `<img>`
- **Plain text** — same copy, no image

Stored on `Campaign` as `imageUrl` / `imageAlt` / optional `htmlMessage`. Neon: `npm run db:push` after pull. Smartlead must accept HTML sequences; custom fields `email_html`, `email_text`, `image_url` are attached on lead upload. SMS path is unchanged.

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

Open **Users** in the sidebar to add teammates. After create (or **Reset password**), a share panel shows the login URL (email prefilled, e.g. `https://www.igleadsuite.com/login?email=…`) and temporary password. Optional invite email: set `RESEND_API_KEY` + `INVITE_FROM_EMAIL` (or `AUTH_INVITE_FROM`) on Vercel, or SMTP (`SMTP_HOST` + credentials). Without a key, the toast says “Invite email skipped — copy and share”. Sign in at `/login`.

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

## Auto wheel vs Own campaigns

| Mode | Where | Behavior |
|---|---|---|
| **Auto** | Autopilot (`/autopilot`) | Each day, every entity on the wheel pulls its **daily volume** (email + SMS) from the shared pool. Fair rotation uses a durable `LeadSendEvent` log + pool cursor so the same slice is not reused every day. Same message fingerprint is not re-sent the next day. |
| **Own** | Campaigns → Build | Standalone entity campaign outside daily Autopilot volumes. Still respects global opt-outs and same-message cooldowns. |

UI shows **Auto** vs **Own** on campaign lists; Autopilot shows daily volumes, wheel order, last sent, and next-up leads.

## Lead detail

Open any lead from **Leads** → `/leads/[id]` for contact info, entity touches, SMS/email send history, campaign history, replies, and opt-out status. Inbox can deep-link with `?leadId=`.

**Global opt-out** blocks a person across **all entities and channels** (SMS + email).

## Social Media (Meta · TikTok)

Open **Social Media** in the sidebar (`/social`):

1. Pick an **entity portal**, then **Meta** or **TikTok**.
2. Edit that brand’s **social page links** (Facebook, Instagram, TikTok, LinkedIn, website, …) — entity hub for monitoring/running social.
3. Store a per-entity **connection** (ad account ID, pixel/events ID, status) — local/mock only; no OAuth in this slice.
4. Create **social campaigns** (objective, budget, status, primary text, CTA, landing URL, optional Ads library links, schedule, metrics placeholders).
5. **Reports → Social** rolls up campaign counts / spend / leads by entity + platform.
6. Shared lead pool stays shared; social campaigns never mix across entities.

Optional env (for a later live publish step — not required for planning UI):

```bash
# META_ACCESS_TOKEN=...      # Meta Marketing API (future)
# TIKTOK_ACCESS_TOKEN=...    # TikTok Marketing API (future)
```

Live ad publish / Insights sync still needs OAuth + ad account linking per entity.

## Ads (creators · copy, templates & files)

Yes — **creators work here**. Open **Ads** in the sidebar (`/creatives`):

1. **Pick a company first** (Shared, Abstract, Ahava, …). You only see that company’s library — folders, templates, and files never mix across entities.
2. **Folders + templates + files** — organize SMS/email templates in folders; upload images/docs (stored under `.data/ad-assets/{entityId}/…`, metadata in Neon/JSON).
3. **AI wording** (Create / Improve / Winners / Tips) is scoped to the selected company. After a draft: **Shorter** / **Stronger CTA** / **Softer** / **More variants**.
4. **Use in form** or **Save as template**, then **Campaigns → Use template** for that entity.
5. ACL: members only see entities they can access; shared library edits are admin-only.
6. Not a Canva clone — for richer email, **Campaigns → Build email** accepts an optional public **image URL** (HTML + plain-text fallback), or paste HTML in the message. Launch pushes that HTML into Smartlead’s sequence. Ads library files are auth-gated today; later those creatives can feed the same image URL into email (and social ads) without a drag-drop designer.

AI keys — Ads (any one):

```bash
AI_GATEWAY_API_KEY=...                 # Vercel AI Gateway → google/gemini-3.5-flash
# or
GOOGLE_GENERATIVE_AI_API_KEY=...       # Google AI Studio
# or
GEMINI_API_KEY=...                     # same as Google key
```

Without a Gemini/Gateway key, Ads still works with demo drafts.

Campaign builder **Draft with AI** (optional OpenAI / ChatGPT):

```bash
OPENAI_API_KEY=...                     # gpt-4o-mini via Vercel AI SDK
```

Set on Vercel → Project → Environment Variables. Without it, **Campaigns → Build** still fills a soft financing-safe demo draft and shows a notice.

## Lead ops flow

1. **Leads** — Upload a provider CSV (source + group). Email and phone are **verified on import**.
2. **Ads** — Pick a company, organize folders/templates/files, draft SMS/email copy with AI, save templates.
3. **Social Media** — Per-entity Meta / TikTok campaign planning + connection setup (live publish later).
4. **Reports** — Performance scorecards, best message ranking, Improve (source + timing + copy), Sources, Send timing, Social, Costs & ROI — always filterable per company.
5. **Campaigns / Autopilot** — **Own** campaigns or **Auto** wheel daily volumes **in IG Lead Suite** with send windows. SMS → Telnyx; email → Launch pushes CRM subject/body into Smartlead (or Instantly lead-add), then delivers. Use Ads templates or **Draft with AI** (OpenAI) in the builder.
6. **Leads → lead page** — Full history per contact (`/leads/[id]`).
7. **Inbox** — Replies land in that entity’s inbox only (or filter by `leadId`). Good lead → Email team.
8. **Users** — Give Ahava staff Ahava-only access, etc.

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
  + social   + social   + social   + social  + social
  (isolated — never mixed; ACL per user)
     ↓          ↓          ↓          ↓          ↓
  Telnyx / Smartlead (+ Meta/TikTok publish later)
```

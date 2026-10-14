# SignalDesk

One backend for multi-entity outbound: a **shared lead pool** feeding separate company portals — each with its own offer, sending identity, and website/CRM API hook.

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
| **Neon** | Postgres — shared lead pool + entity data |
| **Next.js** | SignalDesk ops UI — upload, campaigns, Autopilot, reports |
| **Telnyx** | SMS delivery backend (numbers + 10DLC per entity) |
| **Instantly / Smartlead** | Cold email delivery (warmup + inbox placement) |
| **n8n** | Interested reply → that entity’s CRM / website API |

SignalDesk is where you upload leads and run campaigns. **Telnyx sends the texts.** Your CRM gets replies/interested leads via n8n — it is not the blast engine.

Without `DATABASE_URL`, the app uses a local JSON store under `.data/` so you can still demo the UI.

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

For Cursor Cloud Agents, add `DATABASE_URL` under [Cloud Agent Secrets](https://cursor.com/dashboard/cloud-agents), then start a **new** agent and ask it to run `db:push` + `db:seed`.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

Sample CSV: [`public/sample-leads.csv`](public/sample-leads.csv).

## Lead ops flow

1. **Shared leads** — Upload a provider CSV (source + group). Email and phone are **verified on import**.
2. **Reports** — Choose an entity (or shared pool) to see which sources win for that business.
3. **Campaigns / Autopilot** — Build or spin daily volumes in SignalDesk. SMS goes out through **Telnyx**; cold email through Instantly/Smartlead once keyed.
4. **CRM** — n8n pushes interested replies into each entity’s CRM/site. Campaigns themselves stay in SignalDesk so brands never mix.

### Telnyx

```bash
# .env
TELNYX_API_KEY=KEY...
TELNYX_FROM_NUMBER=+1...
```

Without a key, SMS runs in **mock** mode (safe for demos).

### Cold email (not SES / SendGrid)

Amazon SES and SendGrid are built for transactional / opted-in marketing. For **cold lead outreach**, use **Instantly** or **Smartlead** (warmup, rotation, better inbox placement). SES is fine later for transactional mail from your sites — not as the cold engine.

## Architecture

```
Provider CSVs → Shared lead pool (Neon) → auto-verify email/phone
                         ↓
                    Autopilot wheel
     ┌──────────┬──────────┬──────────┬──────────┬──────────┐
  Abstract    Ahava    Take More   Venture     TYH
  campaigns  campaigns  campaigns  campaigns campaigns
  (isolated — never mixed)
     ↓          ↓          ↓          ↓          ↓
  each site / CRM API (via n8n)
```

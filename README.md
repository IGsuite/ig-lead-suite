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
| **Next.js** | SignalDesk ops UI + API |
| **Amazon SES** | Email (next) |
| **Twilio** | SMS / 10DLC (next) |
| **n8n** | CRM / website sync (next) |

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
3. **Campaigns** — Pick one entity portal. That portal’s campaigns only — Ahava never sends as Abstract.
4. **Autopilot** — Ferris-wheel rotation: set daily email + SMS volume per entity (default 20k each). Run a daily pass so each portal gets fresh verified leads from the shared pool.

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

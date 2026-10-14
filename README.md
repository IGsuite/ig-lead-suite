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

## Architecture

```
Provider CSVs → Shared lead pool (Neon)
                    ↓
     ┌──────────┬──────────┬──────────┬──────────┬──────────┐
  Abstract    Ahava    Take More   Venture     TYH
  portal     portal     portal     portal    portal
     ↓          ↓          ↓          ↓          ↓
  each site / CRM API (via n8n)
```

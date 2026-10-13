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

Upload leads once. Campaigns rotate offers across entities so the same contact can hear from different programs — and convert with whichever fits. Global STOP blocks every entity.

## What you can do today

- Shared lead pool with CSV upload (source / date / cost, dedupe)
- Per-entity portals (domain, numbers, CRM, website API URL, rotation flag)
- Campaign builder with “prefer not yet offered this entity”
- Reply inbox, global opt-outs, cost-per-reply by provider
- Local JSON store (mock for Supabase); SES / Twilio / live APIs next

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

Sample CSV: [`public/sample-leads.csv`](public/sample-leads.csv).

## Architecture (intended)

```
Provider CSVs → Shared lead pool (one DB)
                    ↓
     ┌──────────┬──────────┬──────────┬──────────┬──────────┐
  Abstract    Ahava    Take More   Venture     TYH
  portal     portal     portal     portal    portal
     ↓          ↓          ↓          ↓          ↓
  each site / CRM API
```

## Reset demo data

Settings → **Reset demo data**, or `POST /api/platform` with `{ "action": "reset" }`.

# SignalDesk

One backend for multi-entity outbound: a **shared lead pool** feeding separate company portals — each with its own offer, sending identity, and website/CRM API hook.

## Entities (current)

| Entity | Focus |
|---|---|
| **Abstract Capital Group** | Brokerage — MCA, unsecured, secured financing |
| **Venture Business Capital** | Traditional financing only |
| **TOAH Marketing** | SEO / marketing for business owners |
| **Havoc Capital Group** | Unsecured lending only |

Upload leads once. Campaigns rotate offers across entities so the same contact can hear from Abstract, then Havoc, then Venture or TOAH — and convert with whichever program fits. Global STOP blocks every entity.

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
     ┌──────────┬──────────┬──────────┬──────────┐
  Abstract   Venture     TOAH      Havoc
  portal     portal     portal    portal
     ↓          ↓          ↓          ↓
  site/CRM   site/CRM   site/CRM   site/CRM
  API        API        API        API
```

## Reset demo data

Settings → **Reset demo data**, or `POST /api/platform` with `{ "action": "reset" }`.

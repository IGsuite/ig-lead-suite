# SignalDesk

Multi-brand outbound marketing ops desk: shared lead pool, brand workspaces, campaign builder with throttling, reply inbox, global opt-outs, and cost-per-reply by lead source.

This repo ships a **working local slice** of the platform described in the Multi-Brand Marketing Platform plan. Persistence is a JSON store under `.data/` (mock stand-in for Supabase). SES, Twilio, n8n, and Metabase are not connected yet — the UI and APIs are ready for those integrations.

## What you can do today

- Overview dashboard with brand readiness and source ROI
- CSV lead upload with source / date / cost tagging and duplicate removal
- Five brand workspaces (edit domain, CRM, numbers, warm-up status)
- Campaign builder: audience → message → volume → throttle → draft/launch
- Reply inbox with mock CRM push for interested replies
- Global opt-out suppressions applied across the lead pool
- Results by provider (cost per reply)

## Run locally

```bash
npm install
npm run dev -- --port 43123
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

Sample CSV: [`public/sample-leads.csv`](public/sample-leads.csv).

## Stack

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- Local JSON data store (`.data/platform.json`)
- Planned: Supabase, Amazon SES, Twilio, n8n, Metabase

## Owner vs developer split (from your checklist)

**You:** brands list, provider accounts, 10DLC registration, DNS auth, warm-up volume discipline, weekly buy/drop decisions.

**Developer (this repo):** database/dashboard shell, CSV intake, campaign engine, opt-outs, inbox, results, CRM connector (next).

## Reset demo data

Settings → **Reset demo data**, or `POST /api/platform` with `{ "action": "reset" }`.

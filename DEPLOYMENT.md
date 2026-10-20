# IG Lead Suite deployment

The application keeps the existing appearance, forms, and company identities. Sending now uses a PostgreSQL outbox and authenticated cron. No migrations, provider account changes, or live sends run as part of a build.

## Configure an isolated preview first

Use a separate Neon branch/database and a private Vercel Blob store for preview. Never connect a preview to production data. Preview sends are blocked by the worker even if `SENDING_ENABLED=true`; development tests mock all provider calls.

Required production configuration:

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection, preferably pooled; valid TLS certificate required |
| `AUTH_SECRET` | Dedicated random secret of at least 32 characters; rotating it invalidates sessions |
| `AUTH_ADMIN_EMAIL`, `AUTH_ADMIN_PASSWORD` | Bootstrap administrator; existing bootstrap password behavior remains |
| `CRON_SECRET` | Separate random secret of at least 32 characters; Vercel sends it as the cron bearer token |
| `BLOB_STORE_ID` or `BLOB_READ_WRITE_TOKEN` | A connected **private** Blob store; configure both upload and read permissions |
| `SENDING_ENABLED` | Leave unset/false until the production readiness checks below are complete |
| `TELNYX_API_KEY`, `TELNYX_PUBLIC_KEY` | Outbound SMS and signature verification for inbound events |
| `SMARTLEAD_API_KEY` or `INSTANTLY_API_KEY` | Email provider; existing Instantly precedence is unchanged |
| `SMARTLEAD_CAMPAIGN_<ENTITY>` / `INSTANTLY_CAMPAIGN_<ENTITY>` | Distinct provider campaign for each company; shared `_CAMPAIGN_ID` fallback is intentionally disabled |
| `EMAIL_WEBHOOK_SECRET` | Separate random credential of at least 32 characters for email webhooks |

Each company's sender number is its first `phoneNumbers` entry. A shared `TELNYX_FROM_NUMBER` is no longer used. Configure a unique company number and its approved messaging profile/registration directly in Telnyx.

`AUTH_REQUIRED=false` only affects local development; production always requires authentication. Production never falls back to JSON user/CRM storage.

## Database migration

There are two committed migrations: a baseline of the existing schema, then additive outbox/receipt/lease/binding tables. Existing leads, campaigns, and users are not rewritten by the additive migration.

- **New empty database:** run `npm run db:migrate:deploy`.
- **Existing database originally created by `db push`:** take a backup, compare its schema with the baseline, and resolve differences first. Only after confirming the baseline matches, run `npx prisma migrate resolve --applied 202610200001_baseline`, followed by `npm run db:migrate:deploy`.
- **Existing migration history:** reconcile it explicitly; do not mark a baseline applied blindly or reset the database.

Run the commands from the repository root against the intended environment. Prisma loads `prisma7.config.ts` and its `DATABASE_URL`. Do not use `db push --accept-data-loss`, `migrate reset`, or the CRM reset action as a deployment step.

## Private files

The existing upload controls now send file bytes directly to private Blob storage, then submit a small authenticated reference to the app. Lead imports retain the 20 MB file cap and 30,000 row cap; Ads uploads retain their 8 MB cap. Private asset downloads are authenticated and streamed.

Existing `.data/ad-assets` files must be copied from their original hosting environment into private Blob storage and their metadata `storagePath` changed to `blob:<pathname>`, or reuploaded through the existing UI. This branch cannot recover files that existed only on another machine or a vanished function instance. Seed examples are not written to a production filesystem.

Temporary upload references are limited to the authenticated uploader's namespace. Successful imports/uploads remove temporary blobs. Configure a cleanup policy/job for abandoned `uploads/` objects; do not expire `ad-assets/` objects.

## Webhooks and company attribution

- Telnyx: use `https://www.igleadsuite.com/api/webhooks/telnyx`. Configure `TELNYX_PUBLIC_KEY`. Raw Ed25519 signature and five-minute timestamp validation are required. Inbound destination numbers must map to exactly one company. Signed `message.sent` / `message.finalized` events update matching SMS delivery jobs.
- Smartlead replies: use `/api/webhooks/email`. Configure the provider to send `X-Webhook-Secret: <EMAIL_WEBHOOK_SECRET>` or `Authorization: Bearer <EMAIL_WEBHOOK_SECRET>`. If custom headers are unavailable, use the same credential in a `token` query parameter; treat that webhook URL as a secret and redact it in logs. Campaign IDs must map uniquely to a company. Caller-supplied company overrides are ignored.
- Repeated Telnyx event IDs and exact repeated email payloads are deduplicated transactionally with their state changes. Email payload hash deduplication is conservative; provider payloads that change on retry should be checked during live testing.
- This handler supports Smartlead reply payloads. If Instantly is used for outbound, validate and adapt its actual inbound event contract before enabling that integration's replies.

Smartlead sequences are shared inside a provider campaign. To prevent changing copy behind recipients already queued there, the database binds that campaign to an immutable copy fingerprint. New copy requires a separate provider campaign. Map it with `SMARTLEAD_CAMPAIGN_<ENTITY>__<CRM_CAMPAIGN_ID_NORMALIZED>` (replace non-alphanumeric characters in the CRM ID with `_`, uppercase it). Every mapping must refer to a distinct provider campaign. Configure sequences, mailboxes and schedules in the provider and test acceptance before launch.

## Scheduler and delivery semantics

`vercel.json` schedules `/api/cron/dispatch` every minute. The Vercel plan must support that frequency and the route's 300-second maximum duration. The worker uses an atomic database lease, persists work before calling providers, respects each campaign's send window and configured throttle, and resumes queued work on later invocations. Daily Autopilot IDs use the company's timezone and are reused on repeated runs.

`SENDING_ENABLED=true` enables production dispatch after setup. Queued work created while sending is disabled will become eligible when sending is enabled: review/cancel old test campaigns first. Existing `autopilotEnabled` settings are respected; review quotas before enabling the worker. Outside-window scheduled campaigns resume automatically.

The worker processes at most 200 jobs per invocation within a time budget. It prioritizes safe recovery over automatic resend. Load-test intended daily volumes and provider rate limits before enabling all company quotas. The current worker is deliberately serial; very large volumes may require additional partitioned workers or bulk provider APIs.

- `queued`: persisted, waiting for schedule/worker.
- `processing`: provider attempt started.
- `accepted`: provider accepted the request/contact. Existing `sentCount` now counts only these accepted requests, **not inbox delivery**.
- `delivered`: confirmed SMS delivery receipt.
- `failed` / `skipped`: rejected, invalid, or no longer eligible.
- `uncertain`: request may have succeeded or persistence was interrupted. Reconcile with the provider before an explicit retry; the worker does not automatically resend it.

Inspect `/api/campaigns/<id>/delivery` while signed in to see counts and up to 100 failures/uncertain outcomes. Email provider acceptance is not proof of a delivered email. Email delivery/bounce event reconciliation and high-volume pagination remain follow-up work; do not describe email acceptance as confirmed delivery.

## Verification and release

1. Run `npm ci`, `npm test`, `npm run typecheck`, and `npm run build`. Queue integration tests apply both migrations to isolated PGlite PostgreSQL, mock provider responses, and exercise deduplication and failure recovery.
2. Review the preview's login, company permissions, file upload/download, and campaign queue. Check invalid cookies are rejected. Confirm no preview sends occur.
3. On production, verify provider credentials, company campaign mappings, mailboxes, sending schedules, Telnyx registration/number assignments, webhook authentication, Blob storage, migrated schema, and cron access.
4. Use only explicitly selected test contacts for the first controlled send. Verify acceptance, inbound replies, opt-outs, SMS delivery receipts, and actual email arrival. Confirm failed and skipped contacts do not increase `sentCount`.
5. Review the changes and release the tested production build. Enable sending only after the checks above. No release or production migration was performed while preparing this branch.

Full repository lint currently has five pre-existing `react-hooks/set-state-in-effect` errors in unchanged components/hooks. They are not hidden or disabled by this branch. Address them separately before making full lint a mandatory gate.

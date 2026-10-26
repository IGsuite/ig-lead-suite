# SEO reports and IT handoff

Open Social Media → SEO, select a company. Each company has a separate Ahrefs project mapping, report history, task queue and alerts. Ahrefs still performs website scans; WordPress remains the repair surface.

## Current connection boundaries

- Ahrefs Free website verification and scheduled scans do not grant API access. A saved reviewed report is labelled as a snapshot, with the actual audit time. It is never presented as live data.
- Administrators can record a completed report and findings. Duplicate audit times are idempotent; historical imports do not overwrite current IT work. Manual imports never automatically close omitted findings.
- IT can assign tasks, record notes and set Open / In progress / Fix reported. Verified fixed is reserved for a later complete provider response explicitly showing zero affected URLs. Missing or omitted rows are not proof of a repair. Recurring findings reopen tasks while preserving assignment and notes.
- Reports older than nine days display a stale warning. Acknowledging a notification does not close work.
- These changes do not publish ads, edit WordPress, change campaigns, enable SMS or purchase subscriptions.

## Optional Ahrefs automatic feed

An eligible Ahrefs API account and `AHREFS_API_KEY` must be configured server-side. Saving a key is not supported in the browser. Enable daily report checks per company after verifying its project ID and website mapping. The job reads completed audits at 10:00 UTC daily; it does not trigger new crawls. Ahrefs' projects endpoint is free in API units, while each new issues import costs 50 API units. The same crawl is not re-imported. Calls use the completed audit timestamp to keep metrics and findings consistent. Check plan availability and approve any subscription separately before configuring.

## IGF Ventures integration (not activated)

The user's IGF Ventures command center is not connected yet. A read-only events feed is prepared at `GET /api/integrations/seo/events`, disabled by default. Do not claim external IT notifications are active.

When the destination is ready, configure a dedicated random `COMMAND_CENTER_SEO_TOKEN` (minimum 32 characters) and explicit comma-separated `COMMAND_CENTER_SEO_ENTITIES` in the server environment. Do not reuse the admin password, auth session secret or cron credential. The destination sends `Authorization: Bearer <dedicated token>` and polls this endpoint. Receive 100 events per page; pass `nextCursor` as `after` until `hasMore` is false, and deduplicate on event `id`. Preserve the cursor for the next poll. Reading does not acknowledge CRM alerts. Credentials grant read-only SEO event access to the explicitly listed companies, including their report findings, not leads, passwords or user records. The destination must not expose this credential to its browser. Rotate it when access is revoked.

Future destination setup must confirm its receiving contract and company mapping. No data is pushed or shared merely by deploying this feature.

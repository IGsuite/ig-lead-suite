# Abstract Google Ads report bridge

This first-party bridge accepts dated campaign reports for customer **420-997-5325** only. Google Ads Scripts runs `AdsApp.search` and posts the report to the fixed HTTPS Lead Suite endpoint. It does not create, edit or enable ads or budgets. It is not a direct Google Ads API management integration.

Owner setup: open Social Media → Google Ads → Abstract → Set up or replace Google reporting. Approve a 90-day reporting key, generate the private script, and install it under the matching Google Ads account's Tools → Bulk actions → Scripts. Authorize Google's script prompt, run once and confirm the received report in Lead Suite, then schedule daily. Google may request broader script authorization even though this particular script only reads reports. Authorization and scheduling require explicit owner consent. No script or schedule is installed merely by deploying this feature.

The script contains a bearer key; keep it private. The server stores only its SHA-256 hash inside the encrypted company credential record. Creation/rotation/revocation require owner role, same-origin requests and a current revision. Receipt is serialized, limited to once per minute, rejects old/replayed timestamps, validates the exact account and payload, and cannot read CRM data or change campaigns. Rotate after 90 days. Revoke in Lead Suite and disable/delete the script in Google if no longer needed. Members with Abstract access can read reports; setup-only users cannot use operational endpoints. Anonymous report reads are denied.

The sender authenticates by possession of its report key; this is not a Google-signed webhook or independent provider verification. Only the reviewed report script should possess the key. Report data includes at most 200 distinct campaigns, a bounded date range, and nonnegative metrics. Reports are saved as a replaceable dated snapshot. Stale data is marked overdue after two days; revoked connections hide their report. The last 30 complete days exclude today; account timezone is supplied by Google. Reported conversions are attribution metrics, not proof that a real successful application has been tested.

No additional subscription is purchased. Normal hosting/database usage still applies. No CRM alerts or n8n workflows are automatically enabled by this feature; status is visible in the Google Ads reporting workspace.

References: https://developers.google.com/google-ads/scripts/docs/examples/reports and https://developers.google.com/google-ads/scripts/docs/integrations/third-party-apis

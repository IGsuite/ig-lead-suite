# Connection monitoring

The production Vercel cron calls `/api/cron/connections` daily at 11:15 UTC. It requires the existing `CRON_SECRET` (at least 32 characters). The existing database lease prevents overlapping runs. No migration or new service subscription is needed by the implementation. The current Hobby plan supports daily cron. Do not upgrade billing automatically.

The monitor reads configured company integrations and writes durable connection alerts to the existing CompanySetupEvent table. Alerts appear in Alerts & Tasks and the existing notification bell, scoped by the user's company access. It does not send email notifications or forward to IGF Ventures, whose connection is still pending.

Checks:

- Meta reporting: fixed Abstract asset bindings, live read verification, encrypted snapshot refresh, credential expiry/revocation. Uses revision comparison to avoid overwriting a replacement/disconnect. Does not enable publishing or inbox sync.
- Google Ads: installed report-key validity, first-report delivery, and overdue reports after 48 hours. Does not authorize or run the external script.
- Smartlead: company-mapped sender SMTP, IMAP and matching CRM reply webhook through existing readiness checks. Only checks companies with messaging setup in progress; does not use campaign pause as a failure.
- Telnyx: company-specific number assignment and carrier provisioning through existing readiness checks. General ACTIVE is insufficient. No texts are sent.
- n8n: notice-key validity and a successful connection test since key issuance. Event-driven idle workflows have no expected heartbeat, so silence is not represented as disconnection.
- SEO: existing automatic-sync configuration, server credential availability, previous sync error and check freshness. Does not spend Ahrefs units or launch a crawl.

Previously monitored encrypted connector records that disappear generate a repair alert. Revoked/expired access needs owner renewal; the monitor does not create credentials or expand permissions. A valid key alone is not proof of continuous external service availability. TikTok, LinkedIn, GA4, Search Console, Meta operations and public website availability are not live-monitored by this change. Their saved checklist fields are not represented as operational connectors.

Unchanged failures retain team acknowledgements. A changed state or recovery reopens the same alert row rather than creating daily duplicates. First healthy checks are silent. Per-company completion timestamps appear under Connection monitoring. If a previously running monitor misses 48 hours, a non-dismissible warning appears in the bell and Alerts & Tasks; it clears after a successful run. Before the first run, the panel explicitly says the monitor has not completed. Database or entire-site downtime still requires independent infrastructure monitoring.

Release checks: hosted build and tests; production cron secret present without printing it; one authenticated monitor run with counts only; inspect company-scoped alert and monitor timestamp in UI; confirm campaign statuses unchanged. Do not call dispatch to test monitoring. A preview build is not evidence that the production scheduler is active.

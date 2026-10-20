# Brand inbox conversations

Extends the existing inbox cards without changing the navigation, branding, or triage actions. Based on production main c18922f, preserving its signed sessions, authenticated webhooks, immutable provider campaign bindings, queue scheduling, private uploads and campaign suppression handling.

## Behavior

- Replies route using the verified receiving business mailbox/number and company-specific provider campaign mappings. Unknown, shared or conflicting identities are rejected.
- Full message text and provider references are retained. Provider retries are deduplicated transactionally. Opens, category changes and delivery receipts do not create false replies.
- Open conversation / reply shows inbound messages and replies written in the CRM. Drafts and history are separated by company, lead, channel, provider campaign and mailbox. New replies appear without clearing an unfinished draft.
- Email responses use the existing Smartlead thread, verifying its recipient, stats_id, connected sender mailbox and company ownership. They do not change campaign copy or relaunch a campaign. Text responses use the original receiving number.
- Authenticated server routes enforce company access and opt-outs. A durable request ID prevents duplicate sends after clicks, retries and lost responses. Uncertain submissions require review. SMS delivery receipts update operator-message status, including receipts received before a send request finishes.

## Release and rollout

1. Use an isolated preview database. The preview schema has been checked and migration 202610200003_inbox_conversations applied there; it adds Reply.providerContext and InboxSend without deleting existing records. Production baseline and outbox migration history have been inspected and are present. Apply the third committed migration through `npm run db:migrate:deploy` only after final preview checks. Never reset or seed the production database.
2. Preview sending is always blocked. Separate branch-specific preview database and signing credentials prevent preview code from accessing production data or sessions. `.vercelignore` explicitly excludes local environment files, data, generated output and handoff bundles.
3. Production operator responses are disabled until `INBOX_REPLIES_ENABLED=true`. This is independent of campaign dispatch: `SENDING_ENABLED` stays unchanged. Use `INBOX_REPLY_ENTITIES=abstract`, `INBOX_REPLY_CHANNELS=email` and `INBOX_REPLY_TEST_RECIPIENTS=issacgwork@gmail.com` for the initial controlled test. The entity gate falls back to ACTIVE_SENDING_ENTITIES when no inbox-specific allowlist is configured. Clear the test-recipient restriction only after the actual back-and-forth test succeeds.
4. Existing provider callbacks must carry the deployed EMAIL_WEBHOOK_SECRET and Telnyx events must have valid signatures. Abstract's email callback authentication was repaired through the existing scoped admin setup endpoint; no campaign was started and no messages were sent by that operation.
5. Older messages without the original receiving identity remain visible but cannot send. The selected real test conversation may be backfilled with provider metadata only after its lead, campaign, sender and thread identifiers are verified directly against the provider. Future verified inbound events retain this context automatically.
6. Deploy a production build with `--skip-domain`, verify it, then promote the same build. Keep the additive schema changes if an application rollback is needed.

Telnyx's failed registration still requires correction of the real direct opt-in process and review. Text sending is not enabled by this email rollout. Other companies require their own verified sender/campaign mappings before activation.

## Validation

`npm test` passes 13 tests covering routing and sender isolation, company access, suppression, authenticated webhook processing, PostgreSQL migration/transaction rollback, concurrent duplicate reservations, uncertain sends, early delivery receipts and production/preview rollout gates. All provider sends in automated tests are mocked. TypeScript and targeted ESLint checks pass. Real email API diagnostics confirm Abstract's SMTP and IMAP connections and the selected test lead's existing campaign reply thread. A real provider-accepted message must still be checked in the recipient inbox; acceptance alone is not delivery.

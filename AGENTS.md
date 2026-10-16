<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cloud Agent

`npm ci` refreshes dependencies and generates the Prisma client (`postinstall`). The dev server is `npm run dev` on port **43123** (`http://127.0.0.1:43123`). Without `DATABASE_URL`, the app uses the local JSON store under `.data/` — Neon, Telnyx, and Smartlead are not required to load the UI or add a lead.

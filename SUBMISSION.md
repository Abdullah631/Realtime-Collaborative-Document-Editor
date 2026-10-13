# Submission contents

| Item | Location |
|---|---|
| Live product URL | _add Vercel URL_ |
| Walkthrough video URL | [`WALKTHROUGH_VIDEO_URL.txt`](WALKTHROUGH_VIDEO_URL.txt) |
| Setup and run instructions | [`README.md`](README.md) |
| Architecture note | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| AI workflow note | [`AI_WORKFLOW.md`](AI_WORKFLOW.md) |
| Test accounts | README → *Reviewer quick start* (alice/bob/carol @example.com) |
| Frontend source (Next.js) | [`web/`](web) |
| Backend source (Express + Hocuspocus) | [`server/`](server) |
| Automated tests | [`server/src/*.test.ts`](server/src) (run with `cd server && npm test`) |
| Database migrations | [`server/migrations/`](server/migrations) (applied with `npm run migrate`) |
| Demo seed script | [`server/scripts/seed.ts`](server/scripts/seed.ts) |
| Deployment config | [`render.yaml`](render.yaml) (server). Vercel uses Root Directory `web` |

## Feature status
- **Working:** create, rename, edit, save and reopen; rich text (bold, italic, underline, headings, lists); import of `.txt`/`.md`/`.docx`; owner/editor/viewer sharing with a separate *Shared with me* list; persistence in Postgres; real-time co-editing with live cursors and line indicators; offline lock and reconnect.
- **Incomplete:** no browser end-to-end tests; single server instance; no version history, export or comments.
- **Next 2–4 hours:** see README → *Status*.

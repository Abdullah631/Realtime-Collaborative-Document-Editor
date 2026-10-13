# Ajaia Docs

A lightweight collaborative document editor: rich-text editing, real-time co-editing with live cursors, file import, and owner-controlled sharing.

**Live app:** _add Vercel URL_ · **API/realtime server:** _add Render URL_

## Reviewer quick start

Open the live app and use the **Reviewer demo accounts** on the sign-in page (no email needed):

| Account | Role on "Welcome to Ajaia Docs" |
|---|---|
| `alice@example.com` | Owner |
| `bob@example.com` | Editor |
| `carol@example.com` | Viewer (read-only) |

Password for all three (also used by the one-click buttons): _add DEMO_PASSWORD_

To be two people at once, use two browsers or a normal and a private window. Real users sign in with a **magic link** (passwordless email).

> The server runs on Render's free tier, which sleeps when idle. The first connection can take up to a minute; the editor shows "Connecting to the server…" while it wakes up.

### Things to try
1. As **Alice**, open the welcome doc. As **Bob** in another browser, open the same doc. Type at the same time: you'll see each other's named cursors, and the header shows "Bob is on line 3".
2. As **Carol**, open it: the toolbar is disabled and edits are impossible. The server also rejects her edits if the client is modified.
3. As Alice, click **Share** and remove Bob. Bob's open tab immediately shows "You no longer have access".
4. Turn off Wi-Fi in one browser: a "You're offline" banner appears and editing locks. Turn it back on and it reconnects and syncs.
5. **Import file** on the dashboard: `.txt`, `.md` or `.docx` (max 5 MB) becomes a new editable document.
6. Copy a doc's URL and open it as a user it isn't shared with: you get "Document not found", the same response as for a doc that doesn't exist.

## Features

- **Documents:** create, rename (inline title, synced live to collaborators), delete (owner only), autosave. The dashboard lists **My documents** and **Shared with me** separately.
- **Rich text:** text styles (Normal, Heading 1–3), font family, font size with −/+ buttons or a typed value (6–96 pt, Ctrl/⌘+Shift+> and <), bold, italic, underline, strikethrough, text and highlight color, clear formatting, bulleted and numbered lists, and undo/redo (per-user, collaboration-aware). Style values are checked against an allowlist before display, so a tampered client can't inject CSS into other people's editors.
- **Real-time collaboration:** Yjs-based editing, so concurrent edits merge without conflicts. Live named carets, presence avatars, and which line each person is on (click to jump there).
- **Sharing:** the owner grants **Can edit** or **Can view** by email, including to people who haven't signed up yet. Role changes and revocations take effect immediately, including for open sessions.
- **Connection safety:** an offline/reconnecting banner with editing locked, a save indicator ("Saving…" / "All changes saved"), and a warning before closing a tab with unsynced edits.
- **Import:** `.txt`, `.md`, `.docx` → a new document. Unsupported types, oversized files and malformed files are rejected with clear messages.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, Tiptap 3 editor. Deployed on **Vercel** |
| Backend | Node + Express 5 (REST) and Hocuspocus 4 (Yjs WebSocket server) in **one process**. Deployed on **Render** |
| Auth | Supabase Auth: magic link, plus password login for the seeded demo accounts only |
| Database | Supabase Postgres. RLS on, with no client access (see Architecture) |
| Tests | Vitest + Supertest, plus real WebSocket clients against an in-process Hocuspocus server |

## Run locally

Prerequisites: Node 20.19+ (22 recommended) and a free [Supabase](https://supabase.com) project.

1. **Supabase setup** (about 5 minutes)
   - Under **Connect → Session pooler**, copy the connection URI for `DATABASE_URL`, filling in your database password. Use the session pooler, not "Direct connection": the direct one is IPv6-only on the free plan.
   - Under Authentication → URL Configuration, set the Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to the Redirect URLs. When you deploy, also add `https://<your-vercel-app>/auth/callback`.
   - Under Authentication → Sign In / Providers → Email, keep it enabled and keep **Confirm email** on.
   - Recommended: Supabase's built-in email sender allows only **2 emails per hour for the whole project**. Connect a free SMTP sender (Brevo, or Gmail with an app password) under Authentication → Emails → SMTP Settings, then raise Authentication → Rate Limits → emails per hour. For Brevo: host `smtp-relay.brevo.com`, username = the `…@smtp-brevo.com` login, password = an SMTP key. If sending times out (HTTP 504), switch the port between `587` and `465`. Demo accounts use password login and are unaffected.
   - Under Project Settings → API Keys, copy the project URL, the **publishable** key and the **secret** key.

2. **Server**
   ```bash
   cd server
   cp .env.example .env     # fill SUPABASE_URL, SUPABASE_SECRET_KEY, DATABASE_URL, DEMO_PASSWORD
   npm ci
   npm run migrate          # creates/updates tables (tracked in schema_migrations; safe to re-run)
   npm run seed             # creates demo users + a shared welcome doc (optional)
   npm run dev              # http://localhost:4000
   ```

3. **Web**
   ```bash
   cd web
   cp .env.example .env.local   # fill the NEXT_PUBLIC_* values
   npm ci
   npm run dev                  # http://localhost:3000
   ```

4. **Tests:** `cd server && npm test`. No Supabase is needed; tests use an in-memory repository.

From the repo root, `npm run check` runs the server typecheck and tests, the web lint, and a production build.

## Deploy

**Server → Render.** New → Blueprint, then select this repo; [`render.yaml`](render.yaml) configures it. Set:
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `DATABASE_URL` (migrations run during the build, so every deploy brings the database up to date)
- `WEB_ORIGINS` = `https://<your-vercel-app>` (comma-separated, so you can also add localhost)

The health check is `/health`.

**Web → Vercel.** Import the repo with **Root Directory = `web`** and set:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_API_URL=https://<render-service>.onrender.com`
- `NEXT_PUBLIC_DEMO_PASSWORD` (optional)

The WebSocket URL is derived automatically (`https` → `wss`).

Then add the Vercel URL to Supabase's Redirect URLs.

## Status

**Working:** everything listed under Features, covered by 53 automated server tests, with typecheck, lint and production build all passing.

**Not done / known limitations**
- No automated browser (end-to-end) tests yet. The UI was verified by building and type-checking; the two-browser flows are tested at the protocol level (real WebSocket clients) in `server/src/collab.test.ts`.
- One server instance. Hocuspocus keeps open documents in memory, so scaling out would need its Redis extension.
- Editing is locked while offline (by design, per the brief). Edits typed just before a disconnect are kept in memory and synced on reconnect, but are lost if the tab is closed while still offline. The tab warns before closing in that case.
- "Saved" means the server received the edit. Writes to Postgres are debounced (1.5 s, max 8 s), and pending writes are flushed on shutdown.
- No version history, comments, export, or email notifications when something is shared.

**Next 2–4 hours:** Playwright end-to-end tests for the two-user flow; export to Markdown/PDF; version history from Yjs snapshots; an IndexedDB offline buffer (y-indexeddb); invite emails.

See [ARCHITECTURE.md](ARCHITECTURE.md) and [AI_WORKFLOW.md](AI_WORKFLOW.md).

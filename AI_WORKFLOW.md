# AI workflow note

## Tools
- **Claude Code** (CLI agent in VS Code): planning, scaffolding, implementation, test writing, and reading library source and type definitions.
- _Add any others you used._

## Where AI materially sped things up
- **Stack review before writing code.** The AI pushed back on my first plan:
  - MongoDB + Cloudinary + Supabase was three services where one would do.
  - Vercel can't host WebSockets.
  - Supabase's default email limits would block reviewers from testing magic links.

  This led to Supabase for both auth and database, Express + Hocuspocus on Render, and seeded demo accounts.
- **Evaluating existing code.** I suggested two existing projects as a starting point (a Socket.io collaborative editor repo, and Etherpad). The AI read the first repo's source and showed it sent the whole document on every keystroke, which loses edits under concurrency, and had no auth or rich text. It assessed Etherpad's read-only links and authentication model as incompatible with "no access even with the link". I decided not to build on either.
- **Fast reading of unfamiliar library versions.** Hocuspocus 4, Tiptap 3 and Next.js 16 all have APIs newer than most training data. The agent read the installed packages' type definitions and source before using them. That's how it confirmed, for example, how read-only connections are enforced on the server and which `closeConnections` semantics apply.
- **Test scaffolding**, especially the multi-client WebSocket integration tests for concurrent edits, refresh and revocation.

## What I changed or rejected
- **Rejected** both existing codebases (above).
- **Rejected** a Cloudinary-based attachment feature in favour of converting imports on the server, which needs no storage bucket.
- **Lint caught** three React "setState in effect" patterns in AI-written components. The title input was rewritten as a draft that falls back to the server title, with no syncing effect. Reviewing that rewrite also caught that pressing Escape would still save the edit, which was then fixed.
- _Add your own edits here._

## How correctness was verified
- **Tests caught a real bug:** sharing with `"  BOB@Example.com "` failed, because the email was validated *before* being trimmed and lowercased. The schema was fixed to normalize first.
- **53 server tests** (permission matrix, API access rules, import sanitization, and real WebSocket multi-client scenarios) run without external services.
- **Static checks:** `tsc` on both apps, ESLint (React hooks rules), and a `next build` production build.
- **Smoke test** of the compiled server: health check, 401 without a token, CORS preflight from the web origin, and WebSocket upgrade on the same port.
- **Manual UX check** in two browsers: _describe what you clicked through after deploying (concurrent typing, viewer lock, Wi-Fi off/on, revoke while open, import .docx)._

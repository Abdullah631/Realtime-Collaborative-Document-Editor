# Architecture note

## Shape

```
 Browser (Next.js on Vercel)
   ├── Supabase Auth ─────────── magic link / demo password → JWT
   ├── REST  ──HTTPS + Bearer JWT──▶ ┐
   └── Yjs   ──WSS + JWT──────────▶  ├ Node server on Render (one process)
                                     │   Express 5: documents, sharing, import
                                     │   Hocuspocus 4: realtime sync + presence
                                     └──▶ Supabase Postgres (service role)
```

Vercel can't hold WebSockets, so the realtime server has to be a long-running process. I put the REST API in the **same** process. The result is one deployable unit, one place that makes authorization decisions, and the REST API can notify live sessions directly (renames, revocations) without a message bus.

## What I prioritized, and why

1. **Access control that can't be bypassed.**
   - **One function** decides who can do what: `server/src/access.ts` (`getRole` + `can`). Both REST and WebSocket go through it.
   - **The browser has zero database access.** RLS is enabled with no policies and grants are revoked for the `anon`/`authenticated` roles. The publishable key in the JS bundle can't read a single row. Only the server, holding the secret key, touches the database, and it authorizes every call first.
   - **No access looks identical to "doesn't exist" (404).** Document IDs are random UUIDs, so knowing a link alone gives you nothing.
   - **Viewers are read-only on the server**, not just in the UI: their WebSocket connection is marked `readOnly` and Hocuspocus discards their document updates.
   - **Revocation is immediate.** An access-version registry invalidates open connections, so a revoked editor's next message is rejected, and their tab is told to show "You no longer have access".
   - **Tokens are verified on the server** against Supabase's signing keys. User identity always comes from the token, never from the request body.

2. **Correct concurrent editing instead of a custom locking scheme.**
   - Yjs (a CRDT) merges simultaneous edits deterministically, so there are no "last write wins" races to handle by hand.
   - The Yjs binary state is the source of truth. An HTML snapshot is stored next to it for future previews and export.

3. **Connection edge cases.**
   - Editing unlocks only when the connection is open **and** the initial sync has finished. This avoids duplicated content from typing into an empty document before the server state arrives.
   - It locks immediately on the browser's `offline` event, rather than waiting for a 30 s heartbeat.
   - When the browser comes back online, the client forces a reconnect.
   - Unsynced changes are counted. The UI shows "Saving…" and warns before the tab closes.
   - Refresh scenarios:
     - **Some users refresh:** the server keeps the document in memory while anyone is connected.
     - **Everyone refreshes:** the last disconnect saves it to Postgres.
     - **The server restarts:** pending saves are flushed on SIGTERM.

   These are covered by the integration tests.

4. **Product polish where reviewers spend time:** the editor page (a page-like canvas, toolbar, named carets, "who's on which line"), clear empty, error and permission states, and one-click demo accounts so the sharing flow can be tested in seconds.

## Deliberate scope cuts

| Cut | Why |
|---|---|
| Attachments / file storage service | Import-as-new-document is the more useful upload flow and needs no storage bucket: the file is converted on the server and discarded. |
| Image, link and table support in the editor | Each adds sanitization and UI work. The brief asks for basic formatting. |
| Version history, comments, export | Optional stretch work. I chose real-time presence instead, because the rest of the architecture (Yjs) makes it cheap. |
| Horizontal scaling | One Render instance is enough here. The fix is known (Hocuspocus Redis extension). |
| Offline editing | The brief asked for Google-Docs-style locking while disconnected. Yjs would allow full offline editing later via IndexedDB. |

## Data model

```sql
documents(id uuid pk, owner_id → auth.users, owner_email, title, ydoc_state text /*base64 Yjs*/, content_html, created_at, updated_at)
document_shares(document_id → documents on delete cascade, email, role in ('viewer','editor'), pk(document_id, email))
```

Shares are keyed by **email**, which lets you share with someone who hasn't signed up yet. Supabase only issues a session after the email is verified (magic link or confirmed sign-up), so a verified email claim is a sound identity to match against.

## Security notes
- File import: the extension is allow-listed, there's a 5 MB limit, the `.docx` file signature is checked, text must be valid UTF-8, and imports are rate-limited.
- Imported HTML is parsed against the editor schema, which removes scripts, event handlers, iframes and images (this is tested). Plain text is escaped, not interpreted.
- Inputs are validated with zod: title length, email format, role enum.
- Helmet security headers, a CORS allow-list, and a rate limit on the API.
- Redirects after login only go to same-site paths, which prevents open redirects.

## Testing strategy
`server/src/*.test.ts` has 53 tests:
- **access:** the full role × action permission matrix and role resolution.
- **api:** stranger, viewer and editor access across every endpoint, input validation, import errors, and revocation.
- **collab:** real Hocuspocus and real WebSocket clients:
  - three-user concurrent edits converge;
  - partial and full refresh;
  - persistence and reload;
  - viewer tampering is rejected;
  - mid-session revocation;
  - live rename broadcast.
- **importer:** markdown, docx and txt conversion; script/HTML injection stripped.

Storage sits behind a `DocumentRepo` interface. Tests use an in-memory implementation, so they're fast and need no network.

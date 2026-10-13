-- 001: initial schema. Applied by `npm run migrate` (or paste into the Supabase SQL editor; idempotent).
--
-- Security model: the browser never queries these tables. All access goes
-- through the Express API / realtime server using the service-role key,
-- which authorizes every request (server/src/access.ts). RLS is enabled
-- with NO policies and privileges are revoked, so the public anon key
-- (which ships in the frontend bundle) can read or write nothing here.

create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  owner_email  text not null,
  title        text not null default 'Untitled document'
               check (char_length(btrim(title)) between 1 and 200),
  ydoc_state   text,          -- base64-encoded Yjs document state (source of truth)
  content_html text,          -- HTML snapshot for previews/export
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists documents_owner_idx on public.documents (owner_id, updated_at desc);

-- Shares are keyed by email so you can share with someone before they sign up.
create table if not exists public.document_shares (
  document_id uuid not null references public.documents (id) on delete cascade,
  email       text not null check (email = lower(btrim(email)) and position('@' in email) > 1),
  role        text not null check (role in ('viewer', 'editor')),
  created_at  timestamptz not null default now(),
  primary key (document_id, email)
);

create index if not exists document_shares_email_idx on public.document_shares (email);

alter table public.documents enable row level security;
alter table public.document_shares enable row level security;

revoke all on public.documents from anon, authenticated;
revoke all on public.document_shares from anon, authenticated;

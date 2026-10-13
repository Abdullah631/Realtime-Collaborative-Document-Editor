/**
 * Applies pending SQL migrations from server/migrations in filename order.
 * Each file runs in its own transaction and is recorded in public.schema_migrations,
 * so this is safe to run on every deploy. Usage: npm run migrate  (needs DATABASE_URL)
 *
 * Plain JS (no tsx) so it also runs in the Render build step.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL is not set.\n" +
      "Supabase dashboard -> Connect -> Session pooler -> copy the URI into server/.env as DATABASE_URL\n" +
      "(replace [YOUR-PASSWORD] with your database password).",
  );
  process.exit(1);
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const files = (await readdir(dir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();

const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 15 });

try {
  await sql`
    create table if not exists public.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`;
  await sql`alter table public.schema_migrations enable row level security`;
  await sql`revoke all on public.schema_migrations from anon, authenticated`;

  // Serialize concurrent runs (e.g. two deploys at once).
  await sql`select pg_advisory_lock(hashtext('ajaia_docs_migrations'))`;

  const applied = new Set((await sql`select name from public.schema_migrations`).map((r) => r.name));
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log(`Database is up to date (${files.length} migration${files.length === 1 ? "" : "s"}).`);
  }
  for (const file of pending) {
    const body = await readFile(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into public.schema_migrations (name) values (${file})`;
    });
    console.log(`Applied ${file}`);
  }

  // Make Supabase's REST API see new/changed tables immediately.
  if (pending.length > 0) await sql`notify pgrst, 'reload schema'`;
} catch (err) {
  console.error(`Migration failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

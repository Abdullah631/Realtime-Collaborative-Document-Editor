/**
 * Creates the demo accounts reviewers use to test sharing, plus one shared document.
 * Safe to re-run. Usage: npm run seed   (reads server/.env)
 */
import { loadConfig } from "../src/config.js";
import { htmlToYState } from "../src/editorSchema.js";
import { SupabaseRepo } from "../src/repo.supabase.js";
import { createAdminClient } from "../src/supabase.js";

const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
if (!DEMO_PASSWORD || DEMO_PASSWORD.length < 8) {
  console.error("Set DEMO_PASSWORD (min 8 chars) — it must match NEXT_PUBLIC_DEMO_PASSWORD in the web app.");
  process.exit(1);
}

const DEMO_USERS = ["alice@example.com", "bob@example.com", "carol@example.com"];

const config = loadConfig();
const admin = createAdminClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY);
const repo = new SupabaseRepo(admin);

async function ensureUser(email: string) {
  const { data: list, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = list.users.find((u) => u.email === email);
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, { password: DEMO_PASSWORD });
    return existing.id;
  }
  const { data, error: createError } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (createError) throw createError;
  return data.user.id;
}

const [aliceId] = await Promise.all(DEMO_USERS.map(ensureUser));
console.log(`Demo users ready: ${DEMO_USERS.join(", ")}`);

const owned = await repo.listOwned(aliceId);
if (!owned.some((d) => d.title === "Welcome to Ajaia Docs")) {
  const html = `
    <h1>Welcome to Ajaia Docs</h1>
    <p>This document is <strong>owned by Alice</strong> and shared with <em>Bob (editor)</em> and <u>Carol (viewer)</u>.</p>
    <h2>Try this</h2>
    <ol>
      <li><p>Open this doc as Alice and Bob in two browsers and type at the same time.</p></li>
      <li><p>Open it as Carol: the editor is read-only.</p></li>
      <li><p>Turn off your Wi-Fi: editing locks until you reconnect.</p></li>
    </ol>
    <ul><li><p>Bulleted lists work too.</p></li></ul>`;
  const doc = await repo.create({
    ownerId: aliceId,
    ownerEmail: DEMO_USERS[0],
    title: "Welcome to Ajaia Docs",
    state: htmlToYState(html),
    html,
  });
  await repo.upsertShare(doc.id, { email: DEMO_USERS[1], role: "editor" });
  await repo.upsertShare(doc.id, { email: DEMO_USERS[2], role: "viewer" });
  console.log("Created shared welcome document.");
}

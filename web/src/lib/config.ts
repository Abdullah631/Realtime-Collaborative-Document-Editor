// NEXT_PUBLIC_* values are inlined at build time, so they must be referenced literally.
// Trimmed because values pasted into hosting dashboards often carry a trailing newline.
const clean = (v: string | undefined) => (v ?? "").trim();
const apiUrl = (clean(process.env.NEXT_PUBLIC_API_URL) || "http://localhost:4000").replace(/\/+$/, "");

export const config = {
  supabaseUrl: clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  // The public "anon"/publishable key. Safe in the browser: the database denies it everything.
  supabaseKey: clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  apiUrl,
  collabUrl: clean(process.env.NEXT_PUBLIC_COLLAB_URL) || apiUrl.replace(/^http/, "ws"),
  // Optional: shows one-click demo logins for the seeded reviewer accounts.
  demoPassword: clean(process.env.NEXT_PUBLIC_DEMO_PASSWORD),
  demoUsers: [
    { email: "alice@example.com", label: "Alice", hint: "owns the welcome doc" },
    { email: "bob@example.com", label: "Bob", hint: "editor on it" },
    { email: "carol@example.com", label: "Carol", hint: "viewer on it" },
  ],
};

export const SUPPORTED_IMPORTS = ".txt, .md, .docx";
export const MAX_IMPORT_MB = 5;

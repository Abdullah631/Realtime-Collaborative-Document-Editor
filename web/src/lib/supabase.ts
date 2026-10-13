import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

// Used for authentication only. Document data never goes through this client.
export const supabase = createClient(config.supabaseUrl || "http://localhost", config.supabaseKey || "missing-key", {
  auth: {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthUser } from "./access.js";
import { normalizeEmail } from "./access.js";

export function createAdminClient(url: string, secretKey: string): SupabaseClient {
  return createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Verifies a Supabase access token. With asymmetric signing keys this is a local
 * signature check against the cached JWKS; legacy projects fall back to the Auth API.
 */
export function createTokenVerifier(admin: SupabaseClient) {
  return async (token: string): Promise<AuthUser | null> => {
    try {
      const { data, error } = await admin.auth.getClaims(token);
      const claims = data?.claims;
      if (error || !claims?.sub || typeof claims.email !== "string" || !claims.email) return null;
      if (claims.role !== "authenticated" || claims.is_anonymous) return null;
      return { id: claims.sub, email: normalizeEmail(claims.email) };
    } catch {
      return null;
    }
  };
}

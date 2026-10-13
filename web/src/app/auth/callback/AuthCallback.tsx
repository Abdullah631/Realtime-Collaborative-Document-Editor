"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { FullPageSpinner, useAuth } from "@/lib/auth";

/**
 * Landing page for the magic link. The Supabase client exchanges the `?code=`
 * for a session on load (PKCE), which requires opening the link in the same
 * browser that requested it. Always continues to the dashboard.
 */
export function AuthCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const { session } = useAuth();
  const urlError = params.get("error_description");

  useEffect(() => {
    if (session) {
      router.replace("/");
      return;
    }
    const fail = (msg: string) => router.replace(`/login?error=${encodeURIComponent(msg)}`);
    if (urlError) {
      fail(urlError);
      return;
    }
    const t = setTimeout(
      () => fail("This sign-in link is invalid or expired. Links must be opened in the browser that requested them."),
      8000,
    );
    return () => clearTimeout(t);
  }, [session, urlError, router]);

  return <FullPageSpinner label="Signing you in…" />;
}

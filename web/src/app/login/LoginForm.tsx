"use client";

import { FileText, Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { colorFor } from "@/lib/colors";
import { config } from "@/lib/config";
import { supabase } from "@/lib/supabase";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { session } = useAuth();

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(params.get("error"));
  const [demoBusy, setDemoBusy] = useState<string | null>(null);

  // Signing in (or signing up) always lands on the dashboard.
  useEffect(() => {
    if (session) router.replace("/");
  }, [session, router]);

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Enter a valid email address.");
      return;
    }
    setStatus("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email: value,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setStatus("idle");
      setError(
        error.status === 429
          ? "The sign-in email limit was reached. Please try again later, or use a demo account below."
          : (error.status ?? 0) >= 500
            ? "We couldn't send the sign-in email right now. Please try again in a few minutes, or use a demo account below."
            : error.message,
      );
      return;
    }
    setStatus("sent");
  }

  async function demoLogin(demoEmail: string) {
    setError(null);
    setDemoBusy(demoEmail);
    const { error } = await supabase.auth.signInWithPassword({ email: demoEmail, password: config.demoPassword });
    setDemoBusy(null);
    if (error) setError(`Demo sign-in failed: ${error.message}`);
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2 text-neutral-900">
          <FileText className="size-7 text-blue-600" aria-hidden />
          <span className="text-xl font-semibold tracking-tight">Ajaia Docs</span>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          {status === "sent" ? (
            <div className="text-center" role="status">
              <Mail className="mx-auto mb-3 size-8 text-blue-600" aria-hidden />
              <h1 className="font-semibold">Check your email</h1>
              <p className="mt-2 text-sm text-neutral-600">
                We sent a sign-in link to <strong>{email.trim().toLowerCase()}</strong>. Open it in this browser to continue.
              </p>
              <button className="mt-4 text-sm text-blue-600 hover:underline" onClick={() => setStatus("idle")}>
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={sendLink} noValidate>
              <h1 className="text-lg font-semibold">Sign in</h1>
              <p className="mt-1 text-sm text-neutral-600">No password needed. We&apos;ll email you a magic link.</p>
              <label htmlFor="email" className="mt-5 block text-sm font-medium text-neutral-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="you@company.com"
              />
              <button
                type="submit"
                disabled={status === "sending"}
                className="mt-4 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {status === "sending" ? "Sending…" : "Send magic link"}
              </button>
            </form>
          )}

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
        </div>

        {config.demoPassword && (
          <div className="mt-6 rounded-xl border border-dashed border-neutral-300 bg-white/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Reviewer demo accounts</p>
            <div className="mt-3 grid gap-2">
              {config.demoUsers.map((u) => (
                <button
                  key={u.email}
                  onClick={() => demoLogin(u.email)}
                  disabled={demoBusy !== null}
                  className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-60"
                >
                  <span
                    className="flex size-7 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ background: colorFor(u.email) }}
                    aria-hidden
                  >
                    {u.label[0]}
                  </span>
                  <span className="flex-1">
                    <span className="font-medium">{demoBusy === u.email ? "Signing in…" : `Continue as ${u.label}`}</span>
                    <span className="block text-xs text-neutral-500">{u.hint}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-neutral-500">Use two different browsers (or a private window) to be two people at once.</p>
          </div>
        )}
      </div>
    </main>
  );
}

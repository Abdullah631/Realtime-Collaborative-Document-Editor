"use client";

import { Link2, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Avatar } from "../Avatar";
import { api, type Share } from "@/lib/api";

export function ShareDialog({ docId, title, ownerEmail, onClose }: { docId: string; title: string; ownerEmail: string; onClose: () => void }) {
  const [shares, setShares] = useState<Share[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Share["role"]>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
    api
      .listShares(docId)
      .then((r) => setShares(r.shares))
      .catch((e) => setError((e as Error).message));
  }, [docId]);

  async function run(action: () => Promise<{ shares: Share[] }>, success?: string) {
    setBusy(true);
    setError(null);
    try {
      setShares((await action()).shares);
      if (success) toast.success(success);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value) return;
    if (await run(() => api.share(docId, value, role), `Shared with ${value}`)) setEmail("");
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current.close()}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl p-0 shadow-xl backdrop:bg-black/30"
      aria-labelledby="share-title"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id="share-title" className="text-lg font-semibold">
            Share “<span className="break-all">{title}</span>”
          </h2>
          <button onClick={() => dialog.current?.close()} className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={add} className="mt-4 flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Add people by email"
            aria-label="Email address"
            autoFocus
            className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Share["role"])}
            aria-label="Permission"
            className="rounded-lg border border-neutral-300 px-2 text-sm"
          >
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <button type="submit" disabled={busy || !email.trim()} className="rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            Share
          </button>
        </form>
        {error && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <h3 className="mt-6 text-sm font-medium text-neutral-700">People with access</h3>
        <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
          <li className="flex items-center gap-3 py-1.5">
            <Avatar email={ownerEmail} />
            <span className="flex-1 truncate text-sm">{ownerEmail}</span>
            <span className="text-sm text-neutral-500">Owner</span>
          </li>
          {shares === null && !error && <li className="py-2 text-sm text-neutral-500">Loading…</li>}
          {shares?.map((s) => (
            <li key={s.email} className="flex items-center gap-3 py-1.5">
              <Avatar email={s.email} />
              <span className="flex-1 truncate text-sm">{s.email}</span>
              <select
                value={s.role}
                disabled={busy}
                onChange={(e) => run(() => api.share(docId, s.email, e.target.value as Share["role"]), "Permission updated")}
                aria-label={`Permission for ${s.email}`}
                className="rounded-md border border-transparent bg-transparent px-1 py-1 text-sm text-neutral-600 hover:border-neutral-300"
              >
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              <button
                onClick={() => run(() => api.unshare(docId, s.email), `Removed ${s.email}`)}
                disabled={busy}
                className="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                aria-label={`Remove ${s.email}`}
                title="Remove access"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-neutral-200 pt-4">
          <p className="text-xs text-neutral-500">Only people listed here can open this document, even with the link. They sign in with that email.</p>
          <button
            onClick={() => navigator.clipboard.writeText(window.location.href).then(() => toast.success("Link copied"))}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
          >
            <Link2 className="size-4" /> Copy link
          </button>
        </div>
      </div>
    </dialog>
  );
}

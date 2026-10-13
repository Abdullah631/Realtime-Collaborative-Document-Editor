"use client";

import { FileText, FileUp, Plus, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RoleBadge } from "./RoleBadge";
import { UserMenu } from "./UserMenu";
import { api, type DocumentMeta, type DocumentWithRole } from "@/lib/api";
import { displayName, timeAgo } from "@/lib/colors";
import { MAX_IMPORT_MB, SUPPORTED_IMPORTS } from "@/lib/config";

type Lists = { owned: DocumentMeta[]; shared: DocumentWithRole[] };

export function Dashboard({ email }: { email: string }) {
  const router = useRouter();
  const [lists, setLists] = useState<Lists | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "import" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(
    () =>
      api.listDocuments().then(
        (l) => {
          setLists(l);
          setLoadError(null);
        },
        (e: Error) => setLoadError(e.message),
      ),
    [],
  );

  useEffect(() => {
    load();
    // Pick up documents shared with me while this tab was in the background.
    const onFocus = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [load]);

  async function createDoc() {
    setBusy("create");
    try {
      const doc = await api.createDocument();
      router.push(`/d/${doc.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      // Always reset: Next keeps this page's state alive when navigating back to it.
      setBusy(null);
    }
  }

  async function importFile(file: File) {
    if (file.size > MAX_IMPORT_MB * 1024 * 1024) {
      toast.error(`File is larger than ${MAX_IMPORT_MB} MB.`);
      return;
    }
    setBusy("import");
    try {
      const doc = await api.importDocument(file);
      toast.success(`Imported “${doc.title}”`);
      router.push(`/d/${doc.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function deleteDoc(doc: DocumentMeta) {
    if (!confirm(`Delete “${doc.title}”? This can't be undone and removes access for everyone it's shared with.`)) return;
    try {
      await api.deleteDocument(doc.id);
      setLists((l) => l && { ...l, owned: l.owned.filter((d) => d.id !== doc.id) });
      toast.success("Document deleted");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <FileText className="size-5 text-blue-600" aria-hidden /> Ajaia Docs
          </Link>
          <UserMenu email={email} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={createDoc}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          >
            <Plus className="size-4" /> {busy === "create" ? "Creating…" : "New document"}
          </button>
          <button
            onClick={() => fileInput.current?.click()}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60"
          >
            <FileUp className="size-4" /> {busy === "import" ? "Importing…" : "Import file"}
          </button>
          <span className="text-xs text-neutral-500">
            Import {SUPPORTED_IMPORTS} (max {MAX_IMPORT_MB} MB) as a new editable document
          </span>
          <input
            ref={fileInput}
            type="file"
            accept=".txt,.md,.markdown,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) importFile(file);
            }}
          />
        </div>

        {loadError ? (
          <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
            {loadError}{" "}
            <button className="font-medium underline" onClick={load}>
              Retry
            </button>
          </div>
        ) : !lists ? (
          <div className="mt-8 space-y-2" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-neutral-200/60" />
            ))}
          </div>
        ) : (
          <>
            <Section title="My documents" icon={<FileText className="size-4" />} empty="No documents yet. Create one or import a file.">
              {lists.owned.map((d) => (
                <DocRow key={d.id} doc={d} meta={`Edited ${timeAgo(d.updatedAt)}`} onDelete={() => deleteDoc(d)} />
              ))}
            </Section>
            <Section title="Shared with me" icon={<Users className="size-4" />} empty="Nothing has been shared with you yet.">
              {lists.shared.map((d) => (
                <DocRow
                  key={d.id}
                  doc={d}
                  badge={<RoleBadge role={d.role} />}
                  meta={`Shared by ${displayName(d.ownerEmail)} · edited ${timeAgo(d.updatedAt)}`}
                />
              ))}
            </Section>
          </>
        )}
      </main>
    </div>
  );
}

function Section({ title, icon, empty, children }: { title: string; icon: React.ReactNode; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-700">
        {icon} {title} <span className="font-normal text-neutral-400">{children.length}</span>
      </h2>
      {children.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 bg-white">{children}</ul>
      )}
    </section>
  );
}

function DocRow({ doc, meta, badge, onDelete }: { doc: DocumentMeta; meta: string; badge?: React.ReactNode; onDelete?: () => void }) {
  return (
    <li className="group flex items-center gap-3 px-4 py-3 hover:bg-neutral-50">
      <FileText className="size-5 shrink-0 text-blue-600" aria-hidden />
      <Link href={`/d/${doc.id}`} className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-neutral-900">{doc.title}</span>
        <span className="block truncate text-xs text-neutral-500">{meta}</span>
      </Link>
      {badge}
      {onDelete && (
        <button
          onClick={onDelete}
          className="rounded-md p-1.5 text-neutral-400 opacity-0 hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
          title="Delete document"
          aria-label={`Delete ${doc.title}`}
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </li>
  );
}

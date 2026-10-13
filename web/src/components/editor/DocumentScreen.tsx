"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { ArrowLeft, Cloud, CloudOff, FileText, Loader2, Lock, Share2, WifiOff } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RoleBadge } from "../RoleBadge";
import { UserMenu } from "../UserMenu";
import { buildExtensions, type CollabUser } from "./extensions";
import { PresenceAvatars, PresenceLines, usePeers } from "./PresenceBar";
import { ShareDialog } from "./ShareDialog";
import { Toolbar } from "./Toolbar";
import { useCollabSession, type CollabState, type ConnectionInfo, type ServerEvent } from "./useCollabSession";
import { api, ApiError, type DocumentWithRole } from "@/lib/api";
import { FullPageSpinner } from "@/lib/auth";
import { colorFor, displayName } from "@/lib/colors";
import { supabase } from "@/lib/supabase";

type Fatal = { kind: "not-found" | "revoked" | "deleted" } | { kind: "error"; message: string };

/** Loads document metadata, then mounts a live editing session. Handles access changes and fatal states. */
export function DocumentScreen({ docId, email }: { docId: string; email: string }) {
  const [meta, setMeta] = useState<DocumentWithRole | null>(null);
  const [fatal, setFatal] = useState<Fatal | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  const authRetried = useRef(false);

  const load = useCallback(
    () =>
      api.getDocument(docId).then(
        (doc) => {
          setMeta(doc);
          setFatal(null);
        },
        (e: Error) =>
          setFatal(e instanceof ApiError && e.status === 404 ? { kind: "not-found" } : { kind: "error", message: e.message }),
      ),
    [docId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const onAccessChanged = useCallback(async () => {
    try {
      const next = await api.getDocument(docId);
      setMeta((prev) => {
        if (prev && prev.role !== next.role) toast.info(next.role === "viewer" ? "You now have view-only access." : "You can now edit this document.");
        return next;
      });
      setSessionKey((k) => k + 1); // reconnect with the new permission
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setFatal({ kind: "revoked" });
    }
  }, [docId]);

  const onAuthFailed = useCallback(
    async (reason: string) => {
      if (reason === "unauthenticated" && !authRetried.current) {
        // Expired token: refresh once and reconnect.
        authRetried.current = true;
        const { error } = await supabase.auth.refreshSession();
        if (!error) {
          setSessionKey((k) => k + 1);
          return;
        }
      }
      setFatal(reason === "unauthenticated" ? { kind: "error", message: "Your session expired. Please sign in again." } : { kind: "revoked" });
    },
    [],
  );

  if (fatal) return <FatalScreen fatal={fatal} email={email} onRetry={load} />;
  if (!meta) return <FullPageSpinner label="Opening document…" />;

  return (
    <LiveDocument
      key={sessionKey}
      meta={meta}
      email={email}
      onTitle={(title) => setMeta((m) => m && { ...m, title })}
      onEvent={(event) => {
        if (event.type === "title") setMeta((m) => m && { ...m, title: event.title });
        if (event.type === "access-changed") onAccessChanged();
        if (event.type === "deleted") setFatal({ kind: "deleted" });
      }}
      onAuthFailed={onAuthFailed}
    />
  );
}

interface LiveProps {
  meta: DocumentWithRole;
  email: string;
  onTitle: (title: string) => void;
  onEvent: (event: ServerEvent) => void;
  onAuthFailed: (reason: string) => void;
}

function LiveDocument(props: LiveProps) {
  const { session, info } = useCollabSession(props.meta.id, { onEvent: props.onEvent, onAuthFailed: props.onAuthFailed });
  if (!session) return <FullPageSpinner label="Connecting…" />;
  return <EditorLayout {...props} session={session} info={info} />;
}

function EditorLayout({ meta, email, onTitle, session, info }: LiveProps & { session: CollabState; info: ConnectionInfo }) {
  const [sharing, setSharing] = useState(false);
  const canEdit = meta.role !== "viewer";
  const live = info.online && info.connected && info.synced;
  const editable = canEdit && live;

  const [user] = useState<CollabUser>(() => ({ name: displayName(email), email, color: colorFor(email) }));
  const editor = useEditor(
    {
      extensions: buildExtensions(session.ydoc, session.provider, user, canEdit ? "Start typing…" : ""),
      editable: false, // unlocked below once connected and synced
      immediatelyRender: false,
      editorProps: { attributes: { "aria-label": "Document content", spellcheck: "true" } },
    },
    [session],
  );

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editor, editable]);

  const peers = usePeers(session.provider, editor, email);

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[#f9fbfd]">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 pt-3">
          <Link href="/" className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100" aria-label="Back to documents" title="All documents">
            <ArrowLeft className="size-5" />
          </Link>
          <FileText className="hidden size-7 shrink-0 text-blue-600 sm:block" aria-hidden />
          <div className="min-w-0 flex-1">
            <TitleInput id={meta.id} title={meta.title} editable={canEdit} onRenamed={onTitle} />
            <div className="flex items-center gap-2 pl-1.5 text-xs text-neutral-500">
              {meta.role !== "owner" && <span>Owned by {meta.ownerEmail}</span>}
              <SaveStatus info={info} />
            </div>
          </div>
          {editor && <PresenceAvatars peers={peers} editor={editor} />}
          {meta.role !== "owner" && <RoleBadge role={meta.role} />}
          {meta.role === "owner" && (
            <button
              onClick={() => setSharing(true)}
              className="inline-flex items-center gap-2 rounded-full bg-[#c2e7ff] px-4 py-2 text-sm font-medium text-[#001d35] hover:bg-[#b3dcf7]"
            >
              <Share2 className="size-4" /> Share
            </button>
          )}
          <UserMenu email={email} />
        </div>
        <div className="flex flex-col gap-2 px-4 py-2">
          {editor && <Toolbar editor={editor} disabled={!editable} />}
          {editor && <PresenceLines peers={peers} editor={editor} />}
        </div>
        <ConnectionBanner info={info} canEdit={canEdit} />
      </header>

      <main className="flex-1 px-2 py-6 sm:px-6">
        <div className="doc-content mx-auto min-h-[calc(100vh-12rem)] w-full max-w-[816px] rounded-sm border border-neutral-200 bg-white px-6 py-10 shadow-sm sm:px-[72px] sm:py-16">
          {editor ? <EditorContent editor={editor} /> : <FullPageSpinner label="Loading editor…" />}
        </div>
      </main>

      {sharing && <ShareDialog docId={meta.id} title={meta.title} ownerEmail={meta.ownerEmail} onClose={() => setSharing(false)} />}
    </div>
  );
}

function TitleInput({ id, title, editable, onRenamed }: { id: string; title: string; editable: boolean; onRenamed: (t: string) => void }) {
  // While focused, show my draft; otherwise show the latest title (including collaborators' renames).
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  async function commit(value: string) {
    setDraft(null);
    const next = value.trim();
    if (!next || next === title) return;
    onRenamed(next); // optimistic
    try {
      onRenamed((await api.renameDocument(id, next)).title);
    } catch (e) {
      toast.error((e as Error).message);
      onRenamed(title);
    }
  }

  return (
    <input
      value={draft ?? title}
      readOnly={!editable}
      maxLength={200}
      aria-label="Document title"
      onFocus={() => editable && setDraft(title)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (cancelled.current || draft === null) setDraft(null);
        else commit(draft);
        cancelled.current = false;
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      className="w-full max-w-xl truncate rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-lg text-neutral-900 outline-none hover:border-neutral-300 focus:border-blue-500 read-only:hover:border-transparent"
    />
  );
}

function SaveStatus({ info }: { info: ConnectionInfo }) {
  if (!info.online || (info.everConnected && !info.connected))
    return (
      <span className="inline-flex items-center gap-1 text-amber-700">
        <CloudOff className="size-3.5" /> Offline
      </span>
    );
  if (!info.synced)
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="size-3.5 animate-spin" /> Connecting…
      </span>
    );
  if (info.unsynced > 0)
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="size-3.5 animate-spin" /> Saving…
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1">
      <Cloud className="size-3.5" /> All changes saved
    </span>
  );
}

function ConnectionBanner({ info, canEdit }: { info: ConnectionInfo; canEdit: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (info.everConnected) return;
    const t = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(t);
  }, [info.everConnected]);

  const pending = info.unsynced > 0 ? " Your recent changes are kept and will sync automatically." : "";

  if (!info.online)
    return (
      <Banner tone="warn" icon={<WifiOff className="size-4" />}>
        You&apos;re offline. Editing is paused until your connection is back.{pending}
      </Banner>
    );
  if (info.everConnected && !info.connected)
    return (
      <Banner tone="warn" icon={<Loader2 className="size-4 animate-spin" />}>
        Not connected. Trying to reconnect… Editing is paused.{pending}
      </Banner>
    );
  if (!info.everConnected && slow)
    return (
      <Banner tone="info" icon={<Loader2 className="size-4 animate-spin" />}>
        Connecting to the server… The free hosting tier can take up to a minute to wake up.
      </Banner>
    );
  if (!canEdit && info.connected)
    return (
      <Banner tone="info" icon={<Lock className="size-4" />}>
        You have view-only access. Ask the owner for edit access.
      </Banner>
    );
  return null;
}

function Banner({ tone, icon, children }: { tone: "warn" | "info"; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={`flex items-center justify-center gap-2 px-4 py-2 text-sm ${tone === "warn" ? "bg-amber-50 text-amber-900" : "bg-blue-50 text-blue-900"}`}
    >
      {icon}
      <span>{children}</span>
    </div>
  );
}

function FatalScreen({ fatal, email, onRetry }: { fatal: Fatal; email: string; onRetry: () => void }) {
  const content = {
    "not-found": {
      title: "Document not found",
      body: `This document doesn't exist, or it hasn't been shared with ${email}. Ask the owner to share it with this email.`,
    },
    revoked: { title: "You no longer have access", body: "The owner removed your access to this document." },
    deleted: { title: "This document was deleted", body: "The owner deleted this document." },
    error: { title: "Something went wrong", body: fatal.kind === "error" ? fatal.message : "" },
  }[fatal.kind];

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md text-center">
        <Lock className="mx-auto size-10 text-neutral-400" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold">{content.title}</h1>
        <p className="mt-2 text-sm text-neutral-600">{content.body}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Back to documents
          </Link>
          {fatal.kind === "error" && (
            <button onClick={onRetry} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50">
              Try again
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

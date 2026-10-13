"use client";

import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { Editor } from "@tiptap/react";
import { relativePositionToAbsolutePosition, ySyncPluginKey } from "@tiptap/y-tiptap";
import { useEffect, useState } from "react";
import * as Y from "yjs";
import { Avatar } from "../Avatar";
import type { CollabUser } from "./extensions";

export interface Peer {
  clientId: number;
  user: CollabUser;
  /** 1-based text block ("line") the peer's cursor is in; null if they have no cursor (e.g. viewers). */
  line: number | null;
  pos: number | null;
}

/** Converts a collaborator's Yjs-relative cursor into a document position and line number. */
function locate(editor: Editor, head: unknown): { pos: number; line: number } | null {
  try {
    const ystate = ySyncPluginKey.getState(editor.state);
    if (!ystate?.binding || !head) return null;
    const rel = Y.createRelativePositionFromJSON(head);
    const pos = relativePositionToAbsolutePosition(ystate.doc, ystate.type, rel, ystate.binding.mapping);
    if (pos == null) return null;
    const clamped = Math.min(Math.max(pos, 0), editor.state.doc.content.size);
    let line = 0;
    editor.state.doc.nodesBetween(0, clamped, (node) => {
      if (node.isTextblock) {
        line++;
        return false;
      }
      return true;
    });
    return { pos: clamped, line: Math.max(line, 1) };
  } catch {
    return null;
  }
}

/** Everyone else in the document (one entry per person, even with several tabs open). */
export function usePeers(provider: HocuspocusProvider, editor: Editor | null, me: string): Peer[] {
  const [peers, setPeers] = useState<Peer[]>([]);

  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness || !editor) return;

    const compute = () => {
      const byEmail = new Map<string, Peer>();
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const user = state.user as CollabUser | undefined;
        // Skip myself, including my other tabs on the same document.
        if (!user?.email || user.email === me) return;
        const loc = locate(editor, (state.cursor as { head?: unknown } | undefined)?.head);
        const prev = byEmail.get(user.email);
        if (!prev || (prev.line === null && loc)) {
          byEmail.set(user.email, { clientId, user, line: loc?.line ?? null, pos: loc?.pos ?? null });
        }
      });
      setPeers([...byEmail.values()]);
    };

    compute();
    awareness.on("change", compute);
    editor.on("update", compute); // positions shift as text changes
    return () => {
      awareness.off("change", compute);
      editor.off("update", compute);
    };
  }, [provider, editor, me]);

  return peers;
}

function scrollTo(editor: Editor, pos: number | null) {
  if (pos === null) return;
  const { node } = editor.view.domAtPos(pos);
  (node instanceof Element ? node : node.parentElement)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

/** Avatars in the header. Click one to jump to that person's cursor. */
export function PresenceAvatars({ peers, editor }: { peers: Peer[]; editor: Editor }) {
  if (peers.length === 0) return null;
  return (
    <div className="flex items-center -space-x-1.5" aria-label="People in this document">
      {peers.slice(0, 5).map((p) => (
        <button
          key={p.clientId}
          type="button"
          onClick={() => scrollTo(editor, p.pos)}
          className="relative rounded-full transition-transform hover:z-10 hover:-translate-y-0.5"
          title={`${p.user.name} (${p.user.email}) — ${p.line ? `on line ${p.line}` : "viewing"}`}
        >
          <span className="block rounded-full p-0.5" style={{ background: p.user.color }}>
            <Avatar email={p.user.email} size={26} ring title="" />
          </span>
        </button>
      ))}
      {peers.length > 5 && (
        <span className="z-10 flex size-[30px] items-center justify-center rounded-full bg-neutral-200 text-xs font-medium text-neutral-700 ring-2 ring-white">
          +{peers.length - 5}
        </span>
      )}
    </div>
  );
}

/** "Bob is on line 4" summary under the toolbar. */
export function PresenceLines({ peers, editor }: { peers: Peer[]; editor: Editor }) {
  const located = peers.filter((p) => p.line !== null).sort((a, b) => a.line! - b.line!);
  if (located.length === 0) return null;
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500" aria-live="polite">
      {located.map((p) => (
        <button key={p.clientId} type="button" onClick={() => scrollTo(editor, p.pos)} className="inline-flex items-center gap-1.5 hover:text-neutral-800">
          <span className="size-2 rounded-full" style={{ background: p.user.color }} aria-hidden />
          {p.user.name} is on line {p.line}
        </button>
      ))}
    </p>
  );
}

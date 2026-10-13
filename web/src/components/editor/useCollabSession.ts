"use client";

import { HocuspocusProvider } from "@hocuspocus/provider";
import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { config } from "@/lib/config";
import { getAccessToken } from "@/lib/supabase";

export type ServerEvent = { type: "title"; title: string } | { type: "access-changed" } | { type: "deleted" };

export interface CollabHandlers {
  onEvent: (event: ServerEvent) => void;
  onAuthFailed: (reason: string) => void;
}

export interface CollabState {
  ydoc: Y.Doc;
  provider: HocuspocusProvider;
}

export interface ConnectionInfo {
  /** WebSocket is open and authenticated. */
  connected: boolean;
  /** Initial document state received from the server. */
  synced: boolean;
  /** Browser reports a network connection. */
  online: boolean;
  /** Local edits the server hasn't acknowledged yet. */
  unsynced: number;
  /** Has this session ever been connected? (distinguishes "connecting" from "lost connection") */
  everConnected: boolean;
}

/**
 * Owns the Y.Doc + WebSocket provider for one document and exposes connection
 * health. The provider reconnects with backoff on its own; we additionally
 * react to the browser's online/offline events so the UI locks immediately
 * rather than waiting for a heartbeat timeout.
 */
export function useCollabSession(docId: string, handlers: CollabHandlers) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const [session, setSession] = useState<CollabState | null>(null);
  const [info, setInfo] = useState<ConnectionInfo>({
    connected: false,
    synced: false,
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    unsynced: 0,
    everConnected: false,
  });

  useEffect(() => {
    const ydoc = new Y.Doc();
    const update = (patch: Partial<ConnectionInfo>) => setInfo((i) => ({ ...i, ...patch }));

    const provider = new HocuspocusProvider({
      url: config.collabUrl,
      name: docId,
      document: ydoc,
      token: getAccessToken, // fresh token on every (re)connect
      onAuthenticated: () => update({ connected: true, everConnected: true }),
      onSynced: ({ state }) => update({ synced: state }),
      onStatus: ({ status }) => {
        if (status !== "connected") update({ connected: false, synced: false });
      },
      onUnsyncedChanges: ({ number }) => update({ unsynced: number }),
      onAuthenticationFailed: ({ reason }) => handlersRef.current.onAuthFailed(reason),
      onStateless: ({ payload }) => {
        try {
          handlersRef.current.onEvent(JSON.parse(payload) as ServerEvent);
        } catch {
          /* ignore malformed */
        }
      },
    });

    const goOffline = () => update({ online: false, connected: false });
    const goOnline = () => {
      update({ online: true });
      // Drop the (probably dead) socket and reconnect now instead of waiting for backoff.
      provider.disconnect();
      provider.connect();
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    setSession({ ydoc, provider });

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      provider.destroy();
      ydoc.destroy();
      setSession(null);
      setInfo((i) => ({ ...i, connected: false, synced: false, unsynced: 0, everConnected: false }));
    };
  }, [docId]);

  // Warn before closing/refreshing the tab while edits are still in flight.
  useEffect(() => {
    if (info.unsynced === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [info.unsynced]);

  return { session, info };
}

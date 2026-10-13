import { Database } from "@hocuspocus/extension-database";
import { Server } from "@hocuspocus/server";
import { getRole, isUuid, type AuthUser, type Role } from "./access.js";
import { yDocToHTML } from "./editorSchema.js";
import type { DocumentRepo } from "./repo.js";

export type VerifyToken = (token: string) => Promise<AuthUser | null>;

export interface CollabContext {
  user: AuthUser;
  role: Role;
  grant: { doc: number; user: number };
}

/** Messages sent to clients over the Hocuspocus "stateless" channel. */
export type ServerEvent =
  | { type: "title"; title: string }
  | { type: "access-changed" }
  | { type: "deleted" };

const rejection = (reason: string) => Object.assign(new Error(reason), { reason });

/**
 * Tracks access changes so an already-open connection can't keep editing
 * after its permission was revoked or changed. Each connection records the
 * versions it authenticated against; any bump invalidates it.
 */
export class AccessRegistry {
  private versions = new Map<string, number>();
  get(docId: string, email?: string) {
    return this.versions.get(email ? `${docId}:${email}` : docId) ?? 0;
  }
  bump(docId: string, email?: string) {
    const key = email ? `${docId}:${email}` : docId;
    this.versions.set(key, this.get(docId, email) + 1);
  }
}

export interface CollabOptions {
  repo: DocumentRepo;
  verifyToken: VerifyToken;
  /** Debounce for persisting to the database, in ms. */
  debounce?: number;
  maxDebounce?: number;
}

export function createCollab({ repo, verifyToken, debounce = 1500, maxDebounce = 8000 }: CollabOptions) {
  const registry = new AccessRegistry();

  const server = new Server<CollabContext>({
    quiet: true,
    stopOnSignals: false,
    debounce,
    maxDebounce,
    websocketOptions: { maxPayload: 5 * 1024 * 1024 },

    async onAuthenticate({ token, documentName, connectionConfig }) {
      if (!isUuid(documentName)) throw rejection("not-found");
      const user = token ? await verifyToken(token) : null;
      if (!user) throw rejection("unauthenticated");
      const role = await getRole(repo, documentName, user);
      // Same answer for "missing" and "not shared with you".
      if (!role) throw rejection("not-found");

      // Viewers get a read-only connection: Hocuspocus drops their document updates server-side.
      connectionConfig.readOnly = role === "viewer";
      return {
        user,
        role,
        grant: { doc: registry.get(documentName), user: registry.get(documentName, user.email) },
      } satisfies CollabContext;
    },

    async beforeHandleMessage({ context, documentName }) {
      const stale =
        context.grant.doc !== registry.get(documentName) ||
        context.grant.user !== registry.get(documentName, context.user.email);
      if (stale) throw rejection("access-changed");
    },

    extensions: [
      new Database({
        fetch: async ({ documentName }) => repo.loadState(documentName),
        store: async ({ documentName, state, document }) => {
          await repo.saveState(documentName, state, yDocToHTML(document));
        },
      }),
    ],
  });

  const send = (docId: string, event: ServerEvent, filter: (ctx: CollabContext) => boolean = () => true) => {
    const doc = server.hocuspocus.documents.get(docId);
    if (!doc) return;
    for (const connection of doc.connections.keys()) {
      if (filter(connection.context)) connection.sendStateless(JSON.stringify(event));
    }
  };

  /** Close live connections whose permission changed. `email` omitted = everyone (document deleted). */
  const revoke = (docId: string, event: ServerEvent, email?: string) => {
    registry.bump(docId, email);
    const doc = server.hocuspocus.documents.get(docId);
    if (!doc) return;
    for (const connection of [...doc.connections.keys()]) {
      if (email && connection.context.user.email !== email) continue;
      connection.sendStateless(JSON.stringify(event));
      connection.close({ code: 4403, reason: event.type });
    }
  };

  return {
    server,
    registry,
    broadcastTitle: (docId: string, title: string) => send(docId, { type: "title", title }),
    accessChanged: (docId: string, email: string) => revoke(docId, { type: "access-changed" }, email),
    documentDeleted: (docId: string) => revoke(docId, { type: "deleted" }),
  };
}

export type Collab = ReturnType<typeof createCollab>;

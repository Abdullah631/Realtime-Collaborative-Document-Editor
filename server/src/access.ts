/**
 * The single source of truth for "who may do what" on a document.
 * Both the REST API and the realtime (WebSocket) server go through here.
 */
import type { DocumentRepo } from "./repo.js";

export type Role = "owner" | "editor" | "viewer";
export type ShareRole = Exclude<Role, "owner">;
export type Action = "read" | "edit" | "rename" | "delete" | "share";

export interface AuthUser {
  id: string;
  email: string;
}

const PERMISSIONS: Record<Role, ReadonlySet<Action>> = {
  owner: new Set<Action>(["read", "edit", "rename", "delete", "share"]),
  editor: new Set<Action>(["read", "edit", "rename"]),
  viewer: new Set<Action>(["read"]),
};

export function can(role: Role | null, action: Action): boolean {
  return role !== null && PERMISSIONS[role].has(action);
}

/** Pure role resolution, separated from I/O so it is trivially testable. */
export function resolveRole(
  doc: { ownerId: string } | null,
  share: { role: ShareRole } | null,
  user: AuthUser,
): Role | null {
  if (!doc) return null;
  if (doc.ownerId === user.id) return "owner";
  return share?.role ?? null;
}

export async function getRole(repo: DocumentRepo, documentId: string, user: AuthUser): Promise<Role | null> {
  const doc = await repo.getDocument(documentId);
  if (!doc) return null;
  if (doc.ownerId === user.id) return "owner";
  const share = await repo.getShare(documentId, user.email);
  return resolveRole(doc, share, user);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID_RE.test(v);

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

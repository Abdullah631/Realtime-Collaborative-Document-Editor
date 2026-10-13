import type { ShareRole } from "./access.js";

export interface DocumentMeta {
  id: string;
  ownerId: string;
  ownerEmail: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Share {
  email: string;
  role: ShareRole;
}

export interface NewDocument {
  ownerId: string;
  ownerEmail: string;
  title: string;
  /** Initial Yjs state, e.g. for imported files. */
  state?: Uint8Array;
  html?: string;
}

/**
 * Storage boundary. The production implementation is Supabase Postgres;
 * tests use the in-memory one so they run without any external service.
 */
export interface DocumentRepo {
  getDocument(id: string): Promise<DocumentMeta | null>;
  listOwned(ownerId: string): Promise<DocumentMeta[]>;
  listSharedWith(email: string): Promise<(DocumentMeta & { role: ShareRole })[]>;
  create(doc: NewDocument): Promise<DocumentMeta>;
  rename(id: string, title: string): Promise<DocumentMeta | null>;
  delete(id: string): Promise<void>;

  getShare(id: string, email: string): Promise<Share | null>;
  listShares(id: string): Promise<Share[]>;
  upsertShare(id: string, share: Share): Promise<void>;
  removeShare(id: string, email: string): Promise<boolean>;

  loadState(id: string): Promise<Uint8Array | null>;
  saveState(id: string, state: Uint8Array, html: string): Promise<void>;
}

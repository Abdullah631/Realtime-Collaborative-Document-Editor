import { randomUUID } from "node:crypto";
import type { DocumentMeta, DocumentRepo, NewDocument, Share } from "./repo.js";

interface StoredDoc extends DocumentMeta {
  state: Uint8Array | null;
  html: string | null;
  shares: Map<string, Share>;
}

/** In-memory repository used by the test suite. Mirrors the Postgres semantics. */
export class MemoryRepo implements DocumentRepo {
  docs = new Map<string, StoredDoc>();

  private meta(d: StoredDoc): DocumentMeta {
    const { id, ownerId, ownerEmail, title, createdAt, updatedAt } = d;
    return { id, ownerId, ownerEmail, title, createdAt, updatedAt };
  }

  async getDocument(id: string) {
    const d = this.docs.get(id);
    return d ? this.meta(d) : null;
  }

  async listOwned(ownerId: string) {
    return [...this.docs.values()].filter((d) => d.ownerId === ownerId).map((d) => this.meta(d));
  }

  async listSharedWith(email: string) {
    return [...this.docs.values()].flatMap((d) => {
      const s = d.shares.get(email);
      return s ? [{ ...this.meta(d), role: s.role }] : [];
    });
  }

  async create(doc: NewDocument) {
    const now = new Date().toISOString();
    const stored: StoredDoc = {
      id: randomUUID(),
      ownerId: doc.ownerId,
      ownerEmail: doc.ownerEmail,
      title: doc.title,
      createdAt: now,
      updatedAt: now,
      state: doc.state ?? null,
      html: doc.html ?? null,
      shares: new Map(),
    };
    this.docs.set(stored.id, stored);
    return this.meta(stored);
  }

  async rename(id: string, title: string) {
    const d = this.docs.get(id);
    if (!d) return null;
    d.title = title;
    d.updatedAt = new Date().toISOString();
    return this.meta(d);
  }

  async delete(id: string) {
    this.docs.delete(id);
  }

  async getShare(id: string, email: string) {
    return this.docs.get(id)?.shares.get(email) ?? null;
  }

  async listShares(id: string) {
    return [...(this.docs.get(id)?.shares.values() ?? [])];
  }

  async upsertShare(id: string, share: Share) {
    this.docs.get(id)?.shares.set(share.email, share);
  }

  async removeShare(id: string, email: string) {
    return this.docs.get(id)?.shares.delete(email) ?? false;
  }

  async loadState(id: string) {
    return this.docs.get(id)?.state ?? null;
  }

  async saveState(id: string, state: Uint8Array, html: string) {
    const d = this.docs.get(id);
    if (!d) return;
    d.state = state;
    d.html = html;
    d.updatedAt = new Date().toISOString();
  }
}

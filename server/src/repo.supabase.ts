import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShareRole } from "./access.js";
import type { DocumentMeta, DocumentRepo, NewDocument, Share } from "./repo.js";

const META_COLUMNS = "id, owner_id, owner_email, title, created_at, updated_at";

interface MetaRow {
  id: string;
  owner_id: string;
  owner_email: string;
  title: string;
  created_at: string;
  updated_at: string;
}

const toMeta = (r: MetaRow): DocumentMeta => ({
  id: r.id,
  ownerId: r.owner_id,
  ownerEmail: r.owner_email,
  title: r.title,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// Yjs state is stored as base64 text: PostgREST's bytea handling is awkward
// and documents in this app are small.
const encodeState = (s: Uint8Array) => Buffer.from(s).toString("base64");
const decodeState = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Database error: ${res.error.message}`);
  return res.data;
}

/** Uses the service-role client: RLS is bypassed, so every caller must authorize first (see access.ts). */
export class SupabaseRepo implements DocumentRepo {
  constructor(private db: SupabaseClient) {}

  async getDocument(id: string) {
    const row = check(await this.db.from("documents").select(META_COLUMNS).eq("id", id).maybeSingle());
    return row ? toMeta(row) : null;
  }

  async listOwned(ownerId: string) {
    const rows = check(
      await this.db.from("documents").select(META_COLUMNS).eq("owner_id", ownerId).order("updated_at", { ascending: false }),
    );
    return (rows ?? []).map(toMeta);
  }

  async listSharedWith(email: string) {
    const rows = check(
      await this.db.from("document_shares").select(`role, documents!inner(${META_COLUMNS})`).eq("email", email),
    ) as unknown as { role: ShareRole; documents: MetaRow }[];
    return rows
      .map((r) => ({ ...toMeta(r.documents), role: r.role }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async create(doc: NewDocument) {
    const row = check(
      await this.db
        .from("documents")
        .insert({
          owner_id: doc.ownerId,
          owner_email: doc.ownerEmail,
          title: doc.title,
          ydoc_state: doc.state ? encodeState(doc.state) : null,
          content_html: doc.html ?? null,
        })
        .select(META_COLUMNS)
        .single(),
    );
    if (!row) throw new Error("Database error: insert returned no row");
    return toMeta(row);
  }

  async rename(id: string, title: string) {
    const row = check(
      await this.db
        .from("documents")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select(META_COLUMNS)
        .maybeSingle(),
    );
    return row ? toMeta(row) : null;
  }

  async delete(id: string) {
    check(await this.db.from("documents").delete().eq("id", id));
  }

  async getShare(id: string, email: string) {
    return check(
      await this.db.from("document_shares").select("email, role").eq("document_id", id).eq("email", email).maybeSingle(),
    ) as Share | null;
  }

  async listShares(id: string) {
    return check(
      await this.db.from("document_shares").select("email, role").eq("document_id", id).order("created_at"),
    ) as Share[];
  }

  async upsertShare(id: string, share: Share) {
    check(
      await this.db
        .from("document_shares")
        .upsert({ document_id: id, email: share.email, role: share.role }, { onConflict: "document_id,email" }),
    );
  }

  async removeShare(id: string, email: string) {
    const rows = check(
      await this.db.from("document_shares").delete().eq("document_id", id).eq("email", email).select("email"),
    );
    return (rows ?? []).length > 0;
  }

  async loadState(id: string) {
    const row = check(await this.db.from("documents").select("ydoc_state").eq("id", id).maybeSingle());
    return row?.ydoc_state ? decodeState(row.ydoc_state) : null;
  }

  async saveState(id: string, state: Uint8Array, html: string) {
    // An UPDATE (not upsert) so a document deleted mid-session is never resurrected.
    check(
      await this.db
        .from("documents")
        .update({ ydoc_state: encodeState(state), content_html: html, updated_at: new Date().toISOString() })
        .eq("id", id),
    );
  }
}

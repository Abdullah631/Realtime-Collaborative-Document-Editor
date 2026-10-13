/**
 * Integration tests against a real Hocuspocus server and real WebSocket clients:
 * concurrent editing, refresh/reconnect, persistence, read-only viewers and revocation.
 */
import { HocuspocusProvider } from "@hocuspocus/provider";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createCollab, type Collab, type ServerEvent } from "./collab.js";
import { YJS_FIELD, yDocToHTML } from "./editorSchema.js";
import { MemoryRepo } from "./repo.memory.js";
import { fakeVerifyToken, tokenFor, users, type UserName } from "./test/fixtures.js";

let repo: MemoryRepo;
let collab: Collab;
let url: string;
const open: HocuspocusProvider[] = [];

beforeAll(async () => {
  repo = new MemoryRepo();
  collab = createCollab({ repo, verifyToken: fakeVerifyToken, debounce: 50, maxDebounce: 200 });
  await collab.server.listen(0);
  url = `ws://127.0.0.1:${collab.server.address.port}`;
});

afterEach(() => {
  open.splice(0).forEach((p) => p.destroy());
});

afterAll(async () => {
  await collab.server.destroy();
});

const until = async (cond: () => boolean, ms = 3000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 10));
  }
};

interface Client {
  provider: HocuspocusProvider;
  doc: Y.Doc;
  events: ServerEvent[];
  failed: string | null;
}

function connect(name: UserName, docId: string): Client {
  const doc = new Y.Doc();
  const client: Client = { doc, events: [], failed: null, provider: null! };
  client.provider = new HocuspocusProvider({
    url,
    name: docId,
    document: doc,
    token: tokenFor(name),
    onAuthenticationFailed: ({ reason }) => (client.failed = reason),
    onStateless: ({ payload }) => client.events.push(JSON.parse(payload)),
  });
  open.push(client.provider);
  return client;
}

const synced = (c: Client) => until(() => c.provider.isSynced);

function typeParagraph(doc: Y.Doc, text: string) {
  const p = new Y.XmlElement("paragraph");
  p.insert(0, [new Y.XmlText(text)]);
  doc.getXmlFragment(YJS_FIELD).push([p]);
}

const html = (doc: Y.Doc) => yDocToHTML(doc);

async function newDoc() {
  return repo.create({ ownerId: users.alice.id, ownerEmail: users.alice.email, title: "Doc" });
}

describe("realtime collaboration", () => {
  it("rejects unauthenticated users, strangers and malformed ids", async () => {
    const doc = await newDoc();
    const stranger = connect("mallory", doc.id);
    await until(() => stranger.failed !== null);
    expect(stranger.failed).toBe("not-found");

    const garbage = connect("alice", "../../etc/passwd");
    await until(() => garbage.failed !== null);
    expect(garbage.failed).toBe("not-found");
  });

  it("concurrent edits from three users converge without losing anyone's text", async () => {
    const doc = await newDoc();
    await repo.upsertShare(doc.id, { email: users.bob.email, role: "editor" });
    await repo.upsertShare(doc.id, { email: users.carol.email, role: "editor" });

    const clients = [connect("alice", doc.id), connect("bob", doc.id), connect("carol", doc.id)];
    await Promise.all(clients.map(synced));

    // Everyone types "at the same time" (no waiting between edits).
    clients.forEach((c, i) => typeParagraph(c.doc, `from client ${i}`));

    await until(() => clients.every((c) => c.doc.getXmlFragment(YJS_FIELD).length === 3));
    const results = clients.map((c) => html(c.doc));
    expect(new Set(results).size).toBe(1);
    for (let i = 0; i < 3; i++) expect(results[0]).toContain(`from client ${i}`);
  });

  it("survives refreshes: partial refresh keeps the live doc, full refresh restores from the database", async () => {
    const doc = await newDoc();
    await repo.upsertShare(doc.id, { email: users.bob.email, role: "editor" });

    const a = connect("alice", doc.id);
    const b = connect("bob", doc.id);
    await Promise.all([synced(a), synced(b)]);
    typeParagraph(a.doc, "before refresh");
    await until(() => !a.provider.hasUnsyncedChanges);

    // One user refreshes while the other stays connected.
    b.provider.destroy();
    const b2 = connect("bob", doc.id);
    await synced(b2);
    expect(html(b2.doc)).toContain("before refresh");

    // Everyone refreshes: the server unloads the doc and must have persisted it.
    a.provider.destroy();
    b2.provider.destroy();
    await until(() => !collab.server.hocuspocus.documents.has(doc.id));
    expect(await repo.loadState(doc.id)).not.toBeNull();

    const fresh = connect("carol", doc.id); // no access yet
    await until(() => fresh.failed !== null);

    const a2 = connect("alice", doc.id);
    await synced(a2);
    expect(html(a2.doc)).toContain("before refresh");
  });

  it("drops edits from read-only viewers on the server", async () => {
    const doc = await newDoc();
    await repo.upsertShare(doc.id, { email: users.bob.email, role: "viewer" });

    const owner = connect("alice", doc.id);
    const viewer = connect("bob", doc.id);
    await Promise.all([synced(owner), synced(viewer)]);

    typeParagraph(viewer.doc, "viewer tampering"); // e.g. via devtools
    typeParagraph(owner.doc, "owner text");

    await until(() => html(viewer.doc).includes("owner text"));
    await new Promise((r) => setTimeout(r, 200));
    expect(html(owner.doc)).toContain("owner text");
    expect(html(owner.doc)).not.toContain("viewer tampering");
    expect(html(collab.server.hocuspocus.documents.get(doc.id)!)).not.toContain("viewer tampering");
  });

  it("revoking access mid-session notifies and cuts off the user", async () => {
    const doc = await newDoc();
    await repo.upsertShare(doc.id, { email: users.bob.email, role: "editor" });

    const owner = connect("alice", doc.id);
    const editor = connect("bob", doc.id);
    await Promise.all([synced(owner), synced(editor)]);

    await repo.removeShare(doc.id, users.bob.email);
    collab.accessChanged(doc.id, users.bob.email);
    await until(() => editor.events.some((e) => e.type === "access-changed"));

    typeParagraph(editor.doc, "after revoke");
    await new Promise((r) => setTimeout(r, 300));
    expect(html(owner.doc)).not.toContain("after revoke");
    // The owner was not disconnected by someone else's revocation.
    typeParagraph(owner.doc, "owner still editing");
    await until(() => html(collab.server.hocuspocus.documents.get(doc.id)!).includes("owner still editing"));
  });

  it("broadcasts renames to everyone in the document", async () => {
    const doc = await newDoc();
    const a = connect("alice", doc.id);
    await synced(a);
    collab.broadcastTitle(doc.id, "New title");
    await until(() => a.events.some((e) => e.type === "title"));
    expect(a.events).toContainEqual({ type: "title", title: "New title" });
  });
});

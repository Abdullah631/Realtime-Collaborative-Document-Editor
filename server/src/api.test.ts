import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, type LiveHooks } from "./app.js";
import { MemoryRepo } from "./repo.memory.js";
import { fakeVerifyToken, tokenFor, users, type UserName } from "./test/fixtures.js";

let repo: MemoryRepo;
let live: { [K in keyof LiveHooks]: ReturnType<typeof vi.fn> };
let app: ReturnType<typeof createApp>;

const as = (name: UserName) => ({ Authorization: `Bearer ${tokenFor(name)}` });

async function createDoc(owner: UserName = "alice", title = "Plan") {
  const res = await request(app).post("/api/documents").set(as(owner)).send({ title });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function share(id: string, email: string, role: "viewer" | "editor", by: UserName = "alice") {
  return request(app).put(`/api/documents/${id}/shares`).set(as(by)).send({ email, role });
}

beforeEach(() => {
  repo = new MemoryRepo();
  live = { broadcastTitle: vi.fn(), accessChanged: vi.fn(), documentDeleted: vi.fn() };
  app = createApp({ repo, verifyToken: fakeVerifyToken, live });
});

describe("authentication", () => {
  it("rejects requests without a valid token", async () => {
    expect((await request(app).get("/api/documents")).status).toBe(401);
    expect((await request(app).get("/api/documents").set({ Authorization: "Bearer forged" })).status).toBe(401);
  });
});

describe("access control", () => {
  it("a stranger cannot read, rename, delete, list shares or share — and can't tell the doc exists", async () => {
    const id = await createDoc();
    const stranger = as("mallory");
    const responses = await Promise.all([
      request(app).get(`/api/documents/${id}`).set(stranger),
      request(app).patch(`/api/documents/${id}`).set(stranger).send({ title: "pwned" }),
      request(app).delete(`/api/documents/${id}`).set(stranger),
      request(app).get(`/api/documents/${id}/shares`).set(stranger),
      request(app).put(`/api/documents/${id}/shares`).set(stranger).send({ email: users.mallory.email, role: "editor" }),
    ]);
    for (const res of responses) expect(res.status).toBe(404);

    // Same response as a document that truly doesn't exist.
    const missing = await request(app).get("/api/documents/7b0e4f1e-1111-4111-8111-111111111111").set(stranger);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(responses[0].body);

    expect((await repo.getDocument(id))?.title).toBe("Plan");
  });

  it("viewer can read but not rename or share", async () => {
    const id = await createDoc();
    await share(id, users.bob.email, "viewer");

    const read = await request(app).get(`/api/documents/${id}`).set(as("bob"));
    expect(read.status).toBe(200);
    expect(read.body.role).toBe("viewer");

    expect((await request(app).patch(`/api/documents/${id}`).set(as("bob")).send({ title: "x" })).status).toBe(403);
    expect((await share(id, users.carol.email, "editor", "bob")).status).toBe(403);
  });

  it("editor can rename (broadcast live) but cannot delete or share", async () => {
    const id = await createDoc();
    await share(id, users.bob.email, "editor");

    const res = await request(app).patch(`/api/documents/${id}`).set(as("bob")).send({ title: "  Renamed  " });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Renamed");
    expect(live.broadcastTitle).toHaveBeenCalledWith(id, "Renamed");

    expect((await request(app).delete(`/api/documents/${id}`).set(as("bob"))).status).toBe(403);
    expect((await share(id, users.carol.email, "viewer", "bob")).status).toBe(403);
  });

  it("revoking access takes effect immediately and kicks live sessions", async () => {
    const id = await createDoc();
    await share(id, users.bob.email, "editor");
    expect((await request(app).get(`/api/documents/${id}`).set(as("bob"))).status).toBe(200);

    const res = await request(app).delete(`/api/documents/${id}/shares/${encodeURIComponent(users.bob.email)}`).set(as("alice"));
    expect(res.status).toBe(200);
    expect(live.accessChanged).toHaveBeenCalledWith(id, users.bob.email);
    expect((await request(app).get(`/api/documents/${id}`).set(as("bob"))).status).toBe(404);
  });

  it("deleting a document closes live sessions", async () => {
    const id = await createDoc();
    expect((await request(app).delete(`/api/documents/${id}`).set(as("alice"))).status).toBe(204);
    expect(live.documentDeleted).toHaveBeenCalledWith(id);
    expect((await request(app).get(`/api/documents/${id}`).set(as("alice"))).status).toBe(404);
  });
});

describe("sharing", () => {
  it("separates owned and shared documents", async () => {
    const id = await createDoc("alice", "Alice doc");
    await createDoc("bob", "Bob doc");
    await share(id, "  BOB@Example.com ", "editor"); // normalized

    const res = await request(app).get("/api/documents").set(as("bob"));
    expect(res.body.owned.map((d: { title: string }) => d.title)).toEqual(["Bob doc"]);
    expect(res.body.shared).toHaveLength(1);
    expect(res.body.shared[0]).toMatchObject({ title: "Alice doc", role: "editor", ownerEmail: users.alice.email });
  });

  it("re-sharing changes the role instead of duplicating", async () => {
    const id = await createDoc();
    await share(id, users.bob.email, "viewer");
    const res = await share(id, users.bob.email, "editor");
    expect(res.body.shares).toEqual([{ email: users.bob.email, role: "editor" }]);
  });

  it("validates input", async () => {
    const id = await createDoc();
    expect((await share(id, "not-an-email", "viewer")).status).toBe(400);
    expect((await share(id, users.bob.email, "owner" as never)).status).toBe(400);
    expect((await share(id, users.alice.email, "editor")).status).toBe(400); // self
    expect((await request(app).patch(`/api/documents/${id}`).set(as("alice")).send({ title: "   " })).status).toBe(400);
    expect((await request(app).patch(`/api/documents/${id}`).set(as("alice")).send({ title: "x".repeat(201) })).status).toBe(400);
  });
});

describe("import", () => {
  it("creates an owned document from a markdown file", async () => {
    const res = await request(app)
      .post("/api/documents/import")
      .set(as("alice"))
      .attach("file", Buffer.from("# Hello\n\n**world**"), "hello-world.md");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: "hello world", role: "owner" });
    expect(await repo.loadState(res.body.id)).toBeInstanceOf(Uint8Array);
  });

  it("rejects unsupported and oversized files", async () => {
    const pdf = await request(app).post("/api/documents/import").set(as("alice")).attach("file", Buffer.from("%PDF-1.4"), "a.pdf");
    expect(pdf.status).toBe(415);

    const big = await request(app)
      .post("/api/documents/import")
      .set(as("alice"))
      .attach("file", Buffer.alloc(5 * 1024 * 1024 + 1, 97), "big.txt");
    expect(big.status).toBe(413);
  });
});

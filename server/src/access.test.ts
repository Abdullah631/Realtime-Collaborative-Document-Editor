import { describe, expect, it } from "vitest";
import { can, getRole, resolveRole, type Action, type Role } from "./access.js";
import { MemoryRepo } from "./repo.memory.js";
import { users } from "./test/fixtures.js";

describe("permission matrix", () => {
  const expected: Record<Role, Action[]> = {
    owner: ["read", "edit", "rename", "delete", "share"],
    editor: ["read", "edit", "rename"],
    viewer: ["read"],
  };
  const all: Action[] = ["read", "edit", "rename", "delete", "share"];

  for (const [role, allowed] of Object.entries(expected) as [Role, Action[]][]) {
    for (const action of all) {
      it(`${role} ${allowed.includes(action) ? "can" : "cannot"} ${action}`, () => {
        expect(can(role, action)).toBe(allowed.includes(action));
      });
    }
  }

  it("no role can do nothing", () => {
    for (const action of all) expect(can(null, action)).toBe(false);
  });
});

describe("resolveRole", () => {
  const doc = { ownerId: users.alice.id };

  it("owner wins over any share row", () => {
    expect(resolveRole(doc, { role: "viewer" }, users.alice)).toBe("owner");
  });
  it("share role applies to non-owners", () => {
    expect(resolveRole(doc, { role: "editor" }, users.bob)).toBe("editor");
  });
  it("no share and not owner means no access", () => {
    expect(resolveRole(doc, null, users.mallory)).toBeNull();
  });
  it("missing document means no access", () => {
    expect(resolveRole(null, { role: "editor" }, users.bob)).toBeNull();
  });
});

describe("getRole against a repository", () => {
  it("resolves by email so invites work before the invitee signs up", async () => {
    const repo = new MemoryRepo();
    const doc = await repo.create({ ownerId: users.alice.id, ownerEmail: users.alice.email, title: "Plan" });
    await repo.upsertShare(doc.id, { email: users.bob.email, role: "viewer" });

    expect(await getRole(repo, doc.id, users.alice)).toBe("owner");
    expect(await getRole(repo, doc.id, users.bob)).toBe("viewer");
    expect(await getRole(repo, doc.id, users.mallory)).toBeNull();

    // An attacker who reuses the owner's email under a different account id gets nothing
    // beyond what that email was explicitly granted.
    expect(await getRole(repo, doc.id, { id: users.mallory.id, email: users.alice.email })).toBeNull();
  });
});

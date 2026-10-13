import type { AuthUser } from "../access.js";
import type { VerifyToken } from "../collab.js";

export const users = {
  alice: { id: "00000000-0000-4000-8000-00000000000a", email: "alice@example.com" },
  bob: { id: "00000000-0000-4000-8000-00000000000b", email: "bob@example.com" },
  carol: { id: "00000000-0000-4000-8000-00000000000c", email: "carol@example.com" },
  mallory: { id: "00000000-0000-4000-8000-00000000000d", email: "mallory@example.com" },
} satisfies Record<string, AuthUser>;

export type UserName = keyof typeof users;

/** Test tokens are simply "token:<name>". */
export const tokenFor = (name: UserName) => `token:${name}`;

export const fakeVerifyToken: VerifyToken = async (token) => {
  const name = token.startsWith("token:") ? (token.slice(6) as UserName) : null;
  return name && name in users ? users[name] : null;
};

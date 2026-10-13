import { config } from "./config";
import { getAccessToken } from "./supabase";

export type Role = "owner" | "editor" | "viewer";

export interface DocumentMeta {
  id: string;
  ownerId: string;
  ownerEmail: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentWithRole extends DocumentMeta {
  role: Role;
}

export interface Share {
  email: string;
  role: Exclude<Role, "owner">;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  return body as T;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body ? JSON.stringify(body) : undefined });

export const api = {
  listDocuments: () => request<{ owned: DocumentMeta[]; shared: DocumentWithRole[] }>("/api/documents"),
  createDocument: (title?: string) => request<DocumentWithRole>("/api/documents", json("POST", { title })),
  importDocument: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<DocumentWithRole>("/api/documents/import", { method: "POST", body: form });
  },
  getDocument: (id: string) => request<DocumentWithRole>(`/api/documents/${id}`),
  renameDocument: (id: string, title: string) => request<DocumentWithRole>(`/api/documents/${id}`, json("PATCH", { title })),
  deleteDocument: (id: string) => request<void>(`/api/documents/${id}`, { method: "DELETE" }),
  listShares: (id: string) => request<{ shares: Share[] }>(`/api/documents/${id}/shares`),
  share: (id: string, email: string, role: Share["role"]) =>
    request<{ shares: Share[] }>(`/api/documents/${id}/shares`, json("PUT", { email, role })),
  unshare: (id: string, email: string) =>
    request<{ shares: Share[] }>(`/api/documents/${id}/shares/${encodeURIComponent(email)}`, { method: "DELETE" }),
};

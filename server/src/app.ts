import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import { z } from "zod";
import { can, getRole, isUuid, normalizeEmail, type Action, type AuthUser } from "./access.js";
import type { VerifyToken } from "./collab.js";
import { htmlToYState } from "./editorSchema.js";
import { HttpError, notFound } from "./errors.js";
import { fileToHtml, MAX_UPLOAD_BYTES } from "./importer.js";
import type { DocumentRepo } from "./repo.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

/** Side effects on live editing sessions. No-ops when the realtime server isn't attached (e.g. in tests). */
export interface LiveHooks {
  broadcastTitle(docId: string, title: string): void;
  accessChanged(docId: string, email: string): void;
  documentDeleted(docId: string): void;
}

export interface AppOptions {
  repo: DocumentRepo;
  verifyToken: VerifyToken;
  live?: LiveHooks;
  webOrigins?: string[];
}

const Title = z.string().trim().min(1, "Title can't be empty.").max(200, "Title is too long (max 200 characters).");
const CreateBody = z.object({ title: Title.optional() });
const RenameBody = z.object({ title: Title });
const ShareBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.").max(254)),
  role: z.enum(["viewer", "editor"]),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? "Invalid request.");
  return result.data;
}

const noopLive: LiveHooks = { broadcastTitle() {}, accessChanged() {}, documentDeleted() {} };

export function createApp({ repo, verifyToken, live = noopLive, webOrigins = [] }: AppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Render / Vercel sit behind one proxy hop
  app.use(helmet());
  app.use(cors({ origin: webOrigins, allowedHeaders: ["Authorization", "Content-Type"], maxAge: 600 }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  const api = express.Router();
  api.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false }));

  api.use(async (req, _res, next) => {
    const header = req.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const user = token ? await verifyToken(token) : null;
    if (!user) throw new HttpError(401, "Please sign in again.");
    req.user = user;
    next();
  });

  /** Loads the document and enforces `action`. 404 when the user has no access at all. */
  async function authorize(req: Request, action: Action) {
    const id = String(req.params.id);
    if (!isUuid(id)) throw notFound();
    const role = await getRole(repo, id, req.user!);
    if (!role) throw notFound();
    if (!can(role, action)) throw new HttpError(403, "You don't have permission to do that.");
    return { id, role };
  }

  api.get("/documents", async (req, res) => {
    const [owned, shared] = await Promise.all([repo.listOwned(req.user!.id), repo.listSharedWith(req.user!.email)]);
    res.json({ owned, shared });
  });

  api.post("/documents", async (req, res) => {
    const { title } = parse(CreateBody, req.body);
    const doc = await repo.create({ ownerId: req.user!.id, ownerEmail: req.user!.email, title: title ?? "Untitled document" });
    res.status(201).json({ ...doc, role: "owner" });
  });

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  const importLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });

  api.post("/documents/import", importLimiter, upload.single("file"), async (req, res) => {
    if (!req.file) throw new HttpError(400, "Choose a file to import.");
    const { title, html } = await fileToHtml(req.file.originalname, req.file.buffer);
    const state = htmlToYState(html);
    const doc = await repo.create({ ownerId: req.user!.id, ownerEmail: req.user!.email, title, state, html });
    res.status(201).json({ ...doc, role: "owner" });
  });

  api.get("/documents/:id", async (req, res) => {
    const { id, role } = await authorize(req, "read");
    const doc = await repo.getDocument(id);
    if (!doc) throw notFound();
    res.json({ ...doc, role });
  });

  api.patch("/documents/:id", async (req, res) => {
    const { id, role } = await authorize(req, "rename");
    const { title } = parse(RenameBody, req.body);
    const doc = await repo.rename(id, title);
    if (!doc) throw notFound();
    live.broadcastTitle(id, doc.title);
    res.json({ ...doc, role });
  });

  api.delete("/documents/:id", async (req, res) => {
    const { id } = await authorize(req, "delete");
    await repo.delete(id);
    live.documentDeleted(id);
    res.status(204).end();
  });

  api.get("/documents/:id/shares", async (req, res) => {
    const { id } = await authorize(req, "read");
    res.json({ shares: await repo.listShares(id) });
  });

  api.put("/documents/:id/shares", async (req, res) => {
    const { id } = await authorize(req, "share");
    const share = parse(ShareBody, req.body);
    if (share.email === req.user!.email) throw new HttpError(400, "You already own this document.");
    await repo.upsertShare(id, share);
    live.accessChanged(id, share.email);
    res.json({ shares: await repo.listShares(id) });
  });

  api.delete("/documents/:id/shares/:email", async (req, res) => {
    const { id } = await authorize(req, "share");
    const email = normalizeEmail(String(req.params.email));
    if (!(await repo.removeShare(id, email))) throw new HttpError(404, "That person doesn't have access.");
    live.accessChanged(id, email);
    res.json({ shares: await repo.listShares(id) });
  });

  app.use("/api", api);

  app.use((_req, _res, next) => next(new HttpError(404, "Not found.")));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof multer.MulterError) {
      const tooBig = err.code === "LIMIT_FILE_SIZE";
      res.status(tooBig ? 413 : 400).json({ error: tooBig ? "File is larger than 5 MB." : "Upload failed." });
      return;
    }
    if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({ error: "Malformed JSON." });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });

  return app;
}

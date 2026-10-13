import { createApp } from "./app.js";
import { createCollab } from "./collab.js";
import { loadConfig } from "./config.js";
import { SupabaseRepo } from "./repo.supabase.js";
import { createAdminClient, createTokenVerifier } from "./supabase.js";

const config = loadConfig();
const admin = createAdminClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY);
const repo = new SupabaseRepo(admin);
const verifyToken = createTokenVerifier(admin);

const collab = createCollab({ repo, verifyToken });
const app = createApp({ repo, verifyToken, live: collab, webOrigins: config.WEB_ORIGINS });

// One HTTP server: Express handles requests, Hocuspocus handles WebSocket upgrades.
const { server } = collab;
server.httpServer.removeAllListeners("request");
server.httpServer.on("request", app);

await server.listen(config.PORT);
console.log(`API + realtime server listening on :${config.PORT}`);

// Flush pending document saves before Render stops the instance.
const shutdown = async () => {
  console.log("Shutting down, flushing pending saves...");
  await server.destroy();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

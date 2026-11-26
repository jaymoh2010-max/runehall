import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const port = Number(process.env.E2E_PORT || 5199);
const dataDir = path.join(projectRoot, "test-results", "e2e-data");
const compendiumDir = path.join(projectRoot, "data", "compendium");

if (!process.env.E2E_KEEP_DATA) {
  fs.rmSync(dataDir, { recursive: true, force: true });
}
fs.mkdirSync(dataDir, { recursive: true });

process.env.PORT = String(port);
process.env.HOST = "127.0.0.1";
process.env.DATA_DIR = dataDir;
process.env.DATABASE_PATH = path.join(dataDir, "runehall.db");
process.env.COMPENDIUM_DIR = compendiumDir;
process.env.NODE_ENV = "production";
process.env.ENABLE_CSP = "0";
process.env.COOKIE_SECURE = "0";
process.env.REGISTRATION_MODE = "open";
process.env.BOOTSTRAP_TOKEN = "e2e-bootstrap-token";
process.env.AUTH_RATE_LIMIT_MAX = "200";
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "warn";

console.log(`E2E server: http://127.0.0.1:${port} (data: ${dataDir})`);
await import("../src/server/index");

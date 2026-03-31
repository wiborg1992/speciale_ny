/**
 * Tilføjer DATABASE_URL til .env hvis den mangler (matcher docker-compose.yml).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const dbBlock =
  "\n# Lokal Postgres (docker compose i repo-roden)\nDATABASE_URL=postgresql://speciale:speciale@127.0.0.1:5432/speciale\n";
const portBlock = "\nPORT=3000\n";

if (!existsSync(envPath)) {
  writeFileSync(
    envPath,
    `PORT=3000\n${dbBlock.trim()}\n# Tilføj din nøgle:\n# ANTHROPIC_API_KEY=sk-ant-...\n`,
    "utf8",
  );
  console.log("Oprettet .env med DATABASE_URL og PORT=3000 (tilføj ANTHROPIC_API_KEY).");
  process.exit(0);
}

const s = readFileSync(envPath, "utf8");
if (/^\s*DATABASE_URL\s*=/m.test(s)) {
  console.log(".env har allerede DATABASE_URL — ingen ændring.");
  process.exit(0);
}

let extra = dbBlock;
if (!/^\s*PORT\s*=/m.test(s)) {
  extra = portBlock + dbBlock.trimStart();
}

writeFileSync(envPath, s.replace(/\s*$/, "") + extra, "utf8");
console.log("Tilføjede DATABASE_URL til .env" + (!/^\s*PORT\s*=/m.test(s) ? " (+ PORT=3000)" : ""));

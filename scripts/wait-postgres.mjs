/**
 * Venter på at Postgres i docker-compose er klar (op til ~45s).
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

for (let i = 0; i < 45; i++) {
  try {
    execSync("docker compose exec -T postgres pg_isready -U speciale -d speciale", {
      cwd: root,
      stdio: "pipe",
    });
    console.log("Postgres er klar.");
    process.exit(0);
  } catch {
    await sleep(1000);
  }
}
console.error("Timeout: Postgres svarede ikke. Kør: docker compose ps");
process.exit(1);

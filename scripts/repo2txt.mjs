#!/usr/bin/env node
/**
 * repo2txt — samler hele kodebasens kildefiler til én tekstfil (repo-context.txt).
 * Kør: pnpm repo2txt
 * Output: repo-context.txt i projektets rod
 */

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, relative, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const OUTPUT = join(ROOT, "repo-context.txt");

const INCLUDE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".mts", ".cts",
  ".js", ".jsx", ".mjs", ".cjs",
  ".css", ".scss", ".sass",
  ".json",
  ".md", ".mdx",
  ".yaml", ".yml",
  ".sh", ".bash",
  ".toml",
  ".sql",
  ".html",
]);

const INCLUDE_EXACT_FILENAMES = new Set([
  ".env.example",
  "Dockerfile",
  "Makefile",
]);

const EXCLUDE_DIRS = new Set([
  "node_modules",
  "dist",
  "out",
  ".git",
  ".cache",
  ".canvas",
  ".expo",
  "attached_assets",
  "__pycache__",
  ".vscode",
  ".idea",
  "coverage",
]);

const EXCLUDE_FILES = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
]);

const EXCLUDE_PATH_FRAGMENTS = [
  "/.local/",
  "/.agents/",
  "/.claude/external/",
  "/node_modules/",
];

function shouldExcludePath(rel) {
  const normalized = "/" + rel.replace(/\\/g, "/");
  return EXCLUDE_PATH_FRAGMENTS.some((frag) => normalized.includes(frag));
}

async function collectFiles(dir, files = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const rel = relative(ROOT, fullPath);

    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      if (shouldExcludePath(rel + "/")) continue;
      await collectFiles(fullPath, files);
    } else if (entry.isFile()) {
      if (EXCLUDE_FILES.has(entry.name)) continue;
      if (entry.name.endsWith(".map")) continue;
      if (entry.name.endsWith(".tsbuildinfo")) continue;
      if (shouldExcludePath(rel)) continue;

      const ext = extname(entry.name);
      const name = basename(entry.name);
      const included = INCLUDE_EXTENSIONS.has(ext) || INCLUDE_EXACT_FILENAMES.has(name);
      if (!included) continue;

      files.push({ fullPath, rel });
    }
  }

  return files;
}

const SEP = "=".repeat(80);

async function main() {
  console.log("repo2txt: scanning project…");
  const files = await collectFiles(ROOT);
  files.sort((a, b) => a.rel.localeCompare(b.rel));

  const chunks = [];
  let totalChars = 0;
  let skippedBinary = 0;
  const skippedPaths = [];

  const header = [
    SEP,
    "MEETING AI VISUALIZER — FULL CODEBASE CONTEXT",
    `Generated: ${new Date().toISOString()}`,
    `Files collected: ${files.length}`,
    SEP,
    "",
    "TABLE OF CONTENTS",
    SEP,
    ...files.map((f, i) => `  ${String(i + 1).padStart(4, " ")}. ${f.rel}`),
    "",
    SEP,
    "",
  ].join("\n");

  chunks.push(header);
  totalChars += header.length;

  for (const { fullPath, rel } of files) {
    let content;
    try {
      const raw = await readFile(fullPath);
      if (raw.includes(0x00)) {
        skippedBinary++;
        skippedPaths.push(rel);
        continue;
      }
      content = raw.toString("utf8");
    } catch {
      continue;
    }

    const block = [
      SEP,
      `FILE: ${rel}`,
      SEP,
      content,
      "",
    ].join("\n");

    chunks.push(block);
    totalChars += block.length;
  }

  const output = chunks.join("\n");
  await writeFile(OUTPUT, output, "utf8");

  const kb = (totalChars / 1024).toFixed(1);
  const included = files.length - skippedBinary;
  console.log(`\nDone!`);
  console.log(`  Files included : ${included}`);
  if (skippedBinary > 0) {
    console.log(`  Skipped binary : ${skippedBinary}`);
    skippedPaths.forEach((p) => console.log(`    - ${p}`));
  }
  console.log(`  Total size     : ~${kb} KB`);
  console.log(`  Output         : ${relative(ROOT, OUTPUT)}`);
  console.log(`\nTip: Upload repo-context.txt to your AI assistant for full codebase context.`);
}

main().catch((err) => {
  console.error("repo2txt failed:", err);
  process.exit(1);
});

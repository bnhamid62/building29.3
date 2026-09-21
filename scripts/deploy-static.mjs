/**
 * Assembles the PHP-only deployment folder.
 *
 * 1. `npm run build:static` must have produced dist/client (plain SPA, no Node.js).
 * 2. This script copies index.html, accueil.html, assets/ and the PWA files into
 *    backend/public/, next to the PHP API entry point (index.php).
 *
 * Result: backend/ is the single folder to upload to a shared PHP host.
 *   backend/public/index.php  -> REST API, reachable at /api/...
 *   backend/public/index.html -> React app (deep links handled by .htaccess)
 *   backend/public/accueil.html -> static landing page
 *
 * Previously copied front-end files are removed first; PHP files are never touched.
 */
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = path.join(root, "dist", "client");
const dest = path.join(root, "backend", "public");

if (!existsSync(src)) {
  console.error("dist/client is missing. Run `npm run build:static` first.");
  process.exit(1);
}

// Everything PHP-side that must survive the copy.
const keep = new Set(["index.php", ".htaccess"]);

await mkdir(dest, { recursive: true });
for (const entry of await readdir(dest)) {
  if (keep.has(entry)) continue;
  await rm(path.join(dest, entry), { recursive: true, force: true });
}

for (const entry of await readdir(src)) {
  const from = path.join(src, entry);
  const to = path.join(dest, entry);
  if (keep.has(entry)) continue;
  await cp(from, to, { recursive: (await stat(from)).isDirectory() });
}

console.log("Front-end copied into backend/public/ — upload the backend/ folder to your host.");

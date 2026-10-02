import { mkdir, readFile, writeFile } from "node:fs/promises";

const assetsDir = new URL("../dist/client/", import.meta.url);
const assetsIgnorePath = new URL(".assetsignore", assetsDir);

await mkdir(assetsDir, { recursive: true });

let existing = "";
try {
  existing = await readFile(assetsIgnorePath, "utf8");
} catch {
  // Astro's Cloudflare adapter normally creates this file during the build.
}

const entries = new Set(existing.split(/\r?\n/u).filter(Boolean));
entries.add("wrangler.json");
entries.add(".dev.vars");
await writeFile(assetsIgnorePath, `${[...entries].join("\n")}\n`, "utf8");

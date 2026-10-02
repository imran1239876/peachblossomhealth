import { access, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const dist = new URL("../dist/", import.meta.url);
const client = new URL("client/", dist);
const requiredFiles = [
  "index.html",
  "contact/index.html",
  "blog/index.html",
  "sitemap-index.xml",
  "robots.txt",
  "rss.xml",
  "llms.txt",
];
const requiredServerFiles = ["entry.mjs", "wrangler.json"];
const requiredClientFiles = [...requiredFiles, ".assetsignore"];

const missing = [];
for (const file of requiredClientFiles) {
  try {
    await access(new URL(file, client));
  } catch {
    missing.push(`client/${file}`);
  }
}
for (const file of requiredServerFiles) {
  try {
    await access(new URL(file, new URL("server/", dist)));
  } catch {
    missing.push(`server/${file}`);
  }
}

const blogDirectory = new URL("blog/", client);
const blogEntries = await readdir(blogDirectory, { withFileTypes: true });
const blogPosts = blogEntries.filter(
  (entry) => entry.isDirectory() && entry.name !== "tags",
);
if (blogPosts.length === 0) missing.push("blog/<slug>/index.html");
for (const post of blogPosts) {
  try {
    await access(new URL(`${post.name}/index.html`, blogDirectory));
  } catch {
    missing.push(`client/blog/${post.name}/index.html`);
  }
}

const generatedWrangler = JSON.parse(
  await readFile(new URL("server/wrangler.json", dist), "utf8"),
);
if (generatedWrangler.main !== "entry.mjs") {
  missing.push("server/wrangler.json main=entry.mjs");
}
if (generatedWrangler.assets?.directory !== "../client") {
  missing.push("server/wrangler.json assets.directory=../client");
}
// The deploy-time promise the forms pipeline rests on: Wrangler refuses to
// deploy a Worker missing either secret. That only holds if the adapter carries
// `secrets.required` from wrangler.jsonc into the artifact `wrangler deploy`
// actually reads, so assert it here rather than trusting the propagation.
for (const secret of ["TURNSTILE_SECRET", "PORTAL_ORG_KEY"]) {
  if (!generatedWrangler.secrets?.required?.includes(secret)) {
    missing.push(`server/wrangler.json secrets.required entry for ${secret}`);
  }
}

const assetsIgnore = await readFile(new URL(".assetsignore", client), "utf8");
for (const entry of ["wrangler.json", ".dev.vars"]) {
  if (!assetsIgnore.split(/\r?\n/u).includes(entry)) {
    missing.push(`client/.assetsignore entry for ${entry}`);
  }
}

if (missing.length > 0) {
  throw new Error(`Build verification failed; missing: ${missing.join(", ")}`);
}

const astroDirectory = new URL("_astro/", client);
const assetEntries = await readdir(astroDirectory, { withFileTypes: true });
const javascriptFiles = assetEntries.filter(
  (entry) => entry.isFile() && entry.name.endsWith(".js"),
);
const sizes = await Promise.all(
  javascriptFiles.map(async (entry) => ({
    name: entry.name,
    bytes: (await stat(join(astroDirectory.pathname, entry.name))).size,
  })),
);

const largest = sizes.reduce(
  (current, asset) => (asset.bytes > current.bytes ? asset : current),
  { name: "none", bytes: 0 },
);
const totalBytes = sizes.reduce((total, asset) => total + asset.bytes, 0);
const largestLimit = 200_000;
const totalLimit = 400_000;

if (largest.bytes > largestLimit || totalBytes > totalLimit) {
  throw new Error(
    `JavaScript budget exceeded: largest=${largest.name} (${largest.bytes} B, limit ${largestLimit} B), total=${totalBytes} B (limit ${totalLimit} B)`,
  );
}

console.log(
  `Verified ${requiredClientFiles.length + requiredServerFiles.length + blogPosts.length} build artifacts; JavaScript largest=${largest.bytes} B, total=${totalBytes} B.`,
);

import { getCollection } from "astro:content";
import { SITE } from "@/config";

/**
 * llms.txt — a plain-text/markdown map of the site for AI answer engines.
 * See https://llmstxt.org/. Derived entirely from build-time content, so it's
 * emitted as a static file served from the edge CDN.
 */
export const prerender = true;

export async function GET() {
  const abs = (path: string) => new URL(path, SITE.url).href;

  const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );

  const keyPages = [
    ["Home", "/"],
    ["Blog", "/blog"],
    ["Contact", "/contact"],
  ] as const;

  const lines = [
    `# ${SITE.name}`,
    "",
    `> ${SITE.description}`,
    "",
    "## Key pages",
    "",
    ...keyPages.map(([label, path]) => `- [${label}](${abs(path)})`),
    "",
    "## Blog posts",
    "",
    ...posts.map(
      (post) =>
        `- [${post.data.title}](${abs(`/blog/${post.id}`)}): ${post.data.description}`,
    ),
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

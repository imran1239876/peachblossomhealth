---
name: zikra-blog-post
description: Use when writing or publishing an SEO blog post on a Zikra site — covers creating the MDX file under src/content/blog, the exact frontmatter schema, on-page SEO structure (single H1 from the layout so MDX starts at H2, keyword placement, internal links, hero image, E-E-A-T, length), setting draft:false to publish, and confirming it lands in the sitemap and RSS feed.
---

# Write an SEO blog post correctly

Posts are MDX files in the `blog` content collection defined in `src/content.config.ts`. The file **id (slug)** is the filename, and the slug is the URL: `src/content/blog/local-seo-checklist.mdx` → `/blog/local-seo-checklist`.

## 1. Create the file

```bash
# from the repo root
mkdir -p src/content/blog
touch src/content/blog/<keyword-rich-slug>.mdx
```

Slug rules: lowercase, hyphenated, keyword-first, no dates or stop-word noise. Good: `roofing-cost-guide-2026`. Bad: `My_New_Post (final).mdx`.

## 2. Frontmatter — the exact schema

Validated at build time against `src/content.config.ts`. Every field below is real; getting a type or length wrong fails the build.

| Field | Type | Rules |
|---|---|---|
| `title` | string, 1–70 chars | The post's H1 **and** `<title>`. Aim ~50–60 chars. Lead with the target keyword. |
| `description` | string, **50–170** chars | Meta description. Aim 150–160. Include the keyword naturally; write it to earn the click. |
| `pubDate` | date | First publish date. Drives ordering, sitemap `<lastmod>`, RSS. |
| `updatedDate` | date, optional | Set when you materially revise. Signals freshness. |
| `author` | string | Defaults to `SITE.defaultAuthor`. Set a real person for E-E-A-T. |
| `tags` | string[] | **Lowercase**, e.g. `["seo", "local business"]`. Powers tag pages / related posts. |
| `image` | image, optional | Hero image **imported from `src/assets/`** so `astro:assets` optimizes it. |
| `imageAlt` | string, optional | **Required whenever `image` is set** — descriptive alt text. |
| `draft` | boolean, default `false` | `true` hides it from listings, sitemap, and RSS. |
| `canonical` | url, optional | Only if the post is syndicated from another canonical URL. |

### Ready-to-copy template

Place the hero image at `src/assets/blog/<slug>.jpg` (or `.png`/`.webp`) so the `../../assets/...` import resolves and Sharp optimizes it:

```mdx
---
title: "Local SEO Checklist: 12 Steps to Rank in 2026"
description: "A practical local SEO checklist for small businesses — 12 steps covering Google Business Profile, citations, reviews, and on-page basics that move rankings."
pubDate: 2026-07-01
updatedDate: 2026-07-01
author: "Jane Doe"
tags: ["local seo", "small business", "google business profile"]
image: "../../assets/blog/local-seo-checklist.jpg"
imageAlt: "A small-business owner reviewing a local SEO checklist on a laptop"
draft: true
---

import { Image } from "astro:assets";
import heroImage from "../../assets/blog/local-seo-checklist.jpg";

<Image src={heroImage} alt="A small-business owner reviewing a local SEO checklist on a laptop" widths={[400, 800, 1200]} sizes="(max-width: 800px) 100vw, 800px" />

## What local SEO actually moves the needle in 2026

Your intro paragraph. Get the **target keyword into the first ~100 words** naturally...

## Step 1: Claim and optimize your Google Business Profile

### Categories and services

Body copy, with an [internal link to a related page](/services/local-seo) where it genuinely helps the reader.

## Frequently asked questions

...
```

## 3. SEO structure rules

- **Exactly one H1** — the blog layout (`src/layouts/BlogPost.astro`) renders the `title` as the page H1. **Your MDX body must start at `##` (H2).** Never write a `#` H1 in the MDX.
- **Logical heading hierarchy** — H2 for main sections, H3 for sub-points. Don't skip levels; don't use headings for styling.
- **Target-keyword placement** — put the primary keyword in the `title`, the `description`, the first H2, the first ~100 words, and 1–2 H2s. Write for humans first; no stuffing.
- **Internal links** — link to 2–4 relevant pages/posts using root-relative paths (`/services/...`, `/blog/...`). This spreads link equity and helps crawlers.
- **Hero image** — one hero via `astro:assets` (`<Image />` or `getImage`) with descriptive `alt`. Imported images get responsive `srcset`, lazy loading, and modern formats automatically.
- **Article JSON-LD is automatic** — `BlogPost.astro` emits the Article/BlogPosting structured data from your frontmatter. Do **not** hand-write JSON-LD in the MDX.
- **E-E-A-T** — set a real `author`, write from genuine experience, cite sources with outbound links where it adds trust, keep `updatedDate` current.
- **Length** — pillar/cornerstone posts ~1000–1500 words; supporting posts can be shorter. Length should match search intent, not a quota.

## 4. Publish

1. Set `draft: false`.
2. Proofread; verify the description is 50–170 chars and the title ≤ 70.
3. Commit and push to the default branch — Cloudflare auto-builds and deploys.

```bash
git add src/content/blog/<slug>.mdx src/assets/blog/<slug>.jpg
git commit -m "Add blog post: <title>"
git push
```

## 5. Confirm discoverability

After deploy (or locally after `pnpm build`, inspecting `dist/`):

- The post appears in the blog listing (`/blog`).
- It is present in `sitemap-index.xml` / `sitemap-0.xml` (drafts are excluded).
- It appears in `/rss.xml`.
- `curl -s https://<site>/rss.xml | grep "<slug>"` returns a hit.
- View source on the post: one `<h1>`, unique `<title>`/`<meta name="description">`, and an `application/ld+json` Article block.

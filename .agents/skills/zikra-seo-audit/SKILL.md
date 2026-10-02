---
name: zikra-seo-audit
description: Use before publishing or launching a Zikra site to run the pre-publish SEO check — verifies titles/descriptions/canonical/OG tags, one H1 per page, sitemap.xml and robots.txt correctness with no stray noindex, valid JSON-LD (sitewide LocalBusiness + per-post Article), llms.txt, optimized images with alt text, resolving internal links, Core Web Vitals targets, and a mobile Lighthouse pass.
---

# Pre-publish SEO audit (Phase 4)

Run this before every launch and before shipping significant content. Build first, then inspect the real output in `dist/`.

```bash
pnpm build          # produces dist/ (prerendered HTML + assets + sitemap/robots)
pnpm preview        # optional: astro build && wrangler dev to test on the Worker
```

Then walk the checklist against `dist/`.

## 1. Metadata (BaseLayout `<Seo>`)

Every page's `<head>` comes from `BaseLayout`'s shared `<Seo>` (astro-seo). For each key page confirm:

- [ ] Unique `<title>` (~50–60 chars, includes the brand).
- [ ] Unique `<meta name="description">` (~150–160 chars).
- [ ] `<link rel="canonical">` present and pointing to the correct absolute URL (self-referential unless intentionally syndicated).
- [ ] Open Graph + Twitter tags present (`og:title`, `og:description`, `og:image`, `og:url`, `twitter:card`).
- [ ] No page you want indexed is accidentally `noindex` (only thank-you/utility pages should set `noindex`).

```bash
grep -l 'name="robots" content="noindex' -r dist/         # list every noindexed page — should be intentional only
grep -o '<title>[^<]*</title>' dist/index.html
```

## 2. One H1 per page

Exactly one `<h1>` per page. Standard pages supply their own; blog posts get their H1 from `BlogPost.astro` (the MDX body starts at H2).

```bash
for f in $(find dist -name '*.html'); do n=$(grep -o '<h1' "$f" | wc -l); [ "$n" -ne 1 ] && echo "$f has $n H1s"; done
```

## 3. Sitemap & robots.txt

- [ ] `dist/sitemap-index.xml` + `dist/sitemap-0.xml` exist and list all public pages/posts (drafts excluded).
- [ ] URLs use the production `SITE.url` (no `localhost`, no wrong domain).
- [ ] `dist/robots.txt` exists and references the sitemap (astro-robots-txt adds it).
- [ ] robots.txt does not `Disallow: /` the whole site.

```bash
cat dist/robots.txt
grep -c '<loc>' dist/sitemap-0.xml
```

## 4. Structured data (JSON-LD)

- [ ] Sitewide **LocalBusiness** JSON-LD on every page (from BaseLayout) — includes `name`, `url`, `description`, and `telephone`/`address` when set in `SITE`.
- [ ] Each blog post has **Article/BlogPosting** JSON-LD from `BlogPost.astro`.
- [ ] Validate with Google's Rich Results Test / Schema.org validator.

```bash
grep -o 'application/ld+json' dist/blog/*/index.html | head    # each post should have one
```

## 5. llms.txt

- [ ] `dist/llms.txt` is present (served at `/llms.txt`) and lists the key pages/posts for LLM crawlers.

```bash
test -f dist/llms.txt && echo "llms.txt present" || echo "MISSING llms.txt"
```

## 6. Images

- [ ] Every content image goes through `astro:assets` (imported, `<Image />`/`getImage`) — optimized, responsive `srcset`, lazy-loaded, modern formats.
- [ ] Every image has meaningful `alt` (decorative images use `alt=""`).
- [ ] No oversized raw images shipped from `/public` where `src/assets` optimization was intended.

```bash
grep -o '<img[^>]*>' dist/index.html | grep -v 'alt=' && echo "IMAGES MISSING ALT" || echo "all imgs have alt"
```

## 7. Internal links resolve

- [ ] Nav, footer, in-content, and blog internal links all resolve (no 404s, no dead anchors).
- [ ] Links are root-relative (`/about`) not absolute-with-domain where avoidable.

Spot-check by crawling `pnpm preview` or a link checker; ensure each `href` maps to a file in `dist/`.

## 8. Core Web Vitals & Lighthouse (mobile)

Targets:
- **LCP** < 2.5s
- **INP** < 200ms
- **CLS** < 0.1

Run Lighthouse in **mobile** mode against `pnpm preview` (or the deployed preview URL). Aim ~100 performance — the stack is static/edge-served, so a low score means something regressed (an unnecessary `client:load`, an unoptimized image, render-blocking script). Confirm GA loads via Partytown (off the main thread), not blocking.

## Sign-off

All boxes checked, sitemap/robots/JSON-LD/llms.txt correct, one H1 per page, images optimized with alt, links resolve, and mobile Lighthouse green → cleared to publish. See `zikra-deploy` for shipping and Search Console submission.

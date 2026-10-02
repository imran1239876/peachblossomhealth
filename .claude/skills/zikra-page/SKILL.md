---
name: zikra-page
description: Use when adding a new page (about, services, pricing, a landing page, etc.) to a Zikra site — covers where the .astro file goes, wrapping it in BaseLayout with correct SEO props, staying zero-JS by default, adding a React island only when interactivity is required, and wiring it into the header nav.
---

# Scaffold a new page (the Zikra way)

Pages are plain Astro files under `src/pages/`. Every page is **prerendered to static HTML** at the edge (`output: "static"` in `astro.config.mjs`). Keep pages zero-JS unless a piece genuinely needs interactivity.

## 1. Create the file

The route is the file path relative to `src/pages/` (no extension):

- `src/pages/about.astro` → `/about`
- `src/pages/services/web.astro` → `/services/web`
- `src/pages/index.astro` → `/` (already exists)

Use kebab-case filenames. Nest folders for sub-routes.

## 2. Wrap in BaseLayout

Never write your own `<html>`, `<head>`, or `<body>`, and never add SEO/meta tags by hand — `BaseLayout` already renders the shared `<Seo>` (astro-seo), the sitewide LocalBusiness JSON-LD, GA4 via Partytown, the `Header`, and the `Footer`. Pages only supply their content.

```astro
---
import BaseLayout from "@/layouts/BaseLayout.astro";
---

<BaseLayout
  title="About — Acme Co"
  description="Meet the team behind Acme Co. 12 years building fast, secure sites for local businesses across the region."
>
  <section class="mx-auto max-w-3xl px-4 py-16 sm:px-6">
    <h1 class="text-4xl font-bold tracking-tight">About Acme Co</h1>
    <p class="text-muted-foreground mt-4 text-lg">…</p>
  </section>
</BaseLayout>
```

`BaseLayout` props: `title?`, `description?`, `canonical?`, `image?`, `noindex?`, `type?` (`"website" | "article"`, default `"website"`).

Rules for props:
- **title** — unique per page, ~50–60 chars, include the brand. Omit only on `/`, which falls back to `SITE.defaultTitle`.
- **description** — unique per page, ~150–160 chars. Falls back to `SITE.description`.
- **canonical** — only set when the page must point elsewhere; otherwise the layout derives it from `Astro.url`.
- **image** — path to a custom OG image (defaults to `SITE.defaultOgImage`).
- **noindex** — set `true` for thank-you / utility pages you don't want in search.

## 3. One H1, semantic headings

Put exactly **one `<h1>`** on the page (BaseLayout does not add one for standard pages). Use `<h2>`/`<h3>` in logical order below it. Use `astro:assets` (`import { Image } from "astro:assets"`) for images with real `alt` text, and ensure interactive elements have visible focus states (Tailwind `focus-visible:` utilities; shadcn components already handle this).

## 4. Stay static — add an island only when needed

The default is **zero JavaScript**. Static-looking layout (headers, hero, marketing copy, cards) stays plain Astro + Tailwind. Reach for a React island only for genuine interactivity (a form, an accordion with state, a filter). Import the `.tsx` component and hydrate with the narrowest directive:

- `client:visible` — hydrate when scrolled into view (default choice for below-the-fold widgets).
- `client:idle` — hydrate after the page settles (nav that needs JS).
- `client:load` — only for above-the-fold interactivity that must work immediately.

```astro
---
import BaseLayout from "@/layouts/BaseLayout.astro";
import ContactForm from "@/components/ContactForm.tsx";
---

<BaseLayout title="Contact — Acme Co" description="…">
  <section class="mx-auto max-w-xl px-4 py-16 sm:px-6">
    <h1 class="text-3xl font-bold">Contact us</h1>
    <ContactForm client:visible />
  </section>
</BaseLayout>
```

For links styled as buttons **with zero JS**, use `buttonVariants` instead of a hydrated `<Button>`:

```astro
---
import { buttonVariants } from "@/components/ui/button";
---
<a href="/contact" class={buttonVariants({ variant: "default" })}>Get in touch</a>
```

Use `cn` from `@/lib/utils` to merge classes.

## 5. Wire it into the nav

Top-level pages that belong in primary navigation go in the `links` array in `src/components/Header.astro`:

```ts
const links = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" }, // ← add here, in the order it should appear
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact" },
];
```

Active-state highlighting is automatic (the `isActive` helper matches the pathname). Footer links, if needed, live in `src/components/Footer.astro`.

## 6. Verify

Do not run build/check yourself in a multi-agent context; when working solo:

```bash
pnpm dev        # preview at localhost:4321
pnpm check      # astro check (types + template)
pnpm typecheck  # astro sync && tsc --noEmit
pnpm lint
pnpm format
```

Confirm the page renders, the nav link highlights on that route, the title/description are unique, and there's exactly one H1.

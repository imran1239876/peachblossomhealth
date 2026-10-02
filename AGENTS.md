# zikra-astro-starter

The reusable foundation every Zikra agency site is forked from. This is a **GitHub template repo** — you never deploy _this_ repo; you create a new repo from it, edit `src/config.ts`, add content, and ship.

This file is the single source of truth for the whole team **and** the coding agents.
Codex reads `AGENTS.md` natively; Claude Code reads it via `CLAUDE.md` (`@AGENTS.md`).
Humans onboarding a new site should start with `README.md`; contributors read `CONTRIBUTING.md`.

---

## 1. Overview

A production starter for fast, secure marketing sites: static-first Astro rendered to the
Cloudflare edge, with a single on-demand Worker route powering a "never lose a lead" forms
pipeline. Every page is prerendered; interactivity is added surgically with React islands.

### The supported-Astro-baseline note (READ THIS)

**Astro is pinned to the verified Astro 7 major.** All forked sites should share this supported,
security-patched baseline instead of upgrading framework majors independently.

- Do **not** run `astro add`, `pnpm add`, `pnpm up`, or otherwise bump Astro (or any locked
  dependency) inside a site or in this template. Everything you need is already installed.
- Use current **Astro 7** APIs only; do not adopt experimental APIs in the starter.
- A future major bump is a coordinated, template-wide effort. Use the
  **`zikra-update`** skill; do not upgrade ad hoc.

---

## 2. Locked stack

Do not change, upgrade, or add dependencies — the lockfile is authoritative.

| Area       | Choice                                                                               |
| ---------- | ------------------------------------------------------------------------------------ |
| Framework  | **Astro 7** (pinned major), Node **22+**, TypeScript **strict**, **pnpm**            |
| Hosting    | Cloudflare **Workers** via `@astrojs/cloudflare` (`output: "static"`)                |
| Styling    | **Tailwind v4** (`@tailwindcss/vite`)                                                |
| UI islands | `@astrojs/react` + **shadcn/ui** (new-york style), **lucide-react** icons            |
| Content    | `@astrojs/mdx`, `@astrojs/rss`, `@astrojs/sitemap`, `astro:assets`                   |
| SEO        | `astro-seo`, `astro-seo-schema`, `astro-robots-txt`                                  |
| Analytics  | **GTM** container (main thread), GA4 configured inside it; Partytown for bare GA4    |
| State      | **Nanostores** (+ `@nanostores/react`) cross-island; React `useState` in-island      |
| Forms      | `react-hook-form` + `@hookform/resolvers/zod`, **zod** validation, **sonner** toasts |
| Testing    | **Vitest** (unit); ESLint + Prettier (+ `prettier-plugin-astro`)                     |

**Not in the stack** (do not introduce): Redux, Cloudflare KV, Workers AI, Playwright / e2e.
QA is a human role. Redirects are handled by **Cloudflare Bulk Redirects**, not app code.

---

## 3. Directory map

```
AGENTS.md                     ← this file (single source of truth)
CLAUDE.md                     ← one line: @AGENTS.md
README.md                     ← human onboarding + new-site setup
SETUP.md                      ← the human new-site walkthrough (agents: zikra-deploy)
FORMS.md                      ← the complete forms guide (pipeline, org key, adding forms, failures)
ANALYTICS-SEO.md              ← the complete GTM / GA4 / SEO guide
CONTRIBUTING.md               ← how to build on the template
.mcp.json                     ← shared MCP servers for Claude Code-compatible tools
.codex/config.toml            ← Codex MCP bridge to Astro Docs via npx mcp-remote
skills-lock.json              ← external skill provenance + hashes
.agents/
  skills/                     ← Codex/project agent skills mirror
.claude/
  settings.json               ← Claude Code permission allowlist
  skills/
    zikra-page/SKILL.md
    zikra-blog-post/SKILL.md
    zikra-form/SKILL.md
    zikra-seo-audit/SKILL.md
    zikra-deploy/SKILL.md
    zikra-update/SKILL.md
.github/workflows/ci.yml      ← lint → check → typecheck → test → build
.vscode/extensions.json       ← recommended editor extensions
astro.config.mjs              ← locked (do not edit per-site)
wrangler.jsonc                ← Worker config; assets binding + required secrets
worker-configuration.d.ts     ← generated Wrangler binding/secret types
.dev.vars.example             ← template for local RUNTIME secrets (copy → .dev.vars)
.env.example                  ← template for BUILD-time vars (copy → .env)
package.json  eslint.config.js  .prettierrc.json  vitest.config.ts
components.json               ← shadcn config (new-york, neutral, @/ aliases)
tsconfig.json                 ← strict; "@/*" → "./src/*"
scripts/write-assetsignore.mjs ← preserves dist/client/.assetsignore for safe asset uploads
src/
  config.ts                   ← per-site config (SITE, FORMS registry, PORTAL_API_BASE)
  config.public.ts            ← browser-safe config (TURNSTILE_SITE_KEY) — the ONLY config an island may import at runtime
  env.d.ts                    ← hand-declared OPTIONAL Worker secret (Z360_TOKEN) + build-time ImportMetaEnv; required secrets are generated
  styles/globals.css          ← Tailwind v4 entry + design tokens
  lib/
    utils.ts                  ← cn() class-merge helper
    schema.ts                 ← zod schemas (lead form)
    lead-pipeline.ts          ← testable Turnstile → Portal → Z360 orchestration
    turnstile.ts              ← Turnstile server-side verification (fails closed)
    portal.ts                 ← mandatory portal intake push (server mode)
    z360.ts                   ← optional Z360 CRM push
  components/
    Seo.astro                 ← shared <Seo> (rendered by BaseLayout)
    GoogleTagManager.astro    ← the GTM container snippet (rendered by BaseLayout)
    Header.astro  Footer.astro
    ui/*                      ← shadcn/ui primitives (vendored)
    LeadForm.tsx              ← the reusable form island (every form is one of these)
    ContactForm.tsx           ← thin preset: <LeadForm formId="contact" />
  layouts/
    BaseLayout.astro          ← wraps every page (SEO, JSON-LD, GTM, Header, Footer)
    BlogPost.astro            ← article layout + Article JSON-LD
  content.config.ts           ← "blog" collection schema
  content/blog/*.mdx          ← blog posts
  pages/
    index.astro  contact.astro
    blog/index.astro  blog/[...slug].astro  blog/tags/[tag].astro
    rss.xml.ts  llms.txt.ts
  actions/index.ts            ← the ONE Astro Action (forms pipeline)
tests/lead*.test.ts           ← Vitest tests for schema, payloads, ordering, and failures
```

---

## 4. Conventions

### MCP docs access

The Astro Docs MCP server is intentionally configured in **two committed project files**:

- `.mcp.json` exposes the remote HTTP server (`astro-docs`) for Claude Code and tools that read
  the common MCP JSON shape.
- `.codex/config.toml` exposes the same server to Codex through `npx -y mcp-remote`, matching
  Astro's Codex CLI guidance.

Do not add `mcp-remote` to `package.json` and do not change the locked dependency stack for MCP.
The docs server is remote; the Codex bridge is fetched automatically by `npx` when an agent needs
it.

### Project skills

Project skills are mirrored in both `.agents/skills/` and `.claude/skills/` so Codex-style
agents and Claude Code see the same operating playbooks. Keep the two trees equivalent when
editing local `zikra-*` skills.

External skills are tracked in `skills-lock.json` with source repo, skill path, and content hash.
Use `npx skills list --json` to verify project skill discovery after installs or updates.

### Path alias

`@/…` resolves to `src/…` in `.astro`, `.ts`, and `.tsx` files. Configured in
`tsconfig.json`, `astro.config.mjs`, and `vitest.config.ts`. Prefer it over relative imports.

### Site config

```ts
import { SITE, FORMS, portalSubmitUrl, TURNSTILE_SITE_KEY } from "@/config";
```

`SITE` fields: `url`, `name`, `description`, `defaultTitle`, `defaultAuthor`,
`defaultOgImage`, `gtmId`, `gaMeasurementId`, `z360Enabled`, `z360InquiriesUrl`,
`telephone?`, `address?`.

`FORMS` is the per-site **form registry** — one entry per form, keyed by a short form id
(`FormId`), each carrying the portal `endpointKey` and a human `label`. `portalSubmitUrl(id)`
builds `${PORTAL_API_BASE}/api/forms/<endpointKey>/submit` from it, and `isKnownFormId(id)`
narrows a submitted id to a real entry so an unknown one can never become a request. Endpoint
keys are **routing, not secrets**; the organization's `pok_…` API key that authenticates the
push is the secret, and one of those covers every entry in the registry — so adding a form is
a registry line and never a new secret. See §5.

`TURNSTILE_SITE_KEY` is the **public** Turnstile site key, defined in **`src/config.public.ts`**
and re-exported here.

> **Client islands import values from `@/config.public`, never from `@/config`.** Anything an
> island imports is bundled into the browser, and `@/config` holds the FORMS registry — a
> runtime edge from client code would publish every form's portal endpoint key in page source.
> `src/lib/schema.ts` is bundled with the island too, so it must not import `@/config` either;
> that is why the form id is shape-checked in the schema and membership-checked on the server.
> Types are fine from anywhere: `import type` is erased and creates no edge.

#### Build-time env vars (`.env`) vs runtime secrets (`.dev.vars`)

Two of these values can come from the environment instead of the file, read through
`import.meta.env` and typed in `src/env.d.ts`:

| Variable                    | Default                     | Reaches                   |
| --------------------------- | --------------------------- | ------------------------- |
| `PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare's test sitekey   | browser (needs `PUBLIC_`) |
| `PORTAL_API_BASE`           | `https://portal.z360.cloud` | Worker bundle only        |

They are **build-time**: Astro bakes them in when the site is built, so locally they go in a
gitignored **`.env`** (copy `.env.example`) and in production they are **build environment
variables** in the Cloudflare dashboard / CI — never `wrangler secret put`.

`.dev.vars` is the opposite mechanism: runtime Worker secrets, and the only place a real secret
ever lives. There are exactly three, and **the list does not grow with the number of forms**:

| Secret             | Required?                  | What it is                                                          |
| ------------------ | -------------------------- | ------------------------------------------------------------------- |
| `TURNSTILE_SECRET` | yes                        | The widget's secret half; the site is the only party that verifies  |
| `PORTAL_ORG_KEY`   | yes                        | The **organization's** `pok_…` API key — see the one-key rule below |
| `Z360_TOKEN`       | only if `SITE.z360Enabled` | Optional CRM push                                                   |

**One key per organization — that is the standard, everywhere.** `PORTAL_ORG_KEY` is valid for
every form in the org and every website in it: one form or ten, one site or five, the same key.
It works because the endpoint key in the submit URL already **identifies** the form, so the
bearer only has to **authenticate** the caller. Adding a form is a line in `FORMS` and never a
new secret. (The intake endpoint still accepts a **legacy** per-form `pfk_…` token in this slot
so older integrations keep working; it is not what a new site uses, and it cannot serve more
than one form — the Worker binds one value and sends it for every submission.)

The Turnstile **site** key cannot be a Worker Secret and must not be "fixed" into one: pages
are prerendered (`output: "static"`) and the widget renders in the browser, so a runtime
secret is unreachable without server-rendering the page or an extra round-trip. It is public
by design — it is served to every visitor no matter where it is stored.

> **Agents cannot set secrets in this repo.** `.claude/settings.json` denies
> `Bash(wrangler secret put:*)` and `Read(./.dev.vars)` deliberately. Setting a secret is a
> **human** step: hand over the exact command and stop. Do not route around it with
> `wrangler secret bulk`, `--env-file`, or a hand-written `.dev.vars`, and never write or echo a
> secret value — note that `wrangler turnstile widget create` **prints the secret key**. The
> division of labour is spelled out in the `zikra-deploy` skill.

### Layout & SEO

```astro
---
import BaseLayout from "@/layouts/BaseLayout.astro";
---

<BaseLayout title="…" description="…"> …page content… </BaseLayout>
```

`BaseLayout` props: `{ title?, description?, canonical?, image?, noindex?, type? }` where
`type` is `"website" | "article"`. It already renders the shared `<Seo>` (astro-seo),
sitewide LocalBusiness JSON-LD, the GTM container, the delegated `dataLayer` click
tracking, `Header`, and `Footer`.

Pages **only wrap their content**. Do **not** add your own `<html>`/`<head>`/`<body>` and
do **not** duplicate SEO tags — that is `BaseLayout`'s job.

### Islands vs static (default to zero JS)

Pages are static and ship no JS by default. Add interactivity only where it's needed, as a
React island with an explicit `client:*` directive (`client:load`, `client:visible`, `client:idle`).
Keep islands small; do server work in the Action, not the browser.

- shadcn/ui primitives live in `@/components/ui/*` (already generated): `button`, `input`,
  `textarea`, `label`, `select`, `checkbox`, `radio-group`, `form`, `card`, `dialog`,
  `sheet`, `dropdown-menu`, `navigation-menu`, `accordion`, `tabs`, `badge`, `avatar`,
  `separator`, `tooltip`, `sonner` (exports `Toaster`).
- Class-merge helper: `cn` from `@/lib/utils`.
- `button` also exports `buttonVariants` — style a plain `<a>` as a button with **zero JS**
  instead of shipping an island just to make a link look like a button.

### Content collection

The `blog` collection is defined in `src/content.config.ts`. Frontmatter: `title`,
`description` (50–170 chars), `pubDate` (date), `updatedDate?` (date), `author` (defaults to
`SITE.defaultAuthor`), `tags` (`string[]`), `image?` (`astro:assets` `image()`), `imageAlt?`,
`draft` (default `false`), `canonical?`.

```ts
import { getCollection, render } from "astro:content";
const posts = await getCollection("blog");
// entry.id is the filename slug; const { Content } = await render(entry);
```

Filter out `draft: true` in production listings.

### Accessibility

Labels tied to inputs (`htmlFor`/`id`), meaningful `alt` text (via `astro:assets`), one
semantic `<h1>` per page with correct heading order, and visible focus states. `jsx-a11y`
and Astro's a11y rules run in ESLint.

---

## 5. Forms pipeline (the important part)

> **`FORMS.md`** is the full end-to-end guide: the submission journey, the org `pok_` key
> (and the legacy per-form `pfk_` token) with how to rotate/revoke each, configuring a new
> site step by step,
> adding a second form with `extraFields`, the failure/log-event table, and troubleshooting.
> This section is the summary; read `FORMS.md` before wiring or debugging a real site's forms.

One flow, one Action, **any number of forms**. **shadcn form island (`LeadForm.tsx`) → the
single Astro Action in `src/actions/index.ts`.** The React island calls the Action as JSON
through `astro:actions`; if a future no-JS form is added, deliberately change that Action path
to `accept: "form"` and update the skills/docs together.

Every form on a site is one `<LeadForm formId="…" />` (`ContactForm.tsx` is just the preset
for `contact`). The submitted payload carries that **form id** — shape-checked by `leadSchema`
and checked against the `FORMS` registry server-side by `isKnownFormId` — and the pipeline
turns it into the portal endpoint with `portalSubmitUrl(input.form)`. Adding a form is: create it in the portal, add a line to
`FORMS` in `src/config.ts`, render a `<LeadForm>`. No second Action, no second pipeline.
Per-form fields ride along in the optional `extra` bag (a bounded `Record<string, string>`) —
the portal stores the whole payload verbatim, so they need no portal-side registration.

The Action delegates to the testable lead pipeline, in order:

1. **Verifies Turnstile** (`src/lib/turnstile.ts`) against `TURNSTILE_SECRET`. Turnstile is
   verified **at the website and nowhere else** — tokens are single-use, so exactly one party
   may call siteverify, and that party is the site. The portal runs no challenge check. The
   verifier **fails closed**: a network error, a non-2xx status, or an unexpected body is
   treated as a failed challenge, never waved through.
2. **Submits to the portal** (`src/lib/portal.ts`) — `POST portalSubmitUrl(input.form)` in
   **server mode** (`Authorization: Bearer <PORTAL_ORG_KEY>`), which skips the portal's
   origin check. The endpoint key in that URL is the only thing that **identifies** the form;
   the key merely **authenticates**, and `PORTAL_ORG_KEY` is the organization's `pok_…` API
   key — **one per org, valid for every form in the registry and every website in that org**.
   That is why adding a form needs no new secret. (The endpoint still accepts a legacy
   per-form `pfk_…` token in the same slot so existing integrations keep working, but it is
   not the path a new site takes.) This lands the lead in the central portal, which archives
   the raw JSON to its own R2 bucket **before** inserting into D1 and sends its own
   notification email. Unconditional and hard-failing — see the rule below.
3. **Optionally POSTs to Z360** (`src/lib/z360.ts`) when `SITE.z360Enabled` **and**
   `Z360_TOKEN` are both present.

**The portal is the ONLY durable sink, so its push must hard-fail.** This site keeps no local
copy of a lead — no R2 backup, no notification email of its own. A best-effort portal push
would therefore silently drop the lead the moment the portal hiccups, which is the exact
failure this architecture exists to prevent. So any throw, any non-ok response, and any 2xx
that does not carry the portal's `{ ok: true, submissionId }` confirmation is logged
(`lead_portal_errored` / `lead_portal_failed` / `lead_portal_unconfirmed`) and raised as a
`delivery` failure — every one of those lines carries the `form` id, because on a multi-form
site "the portal rejected a lead" is only actionable once you know which form it was: the org
key is shared, so a failure on one form points at that form's endpoint key while a failure on
all of them points at the key. The visitor sees an error and can retry, rather than being told the message
was sent when it was not. A bare 2xx proves nothing — `submitToPortal` sends
`redirect: "manual"` so a misrouted POST surfaces as a 3xx instead of following into some
login or maintenance page whose 200 would look like a stored lead. The id returned to the
caller is the portal's `submissionId`, the only id naming a stored record. Only
the Z360 push — which runs after the lead is already safe in the portal — is best-effort:
a failure is logged and the pipeline still succeeds. Validate the payload with zod
(`src/lib/schema.ts`) on both the client (react-hook-form resolver) and the server (the Action).

> Notification recipients are configured **in the portal**, not per site. That is why the
> starter carries no `adminEmail` / `emailFromName` and no email provider of its own.

### Secrets rule (critical, non-negotiable)

- `TURNSTILE_SECRET` and `PORTAL_ORG_KEY` are declared as required Worker Secrets in
  `wrangler.jsonc`, validated by Wrangler on deploy, and included in
  `worker-configuration.d.ts`. `PORTAL_ORG_KEY` is the organization's `pok_…` API key: **one
  key per org, covering every form and every website in it**, so a site deploys these two
  secrets once and never adds another as forms are added. (The endpoint also still accepts a
  legacy per-form `pfk_…` token in this slot; it is not the documented path.) `Z360_TOKEN` is
  optional — only sites that enable the CRM push need it — and is therefore hand-declared in
  `src/env.d.ts`.
- These secrets live **only** in Cloudflare Worker Secrets (`wrangler secret put <NAME>`) and
  are imported server-side from **`cloudflare:workers`**, typed by Wrangler-generated bindings.
  `wrangler secret put` is **denied to agents** in `.claude/settings.json` — it is a human step
  (see §4 and the `zikra-deploy` skill).
- **Never** read secrets from `import.meta.env` or `process.env`, and **never** hardcode them.
  `import.meta.env` is resolved at BUILD time and baked into the bundle, which is exactly why
  it is right for the public sitekey and wrong for every one of these three.
- **Never commit secrets.** Local dev uses a **gitignored `.dev.vars`** (copy from
  `.dev.vars.example`). Non-secret config lives in `src/config.ts`, optionally overridden by
  build-time vars in a gitignored **`.env`** (copy from `.env.example`) — see §4. The public
  Turnstile **site** key is one of those: public by design, and unable to be a Worker Secret
  at all on a prerendered page.

---

## 6. Blog

MDX content collection in `src/content/blog/` with a typed schema in `src/content.config.ts`.
`BlogPost.astro` is the article layout (renders Article JSON-LD); `blog/[...slug].astro`
renders a post, `blog/index.astro` lists posts, `blog/tags/[tag].astro` lists by tag. RSS is
served at `/rss.xml` (`@astrojs/rss`) and an LLM-friendly index at `/llms.txt`.

---

## 7. SEO

- Shared `<Seo>` (astro-seo) on **every** page via `BaseLayout` — never duplicate it.
- **LocalBusiness** JSON-LD sitewide + **Article** JSON-LD on blog posts (astro-seo-schema).
- `sitemap.xml` (`@astrojs/sitemap`), `robots.txt` (`astro-robots-txt`, references the sitemap).
- **GTM container** keyed by `SITE.gtmId`, rendered by `BaseLayout` on the **main thread**
  (never Partytown — container-managed tags break in a worker). GA4 and every other tag are
  configured inside the container, so `SITE.gaMeasurementId` stays `""` on a GTM site; it is
  only for a site running bare GA4 with no container, and setting both doubles `page_view`s.
- Site code pushes to `window.dataLayer` (never `window.gtag`, which GTM does not expose).
  `BaseLayout` fires `phone_click` and `cta_<name>`; `LeadForm` fires `form_submit_success`
  with a `form_id` parameter (the event name is unchanged, so existing GTM triggers keep
  working — the parameter is what tells a site's several forms apart).
- Images via `astro:assets` (`<Image>` / `getImage`) — optimized at build time, always with `alt`.

Run the **`zikra-seo-audit`** skill before launch.

**`ANALYTICS-SEO.md`** is the full guide to wiring GTM, GA4, the Cloudflare Google tag
gateway, Search Console, conversion tracking, and the SEO layer — including the `dataLayer`
event contract and the live-site verification snippet. Read it before touching any tagging
code.

---

## 8. State management

- **Nanostores** (+ `@nanostores/react`) for state shared **across islands**.
- React `useState` for state that lives **inside one island**.
- **Not** Redux. No Cloudflare KV.

---

## 9. Commands

All via pnpm.

| Command                 | What it does                                                 |
| ----------------------- | ------------------------------------------------------------ |
| `pnpm dev`              | `astro dev` — local dev server                               |
| `pnpm build`            | `astro build` + preserve `dist/client/.assetsignore`         |
| `pnpm preview`          | `pnpm build && wrangler dev` — run the built Worker locally  |
| `pnpm sync`             | `astro sync` — regenerate content/types                      |
| `pnpm check`            | `astro check` — Astro + template type diagnostics            |
| `pnpm typecheck`        | `astro sync && tsc --noEmit`                                 |
| `pnpm lint`             | `eslint .`                                                   |
| `pnpm lint:fix`         | `eslint . --fix`                                             |
| `pnpm format`           | `prettier --write .`                                         |
| `pnpm format:check`     | `prettier --check .`                                         |
| `pnpm test`             | `vitest run`                                                 |
| `pnpm test:watch`       | `vitest`                                                     |
| `pnpm audit`            | fail on high/critical dependency advisories                  |
| `pnpm verify:build`     | verify build artifacts and JavaScript budgets                |
| `pnpm cf-typegen`       | regenerate `worker-configuration.d.ts` from `wrangler.jsonc` |
| `pnpm cf-typegen:check` | verify generated Worker types are current in CI              |

Before opening a PR, run: `pnpm install --frozen-lockfile && pnpm cf-typegen:check && pnpm format:check && pnpm check && pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm verify:build && pnpm audit`.
CI must be green to merge.

---

## 10. Forking & spinning up a new site (high level)

1. **Use this template** on GitHub (or `degit`) to create the site repo, then `pnpm install`.
2. Create the form(s) in the portal and copy each **endpoint key**; edit **`src/config.ts`**
   (`SITE` + the `FORMS` registry) and drop in brand assets.
3. `cp .dev.vars.example .dev.vars` and fill local secrets; `pnpm dev`.
   (Optionally `cp .env.example .env` for build-time overrides.)
4. Deploy on Cloudflare: create the Worker project, create the Turnstile widget
   (`wrangler turnstile widget create …`) and set its site key as the
   `PUBLIC_TURNSTILE_SITE_KEY` build variable, run `pnpm cf-typegen`, `wrangler secret put`
   the **two** required secrets — `TURNSTILE_SECRET` and the org's `PORTAL_ORG_KEY` (plus
   `Z360_TOKEN` only if the CRM push is on) — connect the domain + DNS, add 301s via
   **Cloudflare Bulk Redirects**, verify Search Console and submit the sitemap.

Adding a form later never adds a secret: one org key covers every form and every site in the
organization.

**`SETUP.md`** is the human step-by-step for a new site (`README.md` is the shorter orientation);
**`FORMS.md`** is the forms deep dive; the agent runbook — who runs which command, and why an
agent must hand the secrets to a human — is the **`zikra-deploy`** skill.

---

## 11. Skills catalog

Zikra skills live in both `.agents/skills/` and `.claude/skills/`. Reach for the matching skill
instead of improvising.

| Skill             | Use it when…                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `zikra-page`      | Adding a new static page — correct `BaseLayout` usage, SEO props, zero-JS default.                        |
| `zikra-blog-post` | Writing a new MDX blog post — frontmatter schema, images, tags, drafts.                                   |
| `zikra-form`      | Adding or changing a form — the FORMS registry, the LeadForm island, zod schema, and the Action pipeline. |
| `zikra-seo-audit` | Pre-launch SEO review — meta, canonicals, JSON-LD, sitemap/robots, GA4, alt text.                         |
| `zikra-deploy`    | Shipping a site to Cloudflare — Turnstile widget, secrets, domain/DNS, redirects, Search Console.         |
| `zikra-update`    | A coordinated dependency update or future framework-major migration.                                      |

Installed external skills:

| Skill                    | Source / use                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `frontend-design`        | Anthropic skill for rich frontend artifacts and visual QA.                               |
| `cloudflare`             | Cloudflare platform guidance and docs routing.                                           |
| `wrangler`               | Cloudflare Workers CLI commands, deploys, secrets, R2, and typegen.                      |
| `workers-best-practices` | Workers production review: bindings, secrets, observability, promises, runtime patterns. |
| `turnstile-spin`         | Turnstile setup and verification workflow.                                               |
| `web-perf`               | Performance/Core Web Vitals audits.                                                      |
| `seo-audit`              | Marketing SEO audit helper, used alongside `zikra-seo-audit`.                            |

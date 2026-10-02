# zikra-astro-starter

The reusable foundation every Zikra agency site is forked from. It's a **GitHub template
repo**: you create a new repo from it, edit one config file, add content, and deploy to the
Cloudflare edge. Every page is prerendered static HTML; a single Worker route powers a
"never lose a lead" contact-form pipeline.

**Stack:** Astro 7 · Cloudflare Workers · Tailwind v4 · shadcn/ui (React islands) · MDX blog ·
astro-seo · Vitest.

> **Astro is pinned to the verified Astro 7 major.** Do not upgrade framework majors or locked
> dependencies ad hoc. Major changes are coordinated in the starter with the `zikra-update`
> skill, green CI, and a Cloudflare preview before forks adopt them.

> ### 👉 Setting up a new site? Start with [`SETUP.md`](./SETUP.md).
>
> It is the start-to-finish manual walkthrough — ordered, copy-pasteable steps from "Use this
> template" to a live, verified site: the portal forms and endpoint keys, the **one** org API
> key, `.env` vs `.dev.vars`, the Turnstile widget, the two Worker secrets, deploy, and
> troubleshooting. **This is the primary onboarding path.** The rest of this README is the
> summary and the reference.

- **New-site setup, step by step:** [`SETUP.md`](./SETUP.md)
- **Daily reference (team + agents):** [`AGENTS.md`](./AGENTS.md)
- **Forms, end to end:** [`FORMS.md`](./FORMS.md) — the full guide to wiring up a site's forms:
  how a submission travels, the org portal key, new-site setup, adding a second form,
  failure modes, and troubleshooting.
- **Building on the template:** [`CONTRIBUTING.md`](./CONTRIBUTING.md)

---

## Prerequisites

- **Node.js ≥ 22** and **pnpm** (repo pins `pnpm@11`; `corepack enable` will honor it).
- A **Cloudflare account** (Workers + Turnstile) and **Wrangler** (installed as a dev dependency).
- One or more **forms in the Zikra portal** — each form's endpoint key, plus your
  organization's `pok_…` API key. **One key per organization**: it covers every form and every
  website in that org, so a site sets it once and adding a form later needs no new secret. The
  portal is the durable lead sink and sends the notification emails, so the site needs no email
  provider.
- Optional: a **Z360** CRM token if you want leads pushed to the CRM.

---

## Quickstart (local)

```bash
# 1. Create a repo from this template ("Use this template" on GitHub),
#    or scaffold directly:
pnpm dlx degit Zikra-Infotech-LLC/zikra-astro-starter my-site
cd my-site

# 2. Install (uses the committed lockfile — do not add/upgrade deps).
pnpm install

# 3. Local secrets for the Worker runtime (gitignored).
cp .dev.vars.example .dev.vars   # then fill in real values

# 4. Optional: build-time, non-secret overrides (gitignored).
cp .env.example .env             # sitekey / portal origin, if not using defaults

# 5. Run the dev server.
pnpm dev
```

The defaults in `.dev.vars.example` and `src/config.ts` use Cloudflare's Turnstile **test**
keys, so the spam check passes locally without real credentials. A **full** submission also
needs a real `PORTAL_ORG_KEY` and a real `endpointKey` in the `FORMS` registry: the portal
is the only durable sink for a lead, so that push is unconditional and hard-failing. Without
them the form renders and validates fine but returns an error on submit — deliberately, so a
lead can never look delivered when it was not.

**`.env` vs `.dev.vars`** — they are different mechanisms and mixing them up breaks things
quietly:

| File        | Read at    | Holds                                                             | Production equivalent                            |
| ----------- | ---------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| `.env`      | build time | non-secret config: `PUBLIC_TURNSTILE_SITE_KEY`, `PORTAL_API_BASE` | **build** environment variables (dashboard / CI) |
| `.dev.vars` | runtime    | real secrets: `TURNSTILE_SECRET`, `PORTAL_ORG_KEY`, `Z360_TOKEN`  | `wrangler secret put <NAME>`                     |

The Turnstile **site** key is public by design — the widget renders in the browser, so the key
is served to every visitor regardless. It cannot be a Worker Secret: pages here are prerendered
at build time, so nothing runtime-only is reachable from them.

### AI docs access

This repo commits project-level MCP configuration so coding agents can pull current Astro docs
instead of relying only on model memory:

- **Claude Code:** uses `.mcp.json`, which points `astro-docs` at Astro's remote MCP server.
- **Codex CLI:** uses `.codex/config.toml`, which starts `mcp-remote` through `npx -y` and
  bridges Codex to the same remote Astro Docs MCP server.

There is no app dependency to install for this. The Astro Docs MCP server runs remotely at
`https://mcp.docs.astro.build/mcp`; Codex downloads the tiny `mcp-remote` bridge on first use
through `npx` if it is not already cached locally. In other words, after `pnpm install`, a
developer can open this repo in Claude Code or Codex and the Astro docs tool is discovered from
the committed project config.

### AI skill access

Project skills are mirrored into **`.agents/skills`** and **`.claude/skills`** so Codex and
Claude Code get the same local playbooks. The repo ships the six Zikra skills plus the requested
external skills: `frontend-design`, `cloudflare`, `wrangler`, `workers-best-practices`,
`turnstile-spin`, `web-perf`, and `seo-audit`.

Run `npx skills list --json` to verify discovery after a fresh clone or skill update. External
skill provenance is tracked in `skills-lock.json`.

---

## Spinning up a new site

### 1. Configure the site

Edit **`src/config.ts`** — this is the one file every site touches first:

- `SITE`: `url` (canonical, no trailing slash), `name`, `description`, `defaultTitle`,
  `defaultAuthor`, `defaultOgImage`, `gtmId`, `gaMeasurementId` (empty string disables GA4),
  `z360Enabled`, `z360InquiriesUrl`, and optional `telephone` / `address` for LocalBusiness
  structured data.
- `FORMS`: the **form registry** — one line per form, keyed by a short form id:

  ```ts
  export const FORMS = {
    contact: { endpointKey: "contact_abc123", label: "Contact" },
    quote: { endpointKey: "quote_def456", label: "Quote request" },
  } as const satisfies Record<string, FormConfig>;
  ```

  Copy each `endpointKey` from that form's detail page in the portal. Endpoint keys are
  routing, **not secrets** — the org `pok_…` key is the secret, and the same one already
  covers the new form, so **no new secret is needed**. Render a form with
  `<LeadForm formId="quote" client:load />`; there is nothing else to wire up.
  Full walkthrough — including how to rotate the org key — is in [`FORMS.md`](./FORMS.md).

- `TURNSTILE_SITE_KEY`: your **public** Turnstile site key. Set it with the
  `PUBLIC_TURNSTILE_SITE_KEY` build variable (`.env` locally, build settings in production);
  it falls back to Cloudflare's test key. The widget it belongs to must allow every hostname
  this site is served from.

Add brand assets: replace `public/og-default.png` (and favicon), and place any local images
imported through `astro:assets`.

Write content: edit `src/pages/index.astro` and `src/pages/contact.astro`, and add posts under
`src/content/blog/*.mdx`. Use the `zikra-page` and `zikra-blog-post` skills.

### 2. Provision Cloudflare

```bash
# Create (or select) the Worker project for this site, then:

# Turnstile widget — list every hostname the form is served from. Set the
# printed sitekey as the PUBLIC_TURNSTILE_SITE_KEY build variable and keep the
# secret for the next command.
wrangler turnstile widget create "My Site production" \
  --domain example.com --domain www.example.com \
  --domain localhost --domain 127.0.0.1 \
  --mode managed --json

# Worker Secrets (production). NEVER commit these; NEVER put them in wrangler.jsonc.
wrangler secret put TURNSTILE_SECRET
wrangler secret put PORTAL_ORG_KEY      # the org's pok_… API key — covers every form
wrangler secret put Z360_TOKEN          # only if z360Enabled is true

# Regenerate Worker binding/secret types after editing wrangler.jsonc.
pnpm cf-typegen
```

Then set the **build** environment variables on the Worker (dashboard → Settings → Build, or
your CI): `PUBLIC_TURNSTILE_SITE_KEY`, and `PORTAL_API_BASE` if this site talks to anything
other than the production portal. These are baked in at build time — do not try to set them
with `wrangler secret put`.

> **Secrets rule:** `TURNSTILE_SECRET` and `PORTAL_ORG_KEY` are required Worker Secrets declared
> in `wrangler.jsonc` — two, and only ever two, however many forms the site has; `Z360_TOKEN` is
> optional and only needed when `z360Enabled` is true. Secrets
> live only in Worker Secrets (prod) / the gitignored `.dev.vars` (local), and are imported on the
> server from `cloudflare:workers`. Never `import.meta.env`, never `process.env`, never hardcoded.
> `import.meta.env` is for the non-secret build-time values above, and only those.

### 3. Ship & verify

- **Deploy** the site (build then `wrangler deploy`, or via the connected Git integration).
- **Connect the domain + DNS** in the Cloudflare dashboard.
- **Add 301 redirects** for any legacy URLs via **Cloudflare Bulk Redirects** (not app code).
- **Verify Google Search Console** for the domain and **submit the sitemap** (`/sitemap-index.xml`).
- Run the **`zikra-seo-audit`** skill and follow the **`zikra-deploy`** checklist.

---

## Command reference

| Command                 | Description                                                      |
| ----------------------- | ---------------------------------------------------------------- |
| `pnpm dev`              | Start the local dev server (`astro dev`).                        |
| `pnpm build`            | Production build plus safe `dist/client/.assetsignore` handling. |
| `pnpm preview`          | Build, then run the Worker locally (`wrangler dev`).             |
| `pnpm sync`             | Regenerate content collection + Astro types.                     |
| `pnpm check`            | Astro + template type diagnostics (`astro check`).               |
| `pnpm typecheck`        | `astro sync && tsc --noEmit`.                                    |
| `pnpm lint`             | ESLint (`eslint .`).                                             |
| `pnpm lint:fix`         | ESLint with autofix.                                             |
| `pnpm format`           | Prettier write (`prettier --write .`).                           |
| `pnpm format:check`     | Prettier check.                                                  |
| `pnpm test`             | Vitest unit tests (`vitest run`).                                |
| `pnpm test:watch`       | Vitest in watch mode.                                            |
| `pnpm audit`            | Fail on high/critical dependency advisories.                     |
| `pnpm verify:build`     | Verify routes, Worker artifacts, and JavaScript budgets.         |
| `pnpm cf-typegen`       | Regenerate `worker-configuration.d.ts` from Wrangler config.     |
| `pnpm cf-typegen:check` | Verify generated Worker types are current.                       |

Before a PR: `pnpm install --frozen-lockfile && pnpm cf-typegen:check && pnpm format:check && pnpm check && pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm verify:build && pnpm audit`.
CI must be green to merge.

### Keeping forks current

Template releases use the `package.json` version, a matching `vX.Y.Z` Git tag, and the release
notes in `CHANGELOG.md`. Existing sites add this repository as a `starter` remote, compare their
last applied tag with the newest release, and cherry-pick focused shared-infrastructure commits.
Always preserve per-site config, content, assets, and Wrangler bindings during conflicts. Follow
the mirrored `zikra-update` skill and validate on a non-production Cloudflare preview.

---

## Project structure

```
src/
  config.ts              per-site config (SITE, FORMS registry, TURNSTILE_SITE_KEY) — edit this first
  layouts/               BaseLayout (SEO/JSON-LD/GA4/Header/Footer), BlogPost
  components/            Seo, Header, Footer, LeadForm island (+ ContactForm preset), ui/* (shadcn)
  lib/                   schema, testable lead pipeline, Turnstile, Portal, Z360
  content/blog/*.mdx     blog posts (typed via content.config.ts)
  pages/                 index, contact, blog/*, rss.xml.ts, llms.txt.ts
  actions/index.ts       the single Astro Action (forms pipeline, all forms)
tests/                   Vitest unit tests
scripts/write-assetsignore.mjs preserves dist/client/.assetsignore after build
astro.config.mjs         locked — do not edit per-site
wrangler.jsonc           Worker config: assets binding + required secrets
worker-configuration.d.ts generated Worker binding/secret types
.dev.vars.example        copy to .dev.vars for local runtime secrets
.env.example             copy to .env for build-time, non-secret overrides
```

See [`AGENTS.md`](./AGENTS.md) for the full architecture, the forms pipeline, and the skills
catalog.

---

## License

Private — internal Zikra template. Not for redistribution.

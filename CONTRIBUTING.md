# Contributing

This covers building **on** the template — both in a forked site and in the template itself.
Read [`AGENTS.md`](./AGENTS.md) first; it's the source of truth for architecture and
conventions. This file is about _how you work_.

---

## Branching

- Never commit to `main` directly. Open a PR.
- Branch names: `type/short-description`, where `type` is one of
  `feat` · `fix` · `chore` · `docs` · `refactor` · `test`.
  Examples: `feat/pricing-page`, `fix/contact-form-validation`, `docs/deploy-steps`.
- Keep PRs small and focused on one change.

---

## Use the skills

Reach for the matching skill instead of improvising — they encode the conventions below.
Project skills are mirrored in `.agents/skills` and `.claude/skills` so Codex and Claude Code
see the same playbooks. Verify discovery with `npx skills list --json` after changing skills.

| Task                        | Skill             |
| --------------------------- | ----------------- |
| New static page             | `zikra-page`      |
| New MDX blog post           | `zikra-blog-post` |
| Add / change a form         | `zikra-form`      |
| Pre-launch SEO review       | `zikra-seo-audit` |
| Deploy a site to Cloudflare | `zikra-deploy`    |
| Coordinated dependency bump | `zikra-update`    |

The repo also includes external skills for `frontend-design`, `cloudflare`, `wrangler`,
`workers-best-practices`, `turnstile-spin`, `web-perf`, and `seo-audit`. Their source and hashes
are tracked in `skills-lock.json`.

---

## Coding conventions

- **TypeScript strict.** No `any` escape hatches (the only relaxation is the vendored
  `src/components/ui/*` primitives). Worker bindings/secrets are generated from `wrangler.jsonc`
  into `worker-configuration.d.ts`, then exposed through the typed `env` import from
  `cloudflare:workers`.
- **Path alias:** import with `@/…` (→ `src/…`), not long relative paths.
- **Static by default, zero JS.** Pages are prerendered and ship no client JS. Add
  interactivity only where needed, as a small React island with an explicit `client:*`
  directive. To make a link _look_ like a button, use `buttonVariants` from
  `@/components/ui/button` on an `<a>` — don't ship an island for that.
- **shadcn/ui for interactive islands only.** Use the primitives in `@/components/ui/*`;
  merge classes with `cn` from `@/lib/utils`.
- **Layout:** wrap page content in `BaseLayout` and set its SEO props. Never add your own
  `<html>`/`<head>`/`<body>` or duplicate SEO tags — `BaseLayout` owns them.
- **State:** Nanostores across islands, React `useState` within an island. Not Redux.
- **Validation:** zod (`src/lib/schema.ts`), shared by the client form and the server Action.
- **Forms:** every form is a `<LeadForm formId="…" />` island backed by an entry in the `FORMS`
  registry in `src/config.ts`. Add a form by adding a registry line and rendering the island —
  never by cloning the island or adding a second Action. Per-form fields go in the bounded
  `extra` bag, not in new top-level schema keys.
- **Accessibility:** labels tied to inputs, `alt` on every image, one `<h1>` per page with
  correct heading order, visible focus states. `jsx-a11y` + Astro a11y rules run in ESLint.
- **Do not edit the locked files** (`astro.config.mjs`, `package.json`, `pnpm-lock.yaml`,
  `tsconfig.json`, `wrangler.jsonc`, ESLint/Prettier/Vitest configs, `src/config.ts` except
  for real per-site values, `src/env.d.ts`, `src/styles/globals.css`, `src/lib/utils.ts`,
  `src/components/ui/*`, the shared `Seo`/`Header`/`Footer`/`BaseLayout`). Do not upgrade
  dependencies — see the supported-Astro-baseline note in `AGENTS.md`.
- If `wrangler.jsonc` changes, run `pnpm cf-typegen` and commit the updated
  `worker-configuration.d.ts`.
- Keep `scripts/write-assetsignore.mjs` in the build path. It preserves the Cloudflare adapter's
  `dist/client/.assetsignore` so Wrangler never uploads local secrets or generated config files.

---

## Secrets — never commit them

- `TURNSTILE_SECRET` and `PORTAL_ORG_KEY` are required Worker Secrets in `wrangler.jsonc`.
  Both are required because the forms pipeline cannot run without either: the site verifies
  Turnstile itself, and the portal is the one durable lead sink. `PORTAL_ORG_KEY` is the
  organization's `pok_…` API key — **one per org**, valid for every form in the registry and
  every website in that org, which is why adding a form needs a registry line and no new
  secret. (A legacy per-form `pfk_…` token is still accepted in that slot for older
  integrations, but it is not what a new site uses.) `Z360_TOKEN` is optional and only needed
  when a site enables the CRM push.
- Secrets live **only** in Cloudflare Worker Secrets (prod) and the **gitignored `.dev.vars`**
  (local). Import them on the server from `cloudflare:workers` — **never** `import.meta.env`,
  `process.env`, or hardcoded.
- Non-secret, build-time config goes in `src/config.ts`, and may be overridden by **build-time
  environment variables**: `PUBLIC_TURNSTILE_SITE_KEY` and `PORTAL_API_BASE`, declared in
  `src/env.d.ts` and read through `import.meta.env`. Locally they live in a gitignored `.env`
  (copy `.env.example`); in production they are **build** environment variables in the
  Cloudflare dashboard / CI. `.env` is not `.dev.vars`: build-time values are baked into the
  bundle, which is why only non-secrets may go there — and why the **public** Turnstile _site_
  key belongs there rather than in a Worker Secret it could never be read from.
- If you ever commit a secret, treat it as compromised: rotate it immediately.

---

## Before every PR

Run the full gate locally and make sure it passes:

```bash
pnpm install --frozen-lockfile && pnpm cf-typegen:check && pnpm format:check && pnpm check && pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm verify:build && pnpm audit
```

CI runs the same typegen, format, lint, check, typecheck, test, build, artifact, performance, and
security gates on every PR and push to `main`. **CI must be green to merge.**
No Playwright/e2e — QA is a human role.

---

## Template maintenance and releases

- Review grouped Dependabot patch/minor PRs at least monthly. Handle high/critical advisories
  immediately instead of waiting for the maintenance window.
- Keep dependency majors isolated from one another and use `zikra-update`; Astro and its official
  integrations move together in a dedicated migration PR.
- Before merging a template release, require one approving review, the `verify` CI job, and a
  successful non-production Cloudflare preview. Repository administrators should enforce those
  controls with a `main` branch ruleset when the GitHub organization plan supports private-repo
  rulesets.
- After merge, update `package.json`, add the matching `vX.Y.Z` tag, and publish GitHub Release
  notes from `CHANGELOG.md`. Do not tag a release from an unmerged feature branch.
- Keep dependency graph, Dependabot alerts/security updates, secret scanning, and push protection
  enabled in repository security settings wherever the GitHub plan makes them available.

---

## Working with shadcn/ui components

- **Update an existing primitive:** re-run the generator and re-review the diff.

  ```bash
  pnpm dlx shadcn@latest add button --overwrite
  ```

  Keep vendored components close to upstream; site-specific styling belongs in the consumer,
  not the primitive.

- **Add a new primitive** the project doesn't ship yet:

  ```bash
  pnpm dlx shadcn@latest add tooltip
  ```

  It lands in `@/components/ui/*` using the repo's `components.json` settings (new-york style,
  neutral base color, `@/` aliases, lucide icons).

- **Add a new _shared_ UI component** (a Zikra-specific composition, not a shadcn primitive):
  put it in `@/components/` (not `ui/`), build it from existing primitives + `cn`, keep it
  server-renderable where possible, and make it an island only if it needs interactivity.
  Document non-obvious props with JSDoc.

The shadcn MCP server (see `.mcp.json`) is available to browse components and blocks.

The Astro Docs MCP server is also configured at the project level:

- `.mcp.json` is the shared HTTP MCP config used by Claude Code and other tools that read the
  common MCP JSON shape.
- `.codex/config.toml` is the Codex CLI project config. It uses `npx -y mcp-remote` because
  Codex expects a local stdio command while Astro's docs server is a remote streamable HTTP MCP
  server.

Keep both files committed. Do not add `mcp-remote` to `package.json`; it is a tool bridge that
`npx` can fetch automatically, not part of the production site stack.

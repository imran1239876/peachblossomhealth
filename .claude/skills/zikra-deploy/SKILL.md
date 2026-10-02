---
name: zikra-deploy
description: Use when deploying a Zikra site to Cloudflare for the first time or setting up its production infrastructure — covers creating the Worker project (Git integration or wrangler), creating the Turnstile widget, setting the PUBLIC_TURNSTILE_SITE_KEY / PORTAL_API_BASE build variables and the TURNSTILE_SECRET / PORTAL_ORG_KEY / optional Z360_TOKEN Worker secrets, connecting the domain and DNS, adding 301 redirects via Cloudflare Bulk Redirects, and verifying Search Console with a sitemap submission.
---

# Provision a Zikra site on Cloudflare — agent runbook

An executable, ordered runbook for taking a fresh fork of the starter to a live site. Every step is
tagged **AGENT** (you run it) or **HUMAN** (you stop, hand over the exact command, and wait).

The build emits a Cloudflare Worker (`@astrojs/cloudflare`, `output: "static"`). Static pages are
served as assets from `dist/client`; the Worker handles only on-demand routes — the Astro Actions
endpoint that runs the forms pipeline. Do the steps **in order**: the Turnstile widget and both
secrets must exist before a single form submission can succeed.

The human-facing walkthrough of the same ground is **[`SETUP.md`](../../../SETUP.md)**; the forms
deep dive is **[`FORMS.md`](../../../FORMS.md)**. Point the human at `SETUP.md` when they ask "what
do I do?"; this file is what *you* execute.

---

## 0. Rule zero — the secret boundary

Read this before running anything. Getting it wrong leaks a credential permanently.

**You cannot set secrets in this repo, by design.** `.claude/settings.json` denies
`Bash(wrangler secret put:*)` and `Read(./.dev.vars)`. That is deliberate, not an obstacle to route
around:

- Do **not** reach for `wrangler secret bulk`, `--env-file`, a `.dev.vars` you write yourself, a
  wrapper script, or any other path that puts a secret value into a command, a file, or the repo.
  If a step needs a secret set, it is a **HUMAN** step. Hand over the command and stop.
- Do **not** write a secret value into `.env`, `.dev.vars`, `src/config.ts`, `wrangler.jsonc`, a
  test fixture, a commit message, or a scratch file.
- Do **not** echo, quote, summarize, or "confirm" a secret value in your own output. Not the first
  four characters, not "it ends in …". If you have seen one, the only correct next move is to say
  *where* the human can read it and let them copy it themselves.

**`wrangler turnstile widget create` prints the secret key to stdout** — in the plain output and in
`--json`. So does `wrangler turnstile widget get <sitekey>`. `wrangler turnstile widget list` does
**not** (its table is sitekey, name, mode, domains, clearance level, bot-fight mode, region,
created-on).

Therefore, for step 3, prefer this split:

- **HUMAN** runs `turnstile widget create` in their own terminal, so the secret never enters your
  transcript at all. They then set `TURNSTILE_SECRET` from the same terminal window.
- **AGENT** reads the sitekey back with `turnstile widget list` — public, no secret — and wires it
  into `.env` and the build variables.

If the human explicitly asks you to run `create` yourself, you may — but treat the printed secret as
write-once-to-them: tell them it is on screen in your terminal output and that they must copy it
into `wrangler secret put TURNSTILE_SECRET` themselves. Never repeat the value back.

### What each side owns, at a glance

| Thing                                                               | Who                 | Why                                                        |
| ------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------- |
| `src/config.ts`, `wrangler.jsonc`, pages, content                   | **AGENT**           | Ordinary code edits                                        |
| `.env` (build vars — sitekey, portal base)                          | **AGENT**           | Non-secret by definition; the sitekey ships to the browser |
| `pnpm cf-typegen`, lint / check / typecheck / test / build          | **AGENT**           | On the settings allowlist                                  |
| `wrangler login`                                                    | **HUMAN**           | Interactive browser OAuth                                  |
| `wrangler turnstile widget create`                                  | **HUMAN** preferred | Prints the secret                                          |
| `wrangler turnstile widget list` / `update`                         | **AGENT**           | No secret in the output                                    |
| `wrangler secret put <NAME>`                                        | **HUMAN**           | **Denied to agents** in `.claude/settings.json`             |
| `.dev.vars` (local runtime secrets)                                 | **HUMAN**           | Secrets; the agent cannot even read the file               |
| Cloudflare dashboard: build variables, domains, DNS, Bulk Redirects | **HUMAN**           | No CLI path in this stack                                  |
| `wrangler deploy` / connecting the Git integration                  | **HUMAN**           | Publishes a public site — get an explicit go-ahead         |
| Google Search Console                                               | **HUMAN**           | Their Google account                                       |

---

## 1. Per-site config — **AGENT**

```bash
pnpm install
```

Then edit **`src/config.ts`**:

- `SITE.url` — the real production URL, **no trailing slash**. Canonicals, OG tags, the sitemap and
  RSS all derive from it.
- `SITE.name`, `SITE.description`, `SITE.defaultTitle`, `SITE.defaultAuthor`, `SITE.defaultOgImage`.
- `SITE.gtmId` — the GTM container ID (`GTM-XXXXXXX`). Empty string disables tagging; without it the
  site ships with no analytics at all.
- `SITE.gaMeasurementId` — keep it `""` whenever `gtmId` is set. GA4 belongs inside the container;
  both at once doubles every `page_view`.
- `SITE.telephone` / `SITE.address` — optional, feed the LocalBusiness JSON-LD.
- `SITE.z360Enabled` + `SITE.z360InquiriesUrl` — only if the CRM push is wanted.
- **`FORMS` — required.** One entry per form, each with the `endpointKey` from that form's detail
  page in the portal. The portal is the one durable lead sink, so a wrong key here means every
  submission to that form hard-fails. Endpoint keys are **routing, not secrets** — they are fine in
  the repo.

The Turnstile **site** key is deliberately not in this file; it arrives as a build variable in
step 4.

Then give the site a unique `name` in **`wrangler.jsonc`** (it is the Worker's name) and regenerate
the binding types:

```bash
pnpm cf-typegen
```

Commit the regenerated `worker-configuration.d.ts` — CI runs `pnpm cf-typegen:check`, so bindings
and required secrets cannot drift from the deploy config.

> Leave `secrets.required` in `wrangler.jsonc` alone. `TURNSTILE_SECRET` and `PORTAL_ORG_KEY` are
> declared there so `wrangler deploy` **fails** when either is missing, rather than shipping a site
> whose forms reject or drop every lead.

---

## 2. Authenticate and create the Worker project — **HUMAN**

Wrangler is a dev dependency, so every command is `pnpm wrangler …`. Authentication is a browser
flow, so the human runs it once:

```bash
pnpm wrangler login
```

Then pick **one** path for the Worker itself.

**Option A — Cloudflare Git integration (recommended; gives auto-deploy and PR previews).**
Dashboard → Workers & Pages → Create → connect the GitHub repo, then set:

- Build command: `pnpm build`
- Deploy command: `pnpm wrangler deploy`

Pushes to the default branch build and deploy automatically; other branches get preview
deployments (which `zikra-update` relies on).

**Option B — manual / CI.**

```bash
pnpm build
pnpm wrangler deploy
```

Either way this **publishes a public site**, so an agent must not run it on its own initiative — ask
first and wait for a clear yes.

You can verify the account/session without deploying anything:

```bash
pnpm wrangler whoami      # AGENT may run this
```

---

## 3. Create the Turnstile widget — **HUMAN** (preferred), sitekey read back by **AGENT**

Turnstile is verified at the **website**: the site's Astro Action calls siteverify and the portal
downstream performs no challenge check at all. Tokens are single-use, so exactly one party may
verify — and that party is this site. It therefore needs its own widget.

List **every** hostname the form is served from — apex, `www`, and the local dev hosts. A hostname
the widget does not list fails verification even though the challenge renders perfectly.

```bash
pnpm wrangler turnstile widget create "<Site> production" \
  --domain example.com --domain www.example.com \
  --domain localhost --domain 127.0.0.1 \
  --mode managed
```

The output contains **both halves of the pair**:

1. the **sitekey** — public, goes in the `PUBLIC_TURNSTILE_SITE_KEY` build variable (step 4);
2. the **secret** — goes straight into `wrangler secret put TURNSTILE_SECRET` (step 5) and nowhere
   else. See rule zero: it must never land in a file, a commit, or agent output.

Afterwards the agent can read back everything it needs without touching the secret:

```bash
pnpm wrangler turnstile widget list                       # AGENT — sitekey + domains, no secret
pnpm wrangler turnstile widget update <sitekey> \
  --domain example.com --domain www.example.com \
  --domain staging.example.com --domain localhost --domain 127.0.0.1
```

`wrangler turnstile widget get <sitekey>` re-prints the secret — that is the human's recovery path
if they lose it, not an agent command.

The `turnstile-spin` skill (installed in `.claude/skills/`, tracked in `skills-lock.json`) is the
fuller playbook when the widget, the island, or the verification needs more than this.

---

## 4. Build variables — `.env` by **AGENT**, production values by **HUMAN**

These are **not** Worker Secrets. Astro resolves them through `import.meta.env` when the site is
**built**, so they must exist in the *build* environment.

| Variable                    | Required?                  | Value                                                                                                                                                    |
| --------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_TURNSTILE_SITE_KEY` | yes, before launch         | the sitekey from step 3. Without it the build falls back to Cloudflare's test key `1x00000000000000000000AA`, which passes every challenge — a live site with no spam protection. |
| `PORTAL_API_BASE`           | only for a non-prod portal | the portal origin, no trailing slash. Defaults to `https://portal.z360.cloud`.                                                                             |

**AGENT** — locally:

```bash
cp .env.example .env      # .env is gitignored
```

and set `PUBLIC_TURNSTILE_SITE_KEY` in it. Writing the sitekey here is fine: it is public by design
and is served to every visitor regardless of where it is stored.

**HUMAN** — in production: Cloudflare dashboard → the Worker → Settings → Build → Variables (or the
equivalent CI environment). Same two names, same values.

**Why these cannot be Worker Secrets.** Pages here are prerendered at build time (`output: "static"`)
and the Turnstile widget renders in the **browser**. A Worker Secret is a runtime value that does not
exist yet when the page is built, and is not reachable from prerendered client JS without
server-rendering the page or paying for an extra round-trip before the widget can appear. The sitekey
is public anyway. The converse is just as absolute: **never** move a real secret into a build
variable — build values are baked into the deployed bundle and cannot be taken back.

Rebuild after changing either one. The value is compiled in, so an already-deployed Worker will not
pick it up.

---

## 5. Worker secrets — **HUMAN** (agent is denied)

Hand the human this block verbatim. Each command prompts for the value on stdin; nothing is written
to the repo.

```bash
pnpm wrangler secret put TURNSTILE_SECRET      # the secret half of the widget from step 3
pnpm wrangler secret put PORTAL_ORG_KEY        # the org's pok_… API key
pnpm wrangler secret put Z360_TOKEN            # OPTIONAL — only if SITE.z360Enabled is true
```

- **`TURNSTILE_SECRET`** — required. The site is the only party that verifies the challenge.
- **`PORTAL_ORG_KEY`** — required. The **organization's** `pok_…` API key, from the portal under
  **Settings → API key**. **One key per organization**: it is valid for every form in that org and
  every website in it. These are the only two secrets the site ever sets — a second, fifth or tenth
  entry in the `FORMS` registry needs none, because the endpoint key in the submit URL *identifies*
  the form while this key only *authenticates* the caller.
- **`Z360_TOKEN`** — optional, and only read when `SITE.z360Enabled` is true. Both switches are
  required or the CRM push is skipped.

The intake endpoint still accepts a **legacy** per-form `pfk_…` token in the `PORTAL_ORG_KEY` slot,
so sites wired up before the org key keep working. It is not the path for a new site, and it cannot
serve more than one form: the Worker binds a single value and sends it for every submission, so a
second form would present the first form's token and the portal would answer `401` on every real
lead.

Both credentials are shown **exactly once** by the portal (it stores only a SHA-256 hash). If one is
lost, rotate it — see `FORMS.md` §2.

**Local development** also needs the runtime secrets, in a gitignored `.dev.vars`:

```bash
cp .dev.vars.example .dev.vars     # HUMAN then fills in the real values
```

The agent cannot read `.dev.vars` (`Read(./.dev.vars)` is denied) and must not write it. Its default
`TURNSTILE_SECRET` is Cloudflare's "always passes" test secret, which pairs with the test sitekey —
fine locally, never in production.

**AGENT verification** — confirm the names landed without ever seeing a value:

```bash
pnpm wrangler secret list --format pretty     # prints secret NAMES only, never values
```

Expect `TURNSTILE_SECRET` and `PORTAL_ORG_KEY` (plus `Z360_TOKEN` if enabled).

---

## 6. Domain + DNS — **HUMAN**

In the Cloudflare dashboard:

1. Add the site's zone to Cloudflare (or confirm it is already there) and point the registrar's
   nameservers at Cloudflare.
2. Worker → Settings → Domains & Routes → add a **Custom Domain** for each production hostname
   (`example.com`, `www.example.com`). Cloudflare provisions the DNS record and TLS certificate.
3. Decide apex vs `www` and redirect the non-canonical host to the canonical one — the one that
   matches `SITE.url`.

Every hostname served must also appear on the Turnstile widget from step 3. If a hostname was added
later, an **AGENT** can extend the widget with `turnstile widget update` (step 3).

---

## 7. 301 redirects for a migration — **HUMAN**

Redirects are infrastructure here, never app code. Dashboard → Account Home → Bulk Redirects:

1. Create a Bulk Redirect List mapping each old URL → new URL.
2. Use **301 (permanent)** for moved pages.
3. Enable a Bulk Redirect Rule that uses the list.
4. Spot-check a few old URLs.

---

## 8. Search Console — **HUMAN**

1. Add the property (Domain property preferred — verify with the DNS TXT record in Cloudflare DNS).
2. Submit the sitemap: `https://<domain>/sitemap-index.xml`.
3. URL-inspect the home page and a key post; request indexing.
4. Confirm `https://<domain>/robots.txt` references the sitemap and does not disallow the site.

`ANALYTICS-SEO.md` is the full guide to GTM, GA4, the Google tag gateway and conversion tracking.

---

## 9. Verification — **AGENT** runs the gate, **HUMAN** eyeballs the live site

### The full local gate (agent, before handing back)

```bash
pnpm install --frozen-lockfile && \
pnpm cf-typegen:check && \
pnpm format:check && \
pnpm check && \
pnpm typecheck && \
pnpm lint && \
pnpm test && \
pnpm build && \
pnpm verify:build && \
pnpm audit
```

Every one of these must pass before a deploy is proposed. What the less obvious ones prove:

- `pnpm cf-typegen:check` — `worker-configuration.d.ts` still matches `wrangler.jsonc`, so
  `TURNSTILE_SECRET` and `PORTAL_ORG_KEY` are still declared required.
- `pnpm verify:build` — the prerendered pages, `sitemap-index.xml`, `robots.txt`, `rss.xml`,
  `llms.txt`, `dist/server/entry.mjs` and `dist/client/.assetsignore` all exist; the generated
  `dist/server/wrangler.json` still carries both required secrets; and the client JS is inside
  budget (largest bundle ≤ 200,000 B, total ≤ 400,000 B).
- `pnpm test` — the schema, the payload builders, and the pipeline's ordering and failure policy,
  including that the portal step still hard-fails.

Then exercise the real Worker locally, with `.dev.vars` bindings:

```bash
pnpm preview      # pnpm build && wrangler dev
```

### Agent checklist (read the code / the built output)

- [ ] `SITE.url` has no trailing slash and matches the canonical hostname being connected.
- [ ] Every `FORMS` entry's `endpointKey` came from the portal — no `contact_abc123` placeholder
      left from the template.
- [ ] `wrangler.jsonc` has a site-specific `name`, and `secrets.required` is untouched.
- [ ] `SITE.gaMeasurementId` is `""` whenever `SITE.gtmId` is set.
- [ ] No island imports values from `@/config` — values come from `@/config.public`, types from
      `@/config` via `import type`. Grep the built client bundle for an `endpointKey` value; it must
      not appear.
- [ ] No secret value appears anywhere in the working tree: `git status` is clean of `.env`,
      `.dev.vars`, and any scratch file.

### Post-deploy smoke test (human, on the live domain)

- [ ] Home page and a blog post load over HTTPS on the production domain.
- [ ] The Turnstile widget renders on the contact page (a widget whose domain list is missing this
      hostname fails here). **View source and confirm the sitekey is the production one, not
      `1x00000000000000000000AA`** — the test key means the build variable never reached the build.
- [ ] Submit **every** form in the `FORMS` registry → each lands under the right form in the portal
      dashboard, the portal's notification email arrives, and (if enabled) the lead reaches Z360.
- [ ] Submit once with a deliberately wrong `endpointKey` (or the portal unreachable) → the visitor
      sees an error, **not** a success toast. A lead must never look delivered when it was not.
- [ ] `sitemap-index.xml`, `robots.txt` and `/llms.txt` are reachable.
- [ ] Run the `zikra-seo-audit` checklist against the live site.

---

## When a submission fails

`FORMS.md` §5 maps every failure to its exact log event (`lead_portal_failed` /
`lead_portal_errored` / `lead_portal_unconfirmed` / `lead_z360_failed` / `lead_z360_errored`) and §6
decodes the portal's `401` / `404` / `429` responses. Diagnose there before changing code — on a
multi-form site, a failure on **one** form points at that form's endpoint key, while a failure on
**all** of them points at `PORTAL_ORG_KEY`.

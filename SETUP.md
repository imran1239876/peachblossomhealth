# Setting up a new Zikra site

The manual, start-to-finish guide for spinning up a site from this template. Follow it with a
terminal open — every step has a command you can paste, a thing it produces, and a way to tell
it worked.

Roughly 30 minutes, most of it waiting for DNS.

- Deeper reference on the forms pipeline: [`FORMS.md`](./FORMS.md)
- Architecture and conventions: [`AGENTS.md`](./AGENTS.md)
- Analytics and SEO wiring: [`ANALYTICS-SEO.md`](./ANALYTICS-SEO.md)

---

## The whole thing at a glance

1. Create the repo from the template and `pnpm install`.
2. In the portal, create the form(s) and copy each **endpoint key**.
3. In the portal, generate the **organization API key** once — `Settings → API key`.
4. Fill in `src/config.ts`: `SITE`, the `FORMS` registry (the endpoint keys), and a unique
   Worker `name` in `wrangler.jsonc`.
5. `cp .env.example .env` and `cp .dev.vars.example .dev.vars`, then `pnpm dev` to check locally.
6. Create the Turnstile widget (Wrangler or the dashboard) and set the **build variables**.
7. `wrangler secret put` the **two** secrets: `TURNSTILE_SECRET` and `PORTAL_ORG_KEY`.
8. Deploy, connect the domain, then submit every form and confirm it lands in the portal.

---

## One key per organization

**The same organization API key (`pok_…`) serves every form and every website in that
organization.** One form or ten, one site or five — it is the same single key.

That works because the two jobs are separate: the **endpoint key** in the submit URL identifies
_which form_ a submission belongs to, and the org key only _authenticates_ the caller. So a site
deploys exactly **two** portal-and-spam secrets, forever:

| Secret             | What it is                                                     |
| ------------------ | -------------------------------------------------------------- |
| `TURNSTILE_SECRET` | The secret half of this site's Turnstile widget                |
| `PORTAL_ORG_KEY`   | The organization's `pok_…` API key — covers every form, always |

**Adding a form later requires NO new secret** — only a new line in the `FORMS` registry. See
[Add a second form](#add-a-second-form) below.

> Legacy per-form `pfk_…` tokens are still accepted by the portal so older sites keep working,
> but they are not the path for a new site. Do not use one here.

---

## Prerequisites

- [ ] **Node.js ≥ 22** — `node --version`. The repo pins `22` in `.node-version`.
- [ ] **pnpm** — `pnpm --version`. The repo pins `pnpm@11`; `corepack enable` honors it.
- [ ] **A Cloudflare account** with access to Workers and Turnstile.
- [ ] **Portal access** — you can sign in to <https://portal.z360.cloud> and you are an **admin**
      of the organization this site belongs to (only admins can create forms or generate the
      org API key).
- [ ] Optional: a **Z360 CRM token**, if this site should also push leads to the CRM.

Wrangler is already a dev dependency — always run it as `pnpm wrangler …`, never a global
install. Authenticate once:

```bash
pnpm wrangler login
```

---

## Build-time vs runtime: the distinction that breaks sites

There are **two** environment mechanisms in this repo. They are read at different times and
mixing them up fails quietly — read this table before you touch either file.

|                   | `.env` — **build-time, non-secret**                                                                           | `.dev.vars` / Worker Secrets — **runtime, secret**           |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Read when**     | The site is **built** (`import.meta.env`)                                                                     | The **Worker runs**                                          |
| **Ends up**       | **Baked into the bundle** — public                                                                            | In the Worker's secret store — never in the bundle           |
| **Holds exactly** | `PUBLIC_TURNSTILE_SITE_KEY`, `PORTAL_API_BASE`                                                                | `TURNSTILE_SECRET`, `PORTAL_ORG_KEY`, `Z360_TOKEN`           |
| **Local file**    | `.env` (copy `.env.example`) — gitignored                                                                     | `.dev.vars` (copy `.dev.vars.example`) — gitignored          |
| **In production** | **Build** environment variables: Cloudflare dashboard → the Worker → Settings → Build → Variables, or your CI | `pnpm wrangler secret put <NAME>`                            |
| **Never**         | Put a secret here — it ships in the bundle                                                                    | Put a build value here — it does not exist yet at build time |

The Turnstile **site** key is public by design: the widget renders in the browser, so the key is
served to every visitor no matter where it is stored. It also _cannot_ be a Worker Secret —
pages here are prerendered (`output: "static"`), so nothing runtime-only is reachable from the
client JS that renders the widget.

---

## Step 1 — Create the site repo

On GitHub, open
<https://github.com/Zikra-Infotech-LLC/zikra-astro-starter> and click **Use this template →
Create a new repository**. Then clone it.

Or scaffold straight to disk without a repo:

```bash
pnpm dlx degit Zikra-Infotech-LLC/zikra-astro-starter my-site
```

**Produces:** a `my-site/` directory containing the template.
**Worked when:** `ls my-site` shows `astro.config.mjs`, `src/`, and `wrangler.jsonc`.

Everything after this runs from inside that directory.

```bash
cd my-site
```

---

## Step 2 — Install

```bash
pnpm install
```

**Produces:** `node_modules/` from the committed lockfile.
**Worked when:** the command exits 0. Do **not** run `pnpm up`, `pnpm add`, or `astro add` —
the lockfile is authoritative and the Astro major is pinned.

---

## Step 3 — Create the form(s) in the portal, and copy each endpoint key

If the site's domain is not registered yet, add it first: portal → **Websites → Add website**
(bare domain, no `https://`, no trailing slash).

Then, for each form the site needs: portal → **Forms → Add form** → name it (e.g. `Contact`) →
tick the website(s) allowed to post to it → **Create form**.

The dialog shows the endpoint:

```text
POST /api/forms/contact_ab12cd/submit
                ^^^^^^^^^^^^^^
                the endpoint key — copy this
```

**Produces:** one endpoint key per form, e.g. `contact_ab12cd`.
**Worked when:** the form is listed under **Forms** with status `active`, and its detail page
shows the same endpoint URL.

The dialog also shows a legacy per-form `pfk_…` token. **Ignore it** — you are using the org key.

> Endpoint keys are **routing, not secrets**. They live in `src/config.ts` and are committed.

---

## Step 4 — Generate the organization API key (once per org)

Portal → **Settings → API key** → **Generate key**.

**Produces:** the org's `pok_…` key, displayed **exactly once**. Only its SHA-256 hash is stored,
so it can never be shown again.
**Worked when:** the page badge reads `active`.

Copy it straight into your password manager now. You will paste it twice: into `.dev.vars` for
local work (Step 6), and into the Worker secret for production (Step 10).

**If the org already has a key, this step is done** — reuse the existing value. Do _not_ press
**Rotate**: rotation takes effect immediately with no grace period and breaks every other site in
the organization until they are all updated together.

---

## Step 5 — Fill in `src/config.ts`

This is the one file every site edits first. Open it and set:

- **`SITE`** — `url` (the canonical production URL, no trailing slash), `name`, `description`,
  `defaultTitle`, `defaultAuthor`, `defaultOgImage`, `gtmId` (`GTM-XXXXXXX`, or `""` to disable
  tagging), `gaMeasurementId` (keep `""` whenever `gtmId` is set), optional `telephone` /
  `address`.
- **`FORMS`** — one line per form, keyed by a short form id, using the endpoint keys from Step 3:

```ts
// src/config.ts
export const FORMS = {
  contact: { endpointKey: "contact_ab12cd", label: "Contact" },
} as const satisfies Record<string, FormConfig>;
```

The default `contact_abc123` is a **placeholder** that no portal will recognize. Replacing it is
the single most important edit on a new site.

Also give this site a unique Worker name in `wrangler.jsonc`:

```jsonc
// wrangler.jsonc
"name": "my-site",
```

Then regenerate the Worker binding types:

```bash
pnpm cf-typegen
```

**Produces:** an updated `worker-configuration.d.ts` (commit it — CI verifies it is current).
**Worked when:** it still declares `TURNSTILE_SECRET` and `PORTAL_ORG_KEY`, and
`pnpm cf-typegen:check` passes.

Finally, drop in brand assets (`public/og-default.png`, favicon) and write the pages — see the
`zikra-page` and `zikra-blog-post` skills.

---

## Step 6 — Create the local env files

Build-time, non-secret:

```bash
cp .env.example .env
```

Runtime secrets (gitignored — **never** commit this file):

```bash
cp .dev.vars.example .dev.vars
```

Now open `.dev.vars` and paste the org key from Step 4 into `PORTAL_ORG_KEY`:

```ini
# .dev.vars
TURNSTILE_SECRET="1x0000000000000000000000000000000AA"   # Cloudflare's TEST secret
PORTAL_ORG_KEY="pok_REPLACE_WITH_YOUR_ORG_KEY"
Z360_TOKEN=""
```

Leave `.env` at its defaults for now — the shipped `PUBLIC_TURNSTILE_SITE_KEY` is Cloudflare's
"always passes" **test** sitekey, and it pairs with the test secret above so the challenge works
locally before you have a real widget. Replace **both or neither**; a mismatched pair rejects
every token.

**Worked when:** `git status` shows neither `.env` nor `.dev.vars` (both are gitignored).

---

## Step 7 — Run it locally

```bash
pnpm dev
```

**Produces:** the dev server on <http://localhost:4321>.
**Worked when:** the contact page renders, the Turnstile widget appears, and a real submission
returns the success toast **and shows up in the portal** under the right form.

If submit returns "We couldn't send your message" here, the endpoint key or the org key is
wrong — see [Troubleshooting](#troubleshooting). The site keeps no local copy of a lead, so the
pipeline refuses to report success for something the portal never confirmed. That is deliberate.

To test against the real Worker runtime instead of the dev server:

```bash
pnpm preview
```

That runs `pnpm build && wrangler dev` on <http://localhost:8787> with your `.dev.vars` bindings.

---

## Step 8 — Create the Turnstile widget

List **every** hostname the form is served from — the apex, `www`, any preview host, and
`localhost` / `127.0.0.1` for local work. A hostname the widget does not list renders the
challenge perfectly and then **fails verification server-side**, which is the single most common
launch bug.

### Path A — Wrangler (fastest)

```bash
pnpm wrangler turnstile widget create "My Site production" --domain example.com --domain www.example.com --domain localhost --domain 127.0.0.1 --mode managed --json
```

**Produces:** JSON containing both halves of the pair — the **sitekey** (public, for Step 9) and
the **secret** (for Step 10).
**Worked when:** the widget appears in `pnpm wrangler turnstile widget list`.

> This command **prints the secret key to your terminal**. Do not paste that output into a file,
> a commit, a ticket, or a chat window. Copy the secret straight into your password manager.

### Path B — Cloudflare dashboard (no Wrangler auth needed)

1. Cloudflare dashboard → **Turnstile** (<https://dash.cloudflare.com/?to=/:account/turnstile>).
2. **Add widget**.
3. **Widget name** — e.g. `My Site production`.
4. **Hostname management** — add `example.com`, `www.example.com`, `localhost`, `127.0.0.1`.
5. **Widget mode** — **Managed**.
6. **Create**, then copy the **sitekey** and the **secret key**.

Useful afterwards, either path:

```bash
pnpm wrangler turnstile widget update <sitekey> --domain example.com --domain www.example.com --domain staging.example.com
```

---

## Step 9 — Set the build variables

Locally, put the real sitekey in `.env`:

```ini
# .env — build-time, NON-SECRET only
PUBLIC_TURNSTILE_SITE_KEY="0x4AAAAAAA_your_real_sitekey"
# Only if this build should talk to a non-production portal:
# PORTAL_API_BASE="https://portal-staging.example.com"
```

That retires the test pair from Step 6, so paste the **secret** from the same widget into
`TURNSTILE_SECRET` in `.dev.vars` at the same time — the both-or-neither rule applies here, and a
real sitekey verified against the test secret rejects every token. Staying on the test pair
locally is also fine: leave `.env` alone and set the real sitekey only in the build environment.

In production the same names have to reach whatever machine runs `pnpm build`, and which machine
that is depends on the deploy path you pick in [Step 11](#step-11--deploy) — so do this half once
the Worker exists:

- **Option A — Cloudflare Git integration.** Dashboard → the Worker → **Settings → Build** →
  **Build variables and secrets**. Only a Git-connected Worker builds on Cloudflare, so only that
  Worker has this page. **Not Settings → Variables & Secrets** — that one is the _runtime_
  environment, and a sitekey put there is never read at build time: the dashboard looks configured
  while the live site still ships the test key.
- **Option B — `pnpm wrangler deploy`.** The build runs on your own machine, so the `.env` above
  _is_ the production build environment and there is nothing to set in the dashboard. Same two
  names in your CI environment if you build there instead.

**Worked when:** after a rebuild, the widget renders with your sitekey — load the contact page,
open DevTools → **Elements**, and read the `src` of the Turnstile `<iframe>`: your sitekey is one
of its path segments.

> **View source will not show you this, and grepping the bundle for the test key is worse than
> useless.** The sitekey is read inside the React island, so it never reaches the prerendered
> HTML — it lives in `dist/client/_astro/ContactForm.*.js`, and that chunk contains
> `1x00000000000000000000AA` on **every** build, correct or not: `src/config.public.ts` compiles
> the test key in beside yours as the fallback argument. The rendered widget is the only honest
> answer.

> Never `wrangler secret put` either of these. A Worker Secret does not exist at build time, so
> the build would silently fall back to the default and the override would do nothing.

---

## Step 10 — Set the two Worker secrets

Each command prompts for the value — nothing is typed on the command line, and nothing is
written to the repo.

```bash
pnpm wrangler secret put TURNSTILE_SECRET
```

```bash
pnpm wrangler secret put PORTAL_ORG_KEY
```

On a brand-new site nothing is deployed yet, so the first command asks _There doesn't seem to be
a Worker called "my-site". Do you want to create a new Worker with that name…?_ — answer **yes**.
That creates an empty Worker under the `name` you set in `wrangler.jsonc` in Step 5, and Step 11
deploys the real site onto **that** Worker.

**Produces:** two secrets on the deployed Worker: the Turnstile secret from Step 8, and the org's
`pok_…` key from Step 4.
**Worked when:** both are listed by `pnpm wrangler secret list`, and `pnpm wrangler deploy`
succeeds — both are declared **required** in `wrangler.jsonc`, so a deploy missing either one
fails rather than shipping a site whose forms are broken.

That is the complete secret list. A second, fifth or tenth form adds nothing here.

---

## Step 11 — Deploy

Two paths — pick one.

**Option A — Cloudflare Git integration (recommended).** Connect the repo to the Worker Step 10
already created — do not make a second one. Dashboard → **Workers & Pages** → your Worker →
**Settings → Builds → Connect** → pick the GitHub repo, then set build command `pnpm build` and
deploy command `pnpm wrangler deploy`. Pushes to the default branch then build and deploy
automatically, and other branches get preview deployments.

> Not **Create → Import a repository**: that mints a _second_ Worker, named after the repo and
> carrying none of your secrets. Cloudflare also requires the Worker name in the dashboard to
> match `name` in `wrangler.jsonc` from Step 5, or the build fails.

**Option B — Wrangler.**

```bash
pnpm build
```

```bash
pnpm wrangler deploy
```

**Produces:** the live Worker.
**Worked when:** the deploy prints a `*.workers.dev` URL that serves the home page.

Then, in the dashboard:

1. **Domain** — the Worker → **Settings → Domains & Routes** → add a **Custom Domain** for
   `example.com` (and `www.example.com`). Cloudflare provisions DNS and TLS.
2. **Redirects** — for a site replacing an old one, add 301s via **Bulk Redirects**
   (Account Home → Bulk Redirects), never in app code.
3. **Search Console** — verify the domain property and submit
   `https://example.com/sitemap-index.xml`.

Every hostname you serve from must also be on the Turnstile widget from Step 8.

---

## Did it work?

Run the local gate first:

```bash
pnpm install --frozen-lockfile && pnpm cf-typegen:check && pnpm format:check && pnpm check && pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm verify:build && pnpm audit
```

Then check the live site:

- [ ] Home page and a blog post load over HTTPS on the production domain.
- [ ] The Turnstile widget renders on the contact page.
- [ ] The rendered widget carries your real sitekey — DevTools → **Elements**, read the `src` of
      the Turnstile `<iframe>` (not View source, and not a grep of the bundle; see
      [Step 9](#step-9--set-the-build-variables)). `1x00000000000000000000AA` **there** means the
      build variable never reached the build — and the challenge passes everyone, including bots.
- [ ] Submit **every** form in the `FORMS` registry. Each one shows the success toast, and each
      submission appears **under the right form** in the portal, with the notification email
      delivered.
- [ ] Break it on purpose — **locally**, never on production. Point one `endpointKey` at a bogus
      value, run `pnpm preview`, submit, and confirm the visitor sees an **error**, not a success
      toast. Then revert it. A lead must never look delivered when it was not.
- [ ] `/sitemap-index.xml`, `/robots.txt`, and `/llms.txt` are reachable.
- [ ] Run the `zikra-seo-audit` skill.

To watch the pipeline's log lines live while you submit:

```bash
pnpm wrangler tail
```

Every **delivery** failure logs one JSON line carrying the `form` id — `lead_portal_errored`,
`lead_portal_failed`, `lead_portal_unconfirmed`, `lead_z360_failed`, `lead_z360_errored`.

A rejected Turnstile challenge logs **nothing**: the verifier just returns `false`. So a
"Spam check failed." toast with an empty tail does not mean the request never reached the
Worker — it reached it and the challenge failed. On a new site that is almost always the widget's
hostname list ([Step 8](#step-8--create-the-turnstile-widget)) or a sitekey and secret that are
not a matching pair. `FORMS.md` §5 has the full failure table.

---

## Add a second form

Three steps. **No new secret** — the org key already covers it.

**1. Create it in the portal.** Forms → Add form → name it `Quote request` → copy the endpoint
key (say `quote_ef34gh`).

**2. Add one line to the registry.**

```diff
  // src/config.ts
  export const FORMS = {
    contact: { endpointKey: "contact_ab12cd", label: "Contact" },
+   quote: { endpointKey: "quote_ef34gh", label: "Quote request" },
  } as const satisfies Record<string, FormConfig>;
```

**3. Drop the island on a page.**

```astro
---
// src/pages/quote.astro
import BaseLayout from "@/layouts/BaseLayout.astro";
import LeadForm from "@/components/LeadForm.tsx";
---

<BaseLayout
  title="Request a quote"
  description="Tell us about your project and we'll send pricing within one business day."
>
  <section class="mx-auto max-w-xl px-4 py-16 sm:px-6">
    <h1 class="text-3xl font-bold tracking-tight">Request a quote</h1>
    <LeadForm
      client:load
      formId="quote"
      heading="Project details"
      submitLabel="Request quote"
      extraFields={[
        { name: "company", label: "Company", required: true },
        { name: "budget", label: "Budget range", placeholder: "e.g. $10k–25k" },
      ]}
    />
  </section>
</BaseLayout>
```

That is the entire diff. No second Action, no second pipeline, no portal-side setup for the
`extraFields` — the portal stores the whole payload verbatim. Details and the `extraFields`
reference: [`FORMS.md` §4](./FORMS.md).

---

## Turn on Z360 (optional)

The CRM push is **best-effort and runs last**, after the lead is already safe in the portal, so
it can never block or fail a submission — a failure is logged and the visitor still sees success.

1. In `src/config.ts`, set `z360Enabled: true` on `SITE`.
2. In the same object, set `z360InquiriesUrl` to the CRM's inquiries endpoint (confirm the exact
   URL and payload shape with the Z360 team).
3. Set the token:

```bash
pnpm wrangler secret put Z360_TOKEN
```

Done. Both switches are required — with either missing the push is skipped silently. For local
testing, fill `Z360_TOKEN` in `.dev.vars` too.

---

## Troubleshooting

| Symptom                                                           | Almost always                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lead_portal_failed` with `status: 401`                           | The org key is wrong, stale (someone rotated it), blank, or revoked. Re-run `pnpm wrangler secret put PORTAL_ORG_KEY`. Also possible: the `endpointKey` belongs to a **different organization** — an org key never opens another org's form.                    |
| `lead_portal_failed` with `status: 404`                           | The portal does not recognize the endpoint key. Usually the placeholder `contact_abc123` was never replaced (Step 5); otherwise the form is **paused** in the portal, which answers 404 to any credential.                                                      |
| `lead_portal_failed` with `status: 429`                           | Portal rate limits: 10/min per IP per form, 100/min per form. In server mode the portal sees the Worker's IP. Normally a bot storm or a load test.                                                                                                              |
| `lead_portal_unconfirmed`                                         | Something answered 2xx that was not the portal's submit handler. Check `PORTAL_API_BASE` (right origin? right environment?) and whether the portal sits behind Access or a maintenance page.                                                                    |
| Widget renders, but every submission says **"Spam check failed"** | A **hostname the Turnstile widget does not list**. The challenge renders on any origin; only siteverify checks the hostname. Add it: `pnpm wrangler turnstile widget update <sitekey> --domain …`. Second cause: sitekey and secret from **different widgets**. |
| Turnstile `timeout-or-duplicate`                                  | A single-use token redeemed twice — a retry that did not reset the widget, or a proxy verifying before the Action does. The portal is never the culprit; it performs no challenge check at all.                                                                 |
| `wrangler deploy` fails complaining about a missing secret        | `TURNSTILE_SECRET` and `PORTAL_ORG_KEY` are declared **required** in `wrangler.jsonc`. Run Step 10 against this Worker. Deliberate: a deploy without them would drop or reject every lead.                                                                      |
| A fresh clone hard-fails on submit                                | Correct behaviour. It has no real `PORTAL_ORG_KEY` and a placeholder endpoint key, and the portal is the only durable sink — so nothing reports success. Do Steps 3–6.                                                                                          |
| Turnstile fails locally after you changed `.env`                  | The sitekey is read at **build** time. Restart `pnpm dev` or rebuild. Also: a real sitekey used locally needs both `localhost` **and** `127.0.0.1` on the widget — Turnstile treats them as different hosts.                                                    |
| Nothing at all happens on submit                                  | The island is missing its `client:*` directive, so Astro rendered it to static HTML and never hydrated it.                                                                                                                                                      |

---

## Where to go next

| You want to…                          | Read / run                               |
| ------------------------------------- | ---------------------------------------- |
| Understand the forms pipeline in full | [`FORMS.md`](./FORMS.md)                 |
| Add a page                            | the `zikra-page` skill                   |
| Write a blog post                     | the `zikra-blog-post` skill              |
| Add or change a form                  | the `zikra-form` skill                   |
| Re-run the deploy checklist           | the `zikra-deploy` skill                 |
| Wire GTM / GA4 / conversions          | [`ANALYTICS-SEO.md`](./ANALYTICS-SEO.md) |
| Pre-launch SEO review                 | the `zikra-seo-audit` skill              |
| Update an existing site               | the `zikra-update` skill                 |

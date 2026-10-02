---
name: zikra-form
description: Use when adding or extending a form on a Zikra site (contact, quote request, newsletter, etc.) — covers the FORMS registry in src/config.ts, the reusable LeadForm island, the shared zod schema in src/lib/schema.ts, the Astro Action pipeline in src/actions/index.ts (Turnstile → Portal → optional Z360), reading secrets from the Worker env, and the "the portal is the only sink, so its push hard-fails" rule.
---

# Build a form wired to the Zikra lead pipeline

> Full reference: **[`FORMS.md`](../../../FORMS.md)** at the repo root — the submission journey end to end, the org `pok_…` key (and the legacy per-form `pfk_…` token) with rotation/revocation steps, the complete new-site checklist, a worked `extraFields` example, the failure→log-event table, and troubleshooting (401/404 from the portal, Turnstile hostname problems, the deliberate fresh-clone hard-fail). Read it when the task goes beyond the recipes below, and keep the two in sync when either changes. New-site provisioning is **[`SETUP.md`](../../../SETUP.md)** and the `zikra-deploy` skill.

## Adding a form is three steps and no new secret

1. **Create the form in the portal** (Forms → Add form) and copy its **endpoint key** from the
   dialog or the form's detail page.
2. **Add one line to `FORMS`** in `src/config.ts`.
3. **Render `<LeadForm formId="…" />`** on a page with a `client:*` directive.

```ts
// src/config.ts — step 2
export const FORMS = {
  contact: { endpointKey: "contact_abc123", label: "Contact" },
  quote: { endpointKey: "quote_def456", label: "Quote request" },
} as const satisfies Record<string, FormConfig>;
```

```astro
---
// src/pages/quote.astro — step 3
import LeadForm from "@/components/LeadForm.tsx";
---

<LeadForm
  client:load
  formId="quote"
  heading="Request a quote"
  submitLabel="Request quote"
  messageLabel="What do you need?"
  extraFields={[
    { name: "company", label: "Company", required: true },
    { name: "budget", label: "Budget range" },
  ]}
/>
```

That is the whole job. There is **no new secret, ever** — not for the second form, not for the
tenth, not for the next site in the same organization.

**Why.** The endpoint key in the submit URL *identifies* the form; the bearer only *authenticates*
the caller. That bearer is `PORTAL_ORG_KEY`, the **organization's** `pok_…` API key, and there is
**one per organization** — valid for every form in the org and every website in it. So a site's
secret list is fixed at two (this key and `TURNSTILE_SECRET`) however far the registry grows.
Endpoint keys are **routing, not secrets**: they live in `src/config.ts` in the repo.

> The intake endpoint still accepts a **legacy** per-form `pfk_…` token in the same slot so older
> integrations keep working. Never wire a new site to one: the Worker binds a single value and sends
> it for every submission, so the moment a second form exists the portal answers `401` on its real
> leads. If you meet a site on a `pfk_…` token, moving it to the org key is a prerequisite for
> adding a form (`FORMS.md` §2).

Do **not** clone `LeadForm` to make a variant, and do **not** add a second Action. If a form needs
something the props cannot express, add the prop.

---

## The four layers

A Zikra site serves **any number of forms** through one island, one schema, and one Action.

1. **Registry** — `FORMS` in `src/config.ts`. One line per form: a short form id →
   `{ endpointKey, label }`. `portalSubmitUrl(id)` turns an id into the portal endpoint;
   `isKnownFormId(id)` narrows a submitted id server-side.
2. **Island** — `src/components/LeadForm.tsx` (shadcn `form` + react-hook-form + `zodResolver`),
   hydrated with `client:load` / `client:visible` and given a `formId`. `ContactForm.tsx` is a thin
   preset that renders `<LeadForm formId="contact" />`.
3. **Schema** — `src/lib/schema.ts` (`leadSchema`), imported by both the island and the server so
   client and server validate identically.
4. **Action** — `src/actions/index.ts`, the single Astro Action that runs the pipeline on the Worker
   for **every** form. The island calls it as JSON through `astro:actions`. The Action is thin: it
   delegates to `processLead` in `src/lib/lead-pipeline.ts`, where the ordering and failure policy
   live (and where the unit tests point).

### The client/server config boundary — do not break it

Anything an island imports is bundled into the browser, and the bundler follows the whole module
graph behind that import.

- Islands import **values** from `@/config.public` (the Turnstile sitekey) and **types** from
  `@/config` with `import type` — which is erased at compile time and creates no bundle edge.
- `src/lib/schema.ts` is bundled with the island too, so it must not import `@/config` either. That
  is why `form` is only shape-checked there (`z.string().min(1).max(64)`) and membership-checked on
  the server by `isKnownFormId`, before the id ever becomes a URL.

A runtime edge from client code to `@/config` would publish every form's portal endpoint key in page
source. Not fatal on its own — a server-mode push still needs the bearer — but a form with no
allowed-domain list configured accepts browser-mode posts and the portal runs no challenge check, so
it is a free spam target. Keep it off the wire.

### `extraFields` and the `extra` bag

`extraFields` render as extra inputs and are submitted inside the `extra` bag. The portal stores the
entire payload verbatim and auto-extracts `name`/`email`/`phone`/`message`, so a per-form field needs
**no portal-side registration** — it just appears on the submission. `required` is enforced by
extending the shared zod schema inside the island; the form sets `noValidate`, so an HTML `required`
attribute would be decoration.

**The caps on `extra` are load-bearing.** The bag is whatever JSON the Action was posted, and the
portal stores what it is sent, so `leadSchema` is the only thing between a crafted POST and an
unbounded row: **max 25 keys, key length 1–64, value length ≤ 2000**. Do not loosen them casually.
`buildPortalPayload` also spreads `extra` **first** so the validated `name`/`email`/`phone`/`message`/
`source` always win — a crafted `extra: { email: … }` must never displace the address the portal
notifies and replies to.

### Turnstile, in the island

- **The token is reset after every submit**, success or failure (`resetTurnstile()`). This is
  load-bearing: tokens are single-use, so a retry with a redeemed token is rejected as
  `timeout-or-duplicate`.
- **`action`** is set to the form id, which names the widget in Turnstile's analytics — how a site
  running several forms off one sitekey tells them apart. Max 32 characters, alphanumeric plus `_`
  and `-`.

---

## Extending the shared zod schema

Only when a field belongs to **every** form. Anything form-specific belongs in `extra`.

```ts
export const leadSchema = z.object({
  form: z.string().min(1).max(64), // which FORMS entry; membership checked server-side
  name: z.string().min(2, "Please enter your name.").max(100),
  email: z.string().min(1, "…").regex(EMAIL_RE, "…"),
  phone: z.string().optional(),
  message: z.string().min(10, "…").max(5000),
  turnstileToken: z.string().min(1, "Please complete the spam check."),
  extra: z.record(z.string(), z.string().max(2000)).optional(), // + key caps
});
export type LeadInput = z.infer<typeof leadSchema>;
```

Keep it framework-free — **no `astro:*` imports** (it stays plain-Vitest testable) and **no
`@/config` import** (see the boundary above). `turnstileToken` must stay: the client sets it from the
widget callback and the server verifies it.

---

## The pipeline — order matters

The Action validates its `input` with `leadSchema`, rejects an unknown form id with `BAD_REQUEST`,
and hands off to `processLead`. Secrets come from the typed `env` imported from
**`cloudflare:workers`** (generated by Wrangler into `worker-configuration.d.ts`, plus the
optional-secret bridge in `src/env.d.ts`).

**Never** read secrets from `import.meta.env` or `process.env`, and never hardcode them.
`import.meta.env` is resolved at BUILD time and baked into the bundle — that is why it is right for
the public sitekey (`PUBLIC_TURNSTILE_SITE_KEY`) and wrong for every secret. The available env:

- `TURNSTILE_SECRET: string` (required)
- `PORTAL_ORG_KEY: string` (required) — the org's `pok_…` API key; one per organization, valid for
  every form and every site in it
- `Z360_TOKEN?: string` (optional)

Run the steps in **exactly this order**:

```ts
// 1. Turnstile — verified HERE, at the website, and nowhere else. Tokens are
//    single-use, so exactly one party may call siteverify; that party is the
//    site. The portal performs no challenge check of its own.
//    verifyTurnstile() fails closed: a network error, a non-2xx status, or an
//    unexpected body all count as a failed challenge.
//    On failure -> LeadPipelineError("spam") -> ActionError FORBIDDEN.

// 2. Portal — MANDATORY and HARD-FAILING. POST portalSubmitUrl(input.form) in
//    server mode (Authorization: Bearer PORTAL_ORG_KEY), which skips the
//    portal's origin check. The endpoint key in the URL IDENTIFIES the form;
//    the key only AUTHENTICATES, which is why one org key serves the whole
//    registry and adding a form adds no secret. The portal archives the raw
//    JSON to its own R2 bucket before inserting into D1 and sends its own
//    notification email.
//    Any throw, any non-ok response, and any 2xx without the portal's
//    { ok: true, submissionId } confirmation is logged (lead_portal_errored /
//    lead_portal_failed / lead_portal_unconfirmed — each line naming the form)
//    and raised as LeadPipelineError("delivery") -> INTERNAL_SERVER_ERROR.

// 3. Z360 — optional CRM push, LAST and only when SITE.z360Enabled AND
//    env.Z360_TOKEN are both present. Wrapped in try/catch; a non-ok response
//    or a throw is logged (lead_z360_failed / lead_z360_errored) and the
//    pipeline still succeeds.
```

### The "portal is the only sink, so its push hard-fails" rule

The site keeps **no local copy** of a lead — no R2 backup, no email of its own. The portal is the
single durable sink. So a best-effort portal push would silently drop the lead the moment the portal
hiccups, which is the exact failure this architecture exists to prevent.

Therefore: **never** turn the portal step into a log-and-continue like the Z360 step, and never wrap
`processLead` in something that swallows a `delivery` failure. If the portal did not accept the lead,
the visitor must see an error and be able to retry — being told "sent" when nothing was recorded is
the worst possible outcome. Only Z360, which runs after the lead is already safe in the portal, may
fail quietly.

Two details that keep the guarantee honest: `submitToPortal` sends `redirect: "manual"`, so a
misrouted POST surfaces as a 3xx instead of following into a login or maintenance page whose 200
would look like a stored lead; and the id returned to the caller is the portal's `submissionId`, the
only id that names a stored record.

If you intentionally add a no-JS HTML form fallback later, revisit this skill and the Action
together. Astro form actions should use `accept: "form"` and submit `FormData`; the current hydrated
island path is JSON by design.

---

## Per-site settings

These live in `src/config.ts`, not in the Action:

- `FORMS` — **required.** One entry per form: `endpointKey` (from the form's detail page in the
  portal) and `label`. `portalSubmitUrl(id)` builds
  `${PORTAL_API_BASE}/api/forms/<endpointKey>/submit`. Growing this registry never grows the secret
  list. There is no per-site switch: the portal push is unconditional.
- `PORTAL_API_BASE` — the portal origin. Defaults to production; override it with the
  `PORTAL_API_BASE` **build-time** variable to aim a staging build at a staging portal.
- `SITE.z360Enabled` — master switch for the CRM push. Both this **and** the `Z360_TOKEN` secret
  must be present for step 3 to run.
- `SITE.z360InquiriesUrl` — the Z360 endpoint.

Notification recipients are configured **in the portal**, which is why there is no `adminEmail` here.

Two files, two mechanisms — do not mix them up:

- **`.env`** (copy `.env.example`, gitignored) — BUILD-time, non-secret: `PUBLIC_TURNSTILE_SITE_KEY`,
  `PORTAL_API_BASE`. In production these are **build** environment variables in the Cloudflare
  dashboard / CI, never `wrangler secret put`. The Turnstile *site* key is public by design and could
  not be a Worker Secret anyway: pages are prerendered, so a runtime secret is unreachable from them.
- **`.dev.vars`** (copy `.dev.vars.example`, gitignored) — RUNTIME secrets: `TURNSTILE_SECRET`,
  `PORTAL_ORG_KEY` (the org's `pok_…` API key), `Z360_TOKEN`. Two required, one optional, and that
  list does not grow with the number of forms. In production: `wrangler secret put …`, which is a
  **human** step — it is denied to agents in `.claude/settings.json`. See the `zikra-deploy` skill.

---

## Test & verify

```bash
pnpm test       # leadSchema, portalSubmitUrl, the pure payload builders, and the pipeline ordering/failure policy
pnpm check
pnpm typecheck
pnpm preview    # pnpm build && wrangler dev — exercises the real Worker + bindings
```

`tests/lead-pipeline.test.ts` injects stubs for every step, so a change to the ordering or the
failure policy should show up there first. Any new downstream step needs a case proving it cannot
fail the submission, and any change to the portal step needs a case proving it still does.
`tests/lead.test.ts` covers the schema (including the unknown-form-id rejection and the `extra` caps)
and the payload builder — including that a crafted `extra` key can never overwrite the normalized
`name`/`email`/`phone`/`message`/`source`.

With the default test Turnstile keys the widget always passes locally. Submit each form under
`pnpm preview` and confirm the submission appears under the right form in the portal's dashboard —
what you are really testing is the endpoint key and the org key.

When a submission fails, map the symptom before changing code: `FORMS.md` §5 lists every failure with
its exact log event and §6 decodes the portal's 401 / 404 / 429 responses. On a multi-form site, a
failure on **one** form points at that form's endpoint key; a failure on **all** of them points at
`PORTAL_ORG_KEY`.

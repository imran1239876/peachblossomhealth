import type { LeadInput } from "@/lib/schema";

export interface PortalPayload {
  name: string;
  email: string;
  phone?: string;
  message: string;
  source: "website";
  /** Form-specific fields from the lead's `extra` bag. */
  [field: string]: string | undefined;
}

/**
 * Every key the portal's own field extraction answers to, lowercased, plus the
 * `source` marker this payload sets itself.
 *
 * The portal matches those fields **case-insensitively and first-wins**: it
 * lowercases each payload key into a map, keeping the first one it sees. So
 * spreading `extra` ahead of the validated fields is not enough on its own — an
 * exact-case `email` is overwritten by the assignment below, but a crafted
 * `Email` survives as a *separate* property that sits earlier in insertion
 * order and therefore wins the extraction. Reserved keys are dropped from the
 * bag entirely instead.
 *
 * Mirrors the portal's extraction vocabulary; if that list ever grows, this one
 * grows with it.
 */
const RESERVED_EXTRA_KEYS = new Set([
  "name",
  "full_name",
  "fullname",
  "your_name",
  "email",
  "email_address",
  "your_email",
  "phone",
  "phone_number",
  "mobile",
  "tel",
  "message",
  "comments",
  "description",
  "details",
  "inquiry",
  "source",
]);

/**
 * Build the payload POSTed to a portal form intake endpoint. Pure —
 * unit-testable. The portal stores the entire payload and auto-extracts the
 * common `name`/`email`/`phone`/`message` fields for its dashboard, so the
 * field names here are chosen to match those. Anything else — the per-form
 * fields in `extra` — is stored verbatim alongside them, which is why a new
 * form field needs no portal-side registration.
 *
 * The Turnstile token is deliberately NOT forwarded. The site verifies the
 * token itself before this call ever happens, and the portal performs no
 * Turnstile check at all — tokens are single-use, so by the time we get here
 * ours has already been redeemed by our own siteverify call and would only
 * fail if replayed.
 */
export function buildPortalPayload(lead: LeadInput): PortalPayload {
  // The bag is attacker-controlled — it is whatever JSON the Action was posted,
  // and `leadSchema` bounds its size but not its key names — so every key the
  // portal's extraction answers to is stripped from it, in any casing, before
  // anything is merged. A crafted `extra: { Email: "…" }` (or `tel`, when the
  // visitor left the optional phone box blank) must not be able to displace the
  // validated contact details the portal will extract, notify on, and reply to.
  const safeExtra = Object.fromEntries(
    Object.entries(lead.extra ?? {}).filter(
      ([key]) => !RESERVED_EXTRA_KEYS.has(key.toLowerCase()),
    ),
  );

  return {
    // Spread FIRST so the validated fields below win even on an exact-case key.
    ...safeExtra,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    message: lead.message,
    source: "website",
  };
}

/**
 * The portal is the only sink, so it gets the most generous budget of the three
 * outbound calls — but still a bounded one. `fetch` has no timeout of its own,
 * so without this a portal that accepts the connection and never answers would
 * hang the Action until the runtime kills the invocation, and the caller's
 * `lead_portal_errored` branch would never run: a lost lead with no log line.
 */
const PORTAL_TIMEOUT_MS = 15_000;

/**
 * Submit a lead to a portal form intake endpoint in **server mode**.
 *
 * Two arguments, two distinct jobs, and the split is the whole reason a site
 * needs only one portal secret:
 *
 *  - `url` IDENTIFIES the form. It is the form's submit endpoint, built by
 *    `portalSubmitUrl(formId)` from the FORMS registry
 *    (`…/api/forms/<endpoint-key>/submit`). The endpoint key in it is the only
 *    thing that tells the portal which form a submission belongs to.
 *  - `key` AUTHENTICATES the caller, and nothing more. It is the
 *    organization's `pok_…` API key, bound as the `PORTAL_ORG_KEY` Worker
 *    Secret — one per org, valid for every form in that org and every website
 *    in it — so the same value is correct for every entry in the registry.
 *    One key, any number of forms; adding a form adds a registry line, never
 *    a secret.
 *
 * The endpoint also still accepts a legacy per-form `pfk_…` token here, which
 * is why existing integrations keep working, but it is not the documented path
 * for a new site: it authenticates exactly one form, while this argument is
 * sent for all of them.
 *
 * Server mode is what the bearer buys: the portal skips its browser-origin
 * check entirely. So this must only ever run server-side (the Astro Action on
 * the Worker) — never ship the key to the browser.
 *
 * Returns the raw Response. The portal is the one durable sink for a lead, so
 * the caller treats a non-ok status exactly like a thrown error: see the
 * hard-fail rule in `src/lib/lead-pipeline.ts`. A timeout rejects, which lands
 * in that same hard-fail path.
 *
 * `redirect: "manual"` is deliberate. Following a redirect would turn a
 * misrouted POST into a GET of whatever sits at the other end — an Access
 * login page, an apex→www or http→https hop, a maintenance page — and that
 * page's 200 would look exactly like a stored submission. Surfacing the 3xx
 * as-is lets the caller reject it.
 */
export async function submitToPortal(
  url: string,
  key: string,
  lead: LeadInput,
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    redirect: "manual",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildPortalPayload(lead)),
    signal: AbortSignal.timeout(PORTAL_TIMEOUT_MS),
  });
}

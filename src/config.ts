/**
 * Per-site configuration — the ONE file every forked Zikra site edits first.
 *
 * Rules:
 *  - Only non-secret, build-time values live here (they ship to the browser).
 *  - Secrets (Turnstile secret, portal org key, Z360 token) NEVER go here —
 *    they live in Cloudflare Worker Secrets / .dev.vars and are read from the
 *    Worker runtime env. See .dev.vars.example and AGENTS.md.
 *  - A few values may instead come from BUILD-time environment variables (see
 *    `.env.example`) so a fork can point at staging, or set its Turnstile
 *    sitekey in CI, without editing code. Those are read from
 *    `import.meta.env`, which Astro resolves when the site is BUILT, not when
 *    the Worker runs — which is exactly why a real secret can never come from
 *    here: the value is baked into the bundle.
 */

import { fromBuildEnv, TURNSTILE_SITE_KEY } from "@/config.public";

/**
 * Re-exported so `@/config` stays the one place a site reads configuration
 * from. Islands must NOT import it from here: this module also holds the FORMS
 * registry and `PORTAL_API_BASE`, and a runtime import from client code would
 * bundle those portal endpoint keys into the browser. Islands import the value
 * from `@/config.public` and the types from here with `import type`, which is
 * erased and creates no bundle edge. See `config.public.ts` for the full
 * reasoning.
 */
export { TURNSTILE_SITE_KEY };

export interface SiteAddress {
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  postalCode: string;
  addressCountry: string;
}

export interface SiteConfig {
  /** Canonical production URL, no trailing slash. Used for canonicals, OG, sitemap, RSS. */
  url: string;
  /** Brand / business name. */
  name: string;
  /** Default meta description (fallback when a page sets none). ~150–160 chars. */
  description: string;
  /** <title> used on the home page and as the fallback title. */
  defaultTitle: string;
  /** Default byline for blog posts that don't set `author`. */
  defaultAuthor: string;
  /** Static Open Graph image, served from /public. */
  defaultOgImage: string;
  /**
   * Google Tag Manager container ID, e.g. "GTM-XXXXXXX". Empty string disables
   * the container. This is the ONE tag we hardcode: GA4, Ads conversions, and
   * everything else are configured inside the container, so marketing can add a
   * tag without a deploy. See ANALYTICS-SEO.md.
   */
  gtmId: string;
  /**
   * GA4 Measurement ID, e.g. "G-XXXXXXXXXX". Empty string disables analytics.
   * Only for sites running a bare GA4 tag with no container — GA4 belongs
   * INSIDE the GTM container, so whenever `gtmId` is set this MUST stay "".
   * Both at once means two Google tags on the page and doubled `page_view`s.
   * `gtmId` wins: BaseLayout renders this Partytown branch only when there is
   * no container, because booting Partytown patches `dataLayer.push` on the
   * main thread and would divert our own events away from the container.
   */
  gaMeasurementId: string;
  /** Turn on the optional Z360 CRM push. Also requires the Z360_TOKEN secret. */
  z360Enabled: boolean;
  /** Z360 inquiries endpoint. Confirm the exact URL/payload with the Z360 team. */
  z360InquiriesUrl: string;
  /** Optional phone number for LocalBusiness structured data. */
  telephone?: string;
  /** Optional postal address for LocalBusiness structured data. */
  address?: SiteAddress;
}

export const SITE: SiteConfig = {
  url: "https://peachblossomhealth.com",
  name: "Peach Blossom Direct Primary Care",
  description:
    "Direct primary care and weight management in Bear, DE with Dr. Rabia Qureshi, MD. One flat monthly membership, same or next day visits, no copays.",
  defaultTitle: "Direct Primary Care in Bear, DE | Peach Blossom Health",
  defaultAuthor: "Dr. Rabia Qureshi, MD",
  defaultOgImage: "/og-default.png",
  gtmId: "",
  gaMeasurementId: "",
  z360Enabled: false,
  z360InquiriesUrl: "https://api.z360.example/v1/inquiries",
  telephone: "+1-302-618-4075",
  address: {
    streetAddress: "121 Becks Woods Drive, Suite 203",
    addressLocality: "Bear",
    addressRegion: "DE",
    postalCode: "19701",
    addressCountry: "US",
  },
};

/* -------------------------------------------------------------------------
 * Forms
 * ---------------------------------------------------------------------- */

/**
 * Origin of the Zikra portal that receives every lead — no trailing slash.
 *
 * Non-secret and build-time, so a fork can aim a staging build at a staging
 * portal by setting `PORTAL_API_BASE` in `.env` (locally) or as a build
 * environment variable in Cloudflare / CI. It carries no `PUBLIC_` prefix on
 * purpose: only the Astro Action ever resolves a submit URL, so the value is
 * inlined into the Worker bundle and never has to reach the browser.
 */
export const PORTAL_API_BASE = fromBuildEnv(
  import.meta.env.PORTAL_API_BASE,
  "https://portal.z360.cloud",
);

export interface FormConfig {
  /**
   * The form's endpoint key, copied from its detail page in the portal. It is
   * the ONLY thing that tells the portal which form a submission belongs to,
   * because it is what the submit URL is built from.
   *
   * Endpoint keys are **not secrets** — they are routing, and they ship to the
   * browser inside this module. The organization's `pok_…` API key, which
   * authenticates the push, IS a secret and lives in `PORTAL_ORG_KEY` (a
   * Worker Secret), never here.
   */
  endpointKey: string;
  /** Human label for the form, for dashboards, docs, and analytics copy. */
  label: string;
}

/**
 * Every form this site can submit, keyed by a short form id.
 *
 * Adding a form is exactly three steps and **NO new secret**: create the form
 * in the portal, add a line here with the endpoint key it prints, and render
 * `<LeadForm formId="…" />`. The id travels with the submission (see
 * `leadSchema.form`), so the single Astro Action can route each lead to the
 * right portal endpoint without a second Action or a second pipeline.
 *
 * The "no new secret" part is not an accident of the current design, it is the
 * point of it. The endpoint key below IDENTIFIES the form; the `PORTAL_ORG_KEY`
 * Worker Secret only AUTHENTICATES, and it is the ORGANIZATION's key — one per
 * org, valid for every form in the org and every website in it. So this
 * registry can grow from one entry to ten while the site keeps deploying and
 * rotating the same two secrets it started with (that key and the Turnstile
 * secret). See `src/lib/portal.ts` and FORMS.md.
 */
export const FORMS = {
  contact: { endpointKey: "contact_abc123", label: "Contact" },
} as const satisfies Record<string, FormConfig>;

export type FormId = keyof typeof FORMS;

/** The form ids, derived from FORMS so the two can never drift apart. */
export const FORM_IDS = Object.keys(FORMS) as [FormId, ...FormId[]];

/**
 * Narrow a submitted form id to a real entry in the registry.
 *
 * This is the ONLY thing standing between a hand-crafted POST and
 * `portalSubmitUrl`, because the shared zod schema deliberately cannot do it:
 * the schema is bundled into the browser with the island, and importing the
 * registry there would publish every form's portal endpoint key in page source
 * (see `config.public.ts`). So the schema shape-checks the field and the
 * server — `src/actions/index.ts` — calls this before the pipeline runs.
 *
 * `Object.hasOwn` rather than `in`: `in` walks the prototype chain, so ids like
 * "toString", "constructor" or "__proto__" would pass and then index into
 * FORMS as a prototype method, producing a nonsense endpoint instead of a
 * clean rejection.
 */
export function isKnownFormId(value: string): value is FormId {
  return Object.hasOwn(FORMS, value);
}

/** Build the portal submit endpoint for a form id. */
export function portalSubmitUrl(formId: FormId): string {
  // A base pasted with a trailing slash would otherwise yield "…//api/forms/…",
  // a different path that most servers answer with a 404 — surfacing as a
  // delivery failure on every single submission.
  const base = PORTAL_API_BASE.replace(/\/+$/u, "");
  return `${base}/api/forms/${FORMS[formId].endpointKey}/submit`;
}

/* -------------------------------------------------------------------------
 * Turnstile
 *
 * The sitekey itself lives in `config.public.ts` (and is re-exported at the
 * top of this file) because it is the one config value an island needs at
 * runtime, and nothing else in this module may follow it into the browser.
 * ---------------------------------------------------------------------- */

/* `TURNSTILE_SITE_KEY` is defined in `config.public.ts` and re-exported above.
 * Its full documentation — why it is public, why it cannot be a Worker Secret,
 * and how to set `PUBLIC_TURNSTILE_SITE_KEY` — lives with the definition. */

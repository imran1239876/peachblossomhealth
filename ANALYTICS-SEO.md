# Analytics & SEO — how we wire it on every Zikra site

How Google Tag Manager, GA4, Search Console, and the SEO layer get connected on a Zikra
Astro site. This is the standard every forked site follows.

Companion docs: `AGENTS.md` (stack + conventions), the `zikra-deploy` skill (Cloudflare
setup), the `zikra-seo-audit` skill (pre-launch checklist).

---

## 1. The model in one paragraph

**One GTM container per site is the only tag we hardcode.** Everything else — GA4, Google
Ads conversions, Microsoft Clarity, Bing UET, Meta Pixel — is configured _inside_ the
container, not in the codebase. On top of that, Cloudflare's **Google tag gateway** proxies
GA4's measurement traffic through a first-party path on our own domain, so the hits survive
ad blockers, Safari ITP, and third-party cookie loss. The site code owns exactly three
things: the container snippet, a small `dataLayer` event vocabulary, and the SEO markup.

```
src/config.ts  ──►  BaseLayout.astro  ──►  GTM container  ──►  GA4 / Ads / Clarity / UET / Meta
   gtmId              (one snippet)         (dashboard)              ▲
                                                                    │
   islands & pages ──► window.dataLayer.push({event:"…"}) ──────────┘
                                                    Cloudflare Tag Gateway
                                                    rewrites GA collection to
                                                    https://<yourdomain>/<prefix>/…
```

**Why GTM-first:** marketing changes tags weekly; we ship code on PR cadence. Every tag that
lives in the container is a change marketing can make without a deploy. Every tag hardcoded
in a layout is a change that needs one of us. Keep the codebase boring.

---

## 2. One-time account setup

Do these in order. They happen once per site.

### 2.1 Google Tag Manager

1. tagmanager.google.com → **Create Account** — account name = client name, container name =
   the bare domain, target = **Web**.
2. Copy the `GTM-XXXXXXX` ID.
3. Add the team: **Admin → User Management**. Marketing gets _Publish_ on the container;
   developers get _Edit_. Nobody works in the live container without a workspace.

### 2.2 GA4 — created inside GTM, not in the page

1. analytics.google.com → **Admin → Create Property**. Set the timezone and currency to the
   client's, not yours. Under **Data Streams → Web**, use the `https://` canonical host and
   copy the `G-XXXXXXXXXX`.
2. Turn on **Enhanced measurement** (scrolls, outbound clicks, site search, file downloads) —
   it covers a lot of what you'd otherwise build tags for.
3. In GTM: **Tags → New → Google Tag**, Tag ID = the `G-` ID, trigger = **Initialization —
   All Pages**. Submit and publish.
4. **Set `SITE.gaMeasurementId` to `""` in the repo.** GA4 belongs to the container. If both
   fire you get duplicated `page_view`s and your sessions inflate.

Set **Admin → Data Settings → Data Retention** to 14 months. The default of 2 months quietly
destroys your year-over-year comparisons.

### 2.3 Cloudflare Google tag gateway (do not skip)

This is what makes our measurement resilient — GA hits go to `yourdomain.com/<prefix>/…`
instead of `google-analytics.com`, so blockers and ITP don't touch them.

1. Cloudflare dashboard → the zone → **Analytics & Logs → Google tag gateway** (under Web
   Analytics on some plans).
2. Enter the **GA4 measurement ID**. Cloudflare generates a random path prefix (a short
   string like `/a1b2/`). It is per-zone and you don't choose it.
3. Enable it. Cloudflare will **auto-inject the container** if the page doesn't already have
   a Google tag.

Verify the prefix is live — a reachability check only, not a URL you point the snippet at:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://YOURDOMAIN/PREFIX/gtm.js
```

Then load the site in a browser and confirm the collection endpoint is first-party:

```js
performance
  .getEntriesByType("resource")
  .map((e) => e.name)
  .filter((n) => /\/g\/c|collect/.test(n));
```

You want `https://yourdomain.com/<prefix>/ga/g/c`, not `https://www.google-analytics.com/g/collect`.

> **Don't rely on auto-injection alone.** It works, but it's invisible in the codebase — a
> container nobody can grep for is a container nobody can debug. Hardcode the snippet
> (section 3) so the ID lives in the repo, and let the gateway do the first-party proxying
> it's actually there for.

Note that the gateway rewrites the **GA4 collection** traffic, not the container download.
Seeing `googletagmanager.com/gtm.js` in the network panel is expected and correct — that is
the URL our snippet ships (section 3). Judge the gateway by the collection endpoint above,
never by the script URL.

### 2.4 Google Search Console

1. search.google.com/search-console → **Add property → Domain** (not URL-prefix — the domain
   property covers `www`, apex, `http`, and `https` in one).
2. Google gives you a TXT record. In Cloudflare **DNS**: type `TXT`, name `@`, content
   `google-site-verification=…`, proxy status irrelevant. Verify.

   Use DNS verification, not the GA/GTM method — DNS is the one that survives a tag change.

3. **Sitemaps → Add a new sitemap → `sitemap.xml`.** Submit once; Google re-crawls it on its
   own afterwards.
4. **Settings → Users and permissions** — add the client as Full, marketing as Restricted.
5. In GA4: **Admin → Product links → Search Console** and link the property. Without this,
   the Search Console reports inside GA4 stay empty.

Do the same at bing.com/webmasters — it imports directly from Search Console in about three
clicks, and it feeds ChatGPT's search results.

---

## 3. The code pattern

Two things in `src/config.ts`:

```ts
// src/config.ts
export const SITE = {
  // …
  /** GA4 Measurement ID. Leave EMPTY — GA4 is configured inside the GTM container. */
  gaMeasurementId: "",
  /** GTM container ID, e.g. "GTM-XXXXXXX". Empty string disables all tagging. */
  gtmId: "GTM-XXXXXXX",
};
```

And in `BaseLayout.astro` (plus any alternate layout, e.g. `LandingLayout.astro`) —
**in `<head>`, as high as possible**. On the template the snippet lives in
`src/components/GoogleTagManager.astro` and the layout just renders it:

```astro
---
import GoogleTagManager from "@/components/GoogleTagManager.astro";
const gtmId = SITE.gtmId;
---

{
  /* GTM runs on the main thread — NOT Partytown. Container-managed tags (GA4,
     Ads conversions, Consent Mode) break inside a web worker. */
  gtmId && <GoogleTagManager id={gtmId} />
}
```

It is a component rather than two inline `<script>` tags because an empty `<script>` inside an
Astro `{cond && …}` expression gets self-closed by Prettier, which then breaks
`eslint-plugin-astro`. On a site that isn't on the template, that's the only reason — paste the
snippet itself:

```astro
{
  gtmId && (
    <>
      <script
        is:inline
        set:html={`window.dataLayer=window.dataLayer||[];window.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});`}
      />
      <script
        is:inline
        async
        src={`https://www.googletagmanager.com/gtm.js?id=${gtmId}`}
      />
    </>
  )
}
```

And the first thing inside `<body>`:

```astro
{
  gtmId && (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
        height="0"
        width="0"
        style="display:none;visibility:hidden"
        title="Google Tag Manager"
      />
    </noscript>
  )
}
```

Rules:

- **Config, not env vars.** `SITE.gtmId` is a non-secret build constant and belongs in
  `src/config.ts`, which is committed. A container ID in a gitignored `.env` silently
  compiles the whole analytics block out of the production build — `PUBLIC_*` env vars only
  work if _every_ build environment sets them, and Cloudflare Workers Builds won't have your
  local `.env`. This failure is invisible: the site builds fine and ships with no analytics.
- **Never put GTM behind Partytown.** The starter configures Partytown with
  `forward: ["dataLayer.push", "gtag"]`, which is fine for a _bare_ GA4 tag, but
  container-managed tags — Ads conversions, Consent Mode, Clarity — break in a worker. GTM
  stays on the main thread.
- **Leave the `src` on `www.googletagmanager.com`.** The gateway already proxies GA4's
  _measurement_ traffic to the first-party path on its own — that is the whole point of it.
  The container script itself legitimately keeps loading from `googletagmanager.com`, and
  repointing it at `/PREFIX/gtm.js` buys nothing while making the snippet depend on a
  per-zone prefix that can change under you. Verify the gateway from the **collection
  endpoint** (section 9), never from the script URL.
- **Add the snippet to every layout.** A layout you forget is a set of pages with no data —
  and it'll be the ads landers, the pages you most need to measure.

---

## 4. Consent Mode v2

Required for EEA/UK traffic and harmless for US-only clients. Cheaper to ship on day one than
to retrofit.

**Set the defaults before GTM loads** — an inline script above the container snippet, no
network call, so the state is established before any tag reads it:

```astro
<script is:inline>
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    dataLayer.push(arguments);
  }
  let consent = null;
  try {
    consent = localStorage.getItem("SITEKEY-cookie-consent");
  } catch {
    /* private mode */
  }
  const granted = consent === "accepted" ? "granted" : "denied";
  gtag("consent", "default", {
    analytics_storage: granted,
    ad_storage: granted,
    ad_user_data: granted,
    ad_personalization: granted,
    wait_for_update: 500,
  });
</script>
```

Then the banner fires `gtag('consent', 'update', {...})` on accept.

If you ship a banner, verify **both halves in the served HTML**, not just in the repo. An
`update` call with no `default` behind it fires into nothing, and the failure is silent.

---

## 5. The `dataLayer` event contract

Site code pushes named events. GTM decides what to do with them. This is the seam — respect
it and marketing can add a conversion without a deploy.

```ts
/** Push a named event to the dataLayer. Analytics must never break a form. */
function trackEvent(name: string, params: Record<string, unknown> = {}): void {
  try {
    const w = window as unknown as { dataLayer?: unknown[] };
    w.dataLayer?.push({ event: name, ...params });
  } catch {
    /* swallow — a tracking failure is never a user-facing failure */
  }
}
```

**Push to `dataLayer`, never call `window.gtag`.** With a GTM-only setup, `window.gtag` is
`undefined` — GTM does not expose it globally. Code that calls it fails silently and records
nothing. `dataLayer` is always there, because our own snippet creates it before GTM loads.

The vocabulary we use across sites — keep these names identical everywhere so one GTM recipe
works on all of them:

| Event                 | Fired when                                     | Fired from                       |
| --------------------- | ---------------------------------------------- | -------------------------------- |
| `phone_click`         | any `tel:` link is clicked                     | delegated listener in the layout |
| `form_submit_success` | lead form submits successfully                 | the form island                  |
| `cta_<name>`          | an element with `data-cta="<name>"` is clicked | delegated listener               |

The delegated listener pattern — one listener, zero per-element wiring:

```ts
document.addEventListener("click", (e) => {
  const el =
    e.target instanceof Element ? e.target.closest('a[href^="tel:"]') : null;
  if (el)
    trackEvent("phone_click", { link_url: el.getAttribute("href") ?? "" });
});
```

In GTM, each of these becomes a **Custom Event** trigger (Trigger type → Custom Event, event
name = `phone_click`), attached to a GA4 Event tag and/or a Google Ads Conversion tag.

---

## 6. Conversion tracking & ad attribution

### The thank-you page is the conversion

Redirect the lead form to `/thank-you/` on success rather than swapping in an inline success
panel. That gives Google Ads and GTM a **distinct URL** to fire on, which is far more robust
than a DOM-change trigger and works with Ads' own auto-tagging.

`/thank-you/` must be `noindex` **and** excluded from the sitemap — both, or neither is
correct. That means two places that have to stay in sync:

```astro
<LandingLayout title="Thank you" noindex>…</LandingLayout>
```

```js
// astro.config.mjs
sitemap({
  filter: (page) =>
    !page.includes("/lp/") &&
    !/\/patient-forms\/.+/.test(page) &&
    !/\/thank-you\/?$/.test(page),
}),
```

### gclid capture

Google Ads' own conversion tracking handles most of this, but we also carry the click ID into
the CRM so sales can see which lead came from which ad. Read `gclid` from the query string,
stash it in `sessionStorage` (so it survives navigation from the lander to the form), and
submit it as a form field. The CRM push then routes leads carrying a `gclid` to the Ads
source.

Also worth capturing into a single compressed `attribution` string: `utm_*` params, `fbclid`,
the landing path, and the referrer.

### Ads → GA4 → Search Console links

- Google Ads → **Tools → Linked accounts → Google Analytics (GA4)**. Enables auto-tagging and
  imports GA4 conversions as Ads conversion actions.
- GA4 → **Admin → Key events**: mark `form_submit_success` and `phone_click` as key events.
  Only key events can be imported into Ads as conversions.

---

## 7. The SEO layer

`BaseLayout` already emits all of this. Do not hand-roll it per page.

### Per-page metadata

Every page wraps `BaseLayout` and passes props. Nothing else. Never add your own
`<html>`/`<head>`, never duplicate SEO tags.

```astro
<BaseLayout
  title="Service Name in City"
  description="What the service is, where it's offered, and the one detail that makes someone click. Around 150–160 characters."
  type="website"
>
  …page content…
</BaseLayout>
```

`Seo.astro` (astro-seo) turns those into title, description, canonical, Open Graph, and
Twitter card tags. Worth building in: append the brand suffix **only when the result stays
under 60 characters**, and skip it if the title already names the brand — so titles don't get
truncated in the SERP.

Descriptions: 150–160 characters. Titles: under 60. Both are checked by the `zikra-seo-audit`
skill.

### Structured data

- **Sitewide**: `LocalBusiness` (or a more specific subtype like `MedicalClinic`) via
  `astro-seo-schema`, rendered once in `BaseLayout` from `SITE`.
- **Blog posts**: `Article`, from `BlogPost.astro`.
- **FAQ pages**: `FAQPage`.

The pattern to use: a **single `@graph`** per page containing the organization, website, and
breadcrumb nodes plus any page-specific nodes, with stable `@id`s (`#organization`,
`#website`) so cross-references resolve. Repeat the org and website nodes on every page
deliberately — otherwise `publisher` / `about` references dangle everywhere but the homepage.

Two rules:

- **`aggregateRating` only on pages that visibly show the reviews.** Rating markup for a
  rating a user can't see on the page is a manual-action risk.
- **Skip JSON-LD entirely on `noindex` pages.** Nothing should index them, so nothing needs
  describing.

Validate at [search.google.com/test/rich-results](https://search.google.com/test/rich-results)
before launch.

### Sitemap

Use `@astrojs/sitemap`. It always emits `sitemap-index.xml` + `sitemap-0.xml`; our sites are
small enough for one file, so a small post-build plugin flattens it to `/sitemap.xml` — the
URL we advertise in `robots.txt` and submit to Search Console. Make that plugin **fall back
to serving the index if `sitemap-1.xml` ever appears**, so a growing site can't silently lose
URLs.

Anything `noindex` must be filtered out of the sitemap too. A `noindex` page in a sitemap is
a direct contradiction and Search Console will report it as one.

### robots.txt

Allow everything, including AI crawlers — for most of our clients, being answerable by
ChatGPT and Claude is distribution, not a threat. Advertise the sitemap, and add Content
Signals:

```
User-agent: *
Allow: /

Content-Signal: search=yes, ai-input=yes, ai-train=yes

Sitemap: https://YOURDOMAIN/sitemap.xml
```

`ai-train` is the one judgment call — follow the client's preference; default to `yes` unless
they object.

### llms.txt

A plain-text index of the site for LLM consumers, served at `/llms.txt`. Generate it from a
route (`llms.txt.ts`) rather than shipping a static file, so it can't go stale.

### Redirects

**Cloudflare Bulk Redirects, not app code.** When a site replaces an existing one, every old
URL needs a 301 to its new equivalent or you throw away the accumulated authority. Export the
old URL list from the old Search Console property, map it, and load it as a Bulk Redirect
list. Watch for redirects that shadow a real page — a stale `/thank-you/` 301, for instance,
will happily intercept your new thank-you page.

---

## 8. Launch checklist

Before flipping DNS:

- [ ] `SITE.gtmId` set in `src/config.ts`; `gaMeasurementId` is `""`
- [ ] GTM snippet in **every** layout (`BaseLayout`, `LandingLayout`, …), `<noscript>` in `<body>`
- [ ] GA4 tag configured in the container on **Initialization — All Pages**, container published
- [ ] Cloudflare Google tag gateway enabled; `/PREFIX/gtm.js` returns 200
- [ ] GA4 data retention set to 14 months
- [ ] Search Console **domain** property verified by DNS TXT
- [ ] `sitemap.xml` submitted; `robots.txt` advertises it
- [ ] GA4 ↔ Search Console linked; GA4 ↔ Google Ads linked (if running ads)
- [ ] Bing Webmaster Tools imported from Search Console
- [ ] `phone_click` / `form_submit_success` triggers built in GTM, marked as key events in GA4
- [ ] Thank-you page is `noindex` **and** filtered from the sitemap
- [ ] 301s loaded in Cloudflare Bulk Redirects, spot-checked against the old URL list
- [ ] `zikra-seo-audit` skill run clean

After DNS:

- [ ] GA4 **Realtime** shows your own visit
- [ ] GTM Preview mode fires the tags you expect on a real page
- [ ] Submit a test lead; confirm it lands in GA4, the CRM, and `/thank-you/`
- [ ] Search Console **URL Inspection** on the homepage → "URL is on Google" (allow a few days)

---

## 9. Verifying a live site in 60 seconds

Load the site and run this in the browser console.

```js
JSON.stringify(
  {
    containers: Object.keys(window.google_tag_manager || {}),
    dataLayerLength: (window.dataLayer || []).length,
    tagRequests: performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((n) =>
        /gtm|gtag|analytic|clarity|doubleclick|collect|bat\.bing|facebook/i.test(
          n,
        ),
      )
      .map((n) => n.split("?")[0])
      .filter((v, i, a) => a.indexOf(v) === i),
  },
  null,
  2,
);
```

Reading the output:

- `containers` should list **exactly one** `GTM-…` key. Two means you're double-loading — the
  hardcoded snippet plus gateway auto-injection — and every metric is doubled.
- It should also list the `G-…` and `AW-…` IDs the container is managing. That's your proof
  GA4 and Ads are actually live, without opening GTM.
- `tagRequests` should include a **first-party** collection URL on your own domain
  (`/PREFIX/ga/g/c`). If you only see `google-analytics.com/g/collect`, the gateway isn't
  working. Seeing `googletagmanager.com/gtm.js` in the same list is expected and is _not_ a
  gateway failure — the gateway proxies measurement, not the container script.
- `window.gtag` being `undefined` is **normal** with a GTM-only setup. It's also exactly why
  code must push to `dataLayer` instead.

And from the shell:

```bash
curl -sI https://YOURDOMAIN/sitemap.xml | head -1
curl -s https://YOURDOMAIN/robots.txt
dig +short TXT YOURDOMAIN | grep google-site-verification
```

---

## 10. Failure modes to check for

These are silent — the site builds, deploys, and looks fine while collecting nothing.

| Symptom                                             | Cause                                                                                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| No analytics in prod, works locally                 | Container ID in a gitignored `.env`; the build compiles the block away. Move it to `src/config.ts`.                                     |
| Custom events never appear in GA4                   | Code calls `window.gtag`, which is `undefined` under GTM-only. Push to `dataLayer`.                                                     |
| Consent Mode has no effect                          | The banner fires `consent update` but no `consent default` was ever set.                                                                |
| Every metric doubled                                | Two containers loading — hardcoded snippet _and_ gateway auto-injection. Or GA4 firing both in-page and in the container.               |
| Ads conversions missing / Clarity dead              | GTM was put behind Partytown. Container-managed tags need the main thread.                                                              |
| GA hits blocked for a chunk of users                | Tag Gateway not enabled on the zone. Check the collection endpoint, not the container `src` — that one stays on `googletagmanager.com`. |
| Landing pages have no data                          | Snippet added to `BaseLayout` but not the other layouts.                                                                                |
| Search Console verification lost after a tag change | Verified via the GA/GTM method instead of DNS TXT.                                                                                      |

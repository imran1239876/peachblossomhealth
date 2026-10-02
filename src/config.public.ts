/**
 * Browser-safe configuration — the ONLY config module a client island may
 * import at runtime.
 *
 * ### Why this file is separate from `config.ts`
 *
 * Anything a React island imports is bundled into the JavaScript served to
 * every visitor, and a bundler pulls in the whole module graph behind that
 * import. `config.ts` holds the FORMS registry (portal endpoint keys) and
 * `PORTAL_API_BASE`; if an island reached those — even indirectly, through a
 * module that imports them — the site's portal submit URLs would be readable
 * in page source.
 *
 * Those URLs are not a catastrophe on their own: a server-mode submission
 * still needs the `pfk_`/`pok_` bearer token, which never leaves the Worker.
 * But a form with no allowed-domain list configured in the portal accepts
 * browser-mode posts, and the portal performs no challenge check of its own,
 * so a published endpoint key is a spam target that buys an attacker nothing
 * to discover. Keeping it off the wire costs nothing, so we keep it off.
 *
 * The rule this file enforces: **islands import `@/config.public` for values
 * and `@/config` for types only** (`import type` is erased at compile time and
 * creates no bundle edge). If you add a value here, it must be safe to publish.
 */

/**
 * Read a build-time (non-secret) environment variable, falling back when it is
 * missing OR blank.
 *
 * `KEY=` in a .env file is a *value* — the empty string — which `??` would
 * happily take. A blank sitekey or a blank portal base breaks every form on
 * the site while looking configured, so an unusable value is treated as unset.
 *
 * Callers must pass the `import.meta.env.X` member expression itself: Astro
 * replaces that exact expression with a literal at build time, so the read has
 * to stay visible to the bundler rather than hiding behind a dynamic key.
 */
export function fromBuildEnv(
  value: string | undefined,
  fallback: string,
): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

/**
 * Cloudflare's "always passes" TEST sitekey, so a fresh clone runs `pnpm dev`
 * with a working form before anyone has provisioned a widget. It pairs with
 * the test secret in `.dev.vars.example`.
 */
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

/**
 * Cloudflare Turnstile SITE key.
 *
 * **Public by design.** The widget renders in the browser, so this value is
 * served to every visitor no matter where it is stored — it is not a secret,
 * and it must never be "fixed" into a Worker Secret. It could not work as one
 * anyway: pages here are prerendered at BUILD time (`output: "static"`), so a
 * runtime Worker secret is simply not reachable from the prerendered client JS
 * without server-rendering the page or paying for an extra round-trip before
 * the widget can appear.
 *
 * Set `PUBLIC_TURNSTILE_SITE_KEY` as a BUILD environment variable — `.env`
 * locally, the Workers build settings or CI environment in production (see
 * `.env.example`) — to configure it without editing code. Leave it unset and
 * the test key above keeps the demo form working.
 *
 * The key must belong to a widget whose allowed hostnames cover every domain
 * this site is served from — the apex, `www`, and (for local development)
 * `localhost` and `127.0.0.1`. A hostname the widget does not list fails
 * verification even though the challenge appears to render fine.
 *
 * The matching SECRET key never goes here: put it in the Worker as
 * TURNSTILE_SECRET (`wrangler secret put TURNSTILE_SECRET`) and in the
 * gitignored `.dev.vars` locally. See the `zikra-deploy` skill for the
 * `wrangler turnstile widget create` command that mints both halves.
 */
export const TURNSTILE_SITE_KEY = fromBuildEnv(
  import.meta.env.PUBLIC_TURNSTILE_SITE_KEY,
  TURNSTILE_TEST_SITE_KEY,
);

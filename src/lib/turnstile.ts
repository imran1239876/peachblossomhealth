const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Build the x-www-form-urlencoded body for the Turnstile siteverify call.
 * Pure and fetch-free so it can be unit-tested directly.
 */
export function buildTurnstileBody(
  token: string,
  secret: string,
  remoteIp?: string,
): URLSearchParams {
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);
  return body;
}

/**
 * siteverify is Cloudflare's own edge endpoint and normally answers in
 * milliseconds, so this bound is loose enough never to bounce a legitimate
 * visitor on a slow network, but tight enough that a stalled call cannot pin
 * the Action open — `fetch` imposes no deadline on its own.
 */
const SITEVERIFY_TIMEOUT_MS = 10_000;

/**
 * Verify a Turnstile token against Cloudflare. Returns the `success` flag.
 *
 * **Fails closed.** This is the site's only spam gate — the portal downstream
 * performs no Turnstile check of its own — so anything that stops us from
 * seeing an explicit `success: true` (a network error, a timeout, a non-2xx
 * status, a body that is not the JSON we expect) is treated as a failed
 * challenge rather than waved through. A siteverify outage means visitors
 * briefly cannot submit; failing open would instead mean the form is briefly
 * unprotected.
 */
export async function verifyTurnstile(
  token: string,
  secret: string,
  remoteIp?: string,
): Promise<boolean> {
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: buildTurnstileBody(token, secret, remoteIp),
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    if (!res.ok) return false;

    const data: unknown = await res.json();
    return (
      typeof data === "object" &&
      data !== null &&
      (data as { success?: unknown }).success === true
    );
  } catch {
    return false;
  }
}

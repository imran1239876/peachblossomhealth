import type { LeadInput } from "@/lib/schema";

export interface Z360Payload {
  name: string;
  email: string;
  phone?: string;
  message: string;
  source: "website";
}

/**
 * Build the Z360 inquiry payload for a lead. Pure — unit-testable.
 */
export function buildZ360Payload(lead: LeadInput): Z360Payload {
  return {
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    message: lead.message,
    source: "website",
  };
}

/**
 * The tightest budget of the three outbound calls, deliberately. This push runs
 * AFTER the lead is already safe in the portal, so every second it stalls is a
 * second a delivered lead spends looking undelivered to the visitor. Without a
 * bound, a Z360 endpoint that hangs would keep the Action open until the
 * runtime killed it — turning a stored lead into a visible error, and a retry
 * into a duplicate submission. Best-effort must mean best-effort in wall time
 * too, not just in error handling.
 */
const Z360_TIMEOUT_MS = 5_000;

/**
 * Push a lead to the Z360 CRM inquiries endpoint.
 *
 * OPEN ITEM: the exact inquiries endpoint URL and payload shape still need to
 * be confirmed with the Z360 team — SITE.z360InquiriesUrl is a placeholder.
 * Returns the raw Response so the caller logs but never fails on this; a
 * timeout rejects into that same swallow-and-log path.
 */
export async function pushToZ360(
  url: string,
  token: string,
  lead: LeadInput,
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildZ360Payload(lead)),
    signal: AbortSignal.timeout(Z360_TIMEOUT_MS),
  });
}

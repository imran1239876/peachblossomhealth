import { portalSubmitUrl, type FormId, type SiteConfig } from "@/config";
import { submitToPortal } from "@/lib/portal";
import type { LeadInput } from "@/lib/schema";
import { verifyTurnstile } from "@/lib/turnstile";
import { pushToZ360 } from "@/lib/z360";

export type LeadPipelineFailure = "spam" | "delivery";

export class LeadPipelineError extends Error {
  constructor(public readonly failure: LeadPipelineFailure) {
    super(failure);
    this.name = "LeadPipelineError";
  }
}

export interface LeadPipelineBindings {
  TURNSTILE_SECRET: string;
  /**
   * The organization's portal API key (`pok_…`) — ONE per org, valid for every
   * form in the registry and every website in that organization. It is
   * singular on purpose: the key AUTHENTICATES, and the endpoint key in the
   * submit URL IDENTIFIES the form, so a site with ten forms needs exactly the
   * same one secret as a site with one. Adding a form never adds a secret.
   *
   * The portal endpoint also still accepts a legacy per-form `pfk_…` token in
   * this same slot, so existing integrations keep working — but that is not
   * the path a new site takes, and it cannot serve more than one form here
   * because the Worker binds a single value and sends it for every submission.
   */
  PORTAL_ORG_KEY: string;
  Z360_TOKEN?: string;
}

export interface LeadPipelineDependencies {
  verifyTurnstile: typeof verifyTurnstile;
  submitToPortal: typeof submitToPortal;
  pushToZ360: typeof pushToZ360;
  randomUUID: () => string;
  logger: Pick<Console, "error" | "warn">;
}

export interface LeadPipelineOptions {
  clientAddress?: string;
  /**
   * Only the Z360 switches come from SITE now. The portal endpoint is derived
   * from the submitted form id instead (`portalSubmitUrl(input.form)`), so a
   * site with several forms routes each lead to its own portal form without a
   * second pipeline.
   */
  site: Pick<SiteConfig, "z360Enabled" | "z360InquiriesUrl">;
}

const defaultDependencies: LeadPipelineDependencies = {
  verifyTurnstile,
  submitToPortal,
  pushToZ360,
  randomUUID: () => crypto.randomUUID(),
  logger: console,
};

function serializeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Read the portal's proof that it stored the lead.
 *
 * A 2xx on its own proves nothing — a login page, a maintenance page, or any
 * other body served from the submit URL answers 200 just as happily. The
 * portal confirms a committed submission with `{ ok: true, submissionId }`,
 * so that body is the only acceptable evidence. Returns the submission id, or
 * `null` for anything else (non-JSON, missing id, `ok: false`, parse throw).
 */
async function readPortalSubmissionId(
  response: Response,
): Promise<string | null> {
  try {
    const body = (await response.json()) as {
      ok?: unknown;
      submissionId?: unknown;
    };
    return body?.ok === true && typeof body.submissionId === "string"
      ? body.submissionId
      : null;
  } catch {
    return null;
  }
}

/**
 * Execute the lead pipeline independently from Astro's Action layer.
 * Dependencies are injectable so ordering and failure policies remain covered
 * by fast unit tests without emulating the Workers runtime.
 *
 * Order:
 *  1. **Turnstile** — verified HERE, at the website, and nowhere else. Tokens
 *     are single-use, so exactly one party may call siteverify; that party is
 *     the site. The portal performs no Turnstile check of its own.
 *  2. **Portal** — the central intake, and the ONLY durable sink. It archives
 *     the raw submission to its own R2 bucket before writing D1 and sends its
 *     own notification email, so this site keeps no local copy of the lead.
 *     Which portal form receives it comes from the submitted form id, via
 *     `portalSubmitUrl(input.form)` and the FORMS registry in `src/config.ts`.
 *  3. **Z360** — optional CRM push, last and best-effort.
 *
 * ### The "portal is the only sink, so the push must hard-fail" rule
 *
 * Because nothing is stored locally, a best-effort portal push would silently
 * drop the lead the moment the portal hiccups — the exact failure this whole
 * architecture exists to prevent. So the portal step is MANDATORY and
 * HARD-FAILING: any throw, any non-ok response, and any 2xx that does not
 * carry the portal's `{ ok: true, submissionId }` confirmation is logged and
 * then raised as a `delivery` failure so the visitor sees an error and can
 * retry rather than being told their message was sent when it was not. Only
 * the optional Z360 push, which runs after the lead is already safe in the
 * portal, is allowed to fail quietly.
 *
 * "Quietly" has to include *slowly*, which is why every outbound call in this
 * pipeline carries its own `AbortSignal.timeout` (see `portal.ts`, `z360.ts`,
 * `turnstile.ts`). `fetch` never times out on its own, so an endpoint that
 * accepts the connection and then goes silent would otherwise stall this
 * function until the runtime killed the invocation — skipping the logging
 * branches below entirely, and, for Z360, converting an already-delivered lead
 * into a visitor-facing error that invites a duplicate retry.
 */
export async function processLead(
  /**
   * The validated submission, with its form id already narrowed to a real
   * FORMS key. The schema can only shape-check that field (it is shared with
   * the browser bundle and must not import the registry), so the CALLER owns
   * the membership check — see `isKnownFormId` in `src/actions/index.ts`. This
   * type makes that obligation impossible to forget: an un-narrowed
   * `LeadInput` will not compile here.
   */
  input: LeadInput & { form: FormId },
  bindings: LeadPipelineBindings,
  options: LeadPipelineOptions,
  dependencies: Partial<LeadPipelineDependencies> = {},
): Promise<{ ok: true; id: string }> {
  const deps = { ...defaultDependencies, ...dependencies };

  // Correlation id generated locally, for logs only: it ties every line for
  // one attempt together even when the portal call is what failed, and it is
  // available before the portal has assigned anything. The id RETURNED to the
  // caller is the portal's, because that is the one naming a stored record.
  const leadId = deps.randomUUID();

  // Every log line below carries the form id: one site now fires this pipeline
  // from several forms, and "the portal rejected a lead" is only actionable
  // once you know WHICH form it was. The org key is shared by all of them, so
  // the form id is precisely the part that varies — a failure on one form and
  // not the others points at that form's endpoint key, while a failure on
  // every form points at the key.
  const form = input.form;

  const passed = await deps.verifyTurnstile(
    input.turnstileToken,
    bindings.TURNSTILE_SECRET,
    options.clientAddress,
  );
  if (!passed) throw new LeadPipelineError("spam");

  let response: Response;
  try {
    // Routing and authentication are two different things here, and keeping
    // them separate is what makes one secret enough for a whole site:
    //   - the endpoint key inside this URL IDENTIFIES the form, so the
    //     submitted (and registry-checked) form id fully determines routing;
    //   - PORTAL_ORG_KEY only AUTHENTICATES, and the org key is valid for
    //     every form in the org, so the same bearer is correct for every form
    //     this site will ever add.
    response = await deps.submitToPortal(
      portalSubmitUrl(form),
      bindings.PORTAL_ORG_KEY,
      input,
    );
  } catch (error) {
    // The push never reached the portal at all (network error, DNS, timeout).
    deps.logger.error(
      JSON.stringify({
        event: "lead_portal_errored",
        leadId,
        form,
        error: serializeError(error),
      }),
    );
    throw new LeadPipelineError("delivery");
  }

  // A reply that is not 2xx means the portal did not accept the lead, which is
  // just as lost as a connection failure. Same treatment.
  if (!response.ok) {
    deps.logger.error(
      JSON.stringify({
        event: "lead_portal_failed",
        leadId,
        form,
        status: response.status,
      }),
    );
    throw new LeadPipelineError("delivery");
  }

  // A 2xx still has to prove itself. `submitToPortal` does not follow
  // redirects, but a 2xx can come from anything sitting at the submit URL,
  // so only the portal's own `{ ok: true, submissionId }` counts as stored.
  // An unconfirmed 2xx is exactly as lost as a 503.
  const submissionId = await readPortalSubmissionId(response);
  if (!submissionId) {
    deps.logger.error(
      JSON.stringify({
        event: "lead_portal_unconfirmed",
        leadId,
        form,
        status: response.status,
      }),
    );
    throw new LeadPipelineError("delivery");
  }

  if (options.site.z360Enabled && bindings.Z360_TOKEN) {
    try {
      const z360Response = await deps.pushToZ360(
        options.site.z360InquiriesUrl,
        bindings.Z360_TOKEN,
        input,
      );
      if (!z360Response.ok) {
        deps.logger.error(
          JSON.stringify({
            event: "lead_z360_failed",
            leadId,
            form,
            status: z360Response.status,
          }),
        );
      }
    } catch (error) {
      deps.logger.error(
        JSON.stringify({
          event: "lead_z360_errored",
          leadId,
          form,
          error: serializeError(error),
        }),
      );
    }
  }

  return { ok: true, id: submissionId };
}

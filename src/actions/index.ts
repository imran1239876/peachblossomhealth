import { defineAction, ActionError } from "astro:actions";
import { env } from "cloudflare:workers";

import { isKnownFormId, SITE } from "@/config";
import { LeadPipelineError, processLead } from "@/lib/lead-pipeline";
import { leadSchema } from "@/lib/schema";

export const server = {
  /**
   * The ONE Action, for EVERY form on the site. `leadSchema` carries the form
   * id, so a site with several forms needs no second Action and no second
   * pipeline: `processLead` turns that id into the portal endpoint.
   */
  submitLead: defineAction({
    accept: "json",
    input: leadSchema,
    handler: async (input, context) => {
      if (!isKnownFormId(input.form)) {
        // Not a real form on this site. Nothing was sent anywhere, and this is
        // never a visitor's fault — the island always submits an id it was
        // handed — so it means a misconfigured page or a hand-crafted POST.
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Unknown form.",
        });
      }

      try {
        return await processLead({ ...input, form: input.form }, env, {
          clientAddress: context.clientAddress,
          site: SITE,
        });
      } catch (error) {
        if (error instanceof LeadPipelineError && error.failure === "spam") {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "Spam check failed. Please try again.",
          });
        }

        // Everything else — a "delivery" failure or an unexpected throw. The
        // portal is the only sink, so a failure here means the lead was NOT
        // recorded anywhere; tell the visitor plainly so they retry.
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "We couldn't send your message. Please try again.",
        });
      }
    },
  }),
};

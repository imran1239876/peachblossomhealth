import { describe, expect, it, vi } from "vitest";

import { FORMS, portalSubmitUrl, type FormId } from "@/config";
import {
  processLead,
  type LeadPipelineBindings,
  type LeadPipelineDependencies,
} from "@/lib/lead-pipeline";
import type { LeadInput } from "@/lib/schema";

// `form` is narrowed to a FormId here the same way the Action narrows it
// (`isKnownFormId`) before calling processLead: the shared schema can only
// shape-check that field, because it must not import the FORMS registry into
// the browser bundle.
const lead: LeadInput & { form: FormId } = {
  form: "contact",
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "+1 555 0100",
  message: "I'd love to hear more about your services.",
  turnstileToken: "tok_123",
};

// Only the Z360 switches come from SITE now — the portal endpoint is derived
// from the submitted form id.
const site = {
  z360Enabled: true,
  z360InquiriesUrl: "https://z360.example/inquiries",
};

// The portal's proof that a submission was committed. Only this body counts as
// storage — see `readPortalSubmissionId` in the pipeline.
function portalStored(submissionId = "sub_abc123") {
  return new Response(JSON.stringify({ ok: true, submissionId }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function createHarness() {
  // Every stub appends to one shared list so a test can assert the exact
  // ordering of the pipeline, not merely that each step ran.
  const events: string[] = [];
  const bindings: LeadPipelineBindings = {
    TURNSTILE_SECRET: "turnstile-secret",
    // The organization's key — one per org, valid for every form in it.
    PORTAL_ORG_KEY: "pok_org-key",
    Z360_TOKEN: "z360-token",
  };
  const dependencies: LeadPipelineDependencies = {
    verifyTurnstile: vi.fn(async () => {
      events.push("verify");
      return true;
    }),
    submitToPortal: vi.fn(async () => {
      events.push("portal");
      return portalStored();
    }),
    pushToZ360: vi.fn(async () => {
      events.push("z360");
      return new Response(null, { status: 202 });
    }),
    randomUUID: () => "lead-123",
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
    },
  };

  return { bindings, dependencies, events };
}

describe("processLead", () => {
  it("verifies Turnstile, then delivers to the portal, then pushes to Z360", async () => {
    const harness = createHarness();

    // The id returned is the portal's — the only one naming a stored record.
    await expect(
      processLead(lead, harness.bindings, { site }, harness.dependencies),
    ).resolves.toEqual({ ok: true, id: "sub_abc123" });

    expect(harness.events).toEqual(["verify", "portal", "z360"]);
    expect(harness.dependencies.submitToPortal).toHaveBeenCalledWith(
      portalSubmitUrl(lead.form),
      harness.bindings.PORTAL_ORG_KEY,
      lead,
    );
  });

  it("targets the portal endpoint of the SUBMITTED form", async () => {
    const harness = createHarness();

    await processLead(lead, harness.bindings, { site }, harness.dependencies);

    // Routing comes from the lead's own form id, not from a site-wide URL: the
    // endpoint key in the URL is the only thing telling the portal which form
    // a submission belongs to (the bearer token merely authenticates), so a
    // site running several forms must send each one to its own endpoint.
    const url = vi.mocked(harness.dependencies.submitToPortal).mock
      .calls[0]?.[0];
    expect(url).toBe(portalSubmitUrl(lead.form));
    expect(url).toContain(FORMS[lead.form].endpointKey);
  });

  it("sends the SAME single org key for two DIFFERENT forms", async () => {
    // This is the whole point of one key per organization. The key only
    // AUTHENTICATES and the endpoint key in the URL IDENTIFIES the form, so a
    // second form is one line in the FORMS registry and NOT a second secret:
    // the Worker binds exactly one PORTAL_ORG_KEY and it is correct for every
    // form in the org.
    //
    // The starter ships a one-entry registry, so a two-form site is simulated
    // by mocking the module a fork edits. `vi.doMock` is deliberately not
    // hoisted: only the dynamic import below sees it, and every other test in
    // this file keeps exercising the real `@/config`.
    vi.resetModules();
    vi.doMock("@/config", async () => {
      const actual =
        await vi.importActual<typeof import("@/config")>("@/config");
      const FORMS_WITH_TWO = {
        contact: { endpointKey: "contact_abc123", label: "Contact" },
        quote: { endpointKey: "quote_ef34gh", label: "Quote request" },
      };
      return {
        ...actual,
        FORMS: FORMS_WITH_TWO,
        portalSubmitUrl: (formId: keyof typeof FORMS_WITH_TWO) =>
          `${actual.PORTAL_API_BASE}/api/forms/${FORMS_WITH_TWO[formId].endpointKey}/submit`,
      };
    });

    const { processLead: processLeadAgainstTwoForms } =
      await import("@/lib/lead-pipeline");
    const harness = createHarness();

    // `FormId` is derived from the real one-entry registry, so the second id
    // has to reach the pipeline through `string` — which is exactly the route
    // a real submission takes, since `isKnownFormId` is what narrows it.
    const asFormId = (id: string): FormId => id as FormId;

    for (const form of ["contact", "quote"]) {
      await processLeadAgainstTwoForms(
        { ...lead, form: asFormId(form) },
        harness.bindings,
        { site },
        harness.dependencies,
      );
    }

    const calls = vi.mocked(harness.dependencies.submitToPortal).mock.calls;

    // Two different forms → two different endpoints…
    expect(calls[0]?.[0]).toContain("contact_abc123");
    expect(calls[1]?.[0]).toContain("quote_ef34gh");
    expect(calls[0]?.[0]).not.toBe(calls[1]?.[0]);

    // …carrying one and the same credential. If this ever needed a per-form
    // secret, the second call would have to present a different bearer — and
    // there is nowhere for one to live.
    expect(calls[0]?.[1]).toBe(harness.bindings.PORTAL_ORG_KEY);
    expect(calls[1]?.[1]).toBe(harness.bindings.PORTAL_ORG_KEY);

    vi.doUnmock("@/config");
    vi.resetModules();
  });

  it("rejects as spam and delivers nowhere when Turnstile fails", async () => {
    const harness = createHarness();
    vi.mocked(harness.dependencies.verifyTurnstile).mockResolvedValue(false);

    await expect(
      processLead(lead, harness.bindings, { site }, harness.dependencies),
    ).rejects.toMatchObject({ failure: "spam" });

    expect(harness.dependencies.submitToPortal).not.toHaveBeenCalled();
    expect(harness.dependencies.pushToZ360).not.toHaveBeenCalled();
  });

  it("fails delivery when the portal answers with a non-ok status", async () => {
    const harness = createHarness();
    vi.mocked(harness.dependencies.submitToPortal).mockResolvedValue(
      new Response(null, { status: 503 }),
    );

    await expect(
      processLead(lead, harness.bindings, { site }, harness.dependencies),
    ).rejects.toMatchObject({ failure: "delivery" });

    // The portal is the only sink: a rejected lead must never look delivered,
    // and nothing downstream should run on a lead that was not recorded.
    expect(harness.dependencies.pushToZ360).not.toHaveBeenCalled();
    expect(harness.dependencies.logger.error).toHaveBeenCalledOnce();

    // Every structured line names the form: with several forms per site,
    // "the portal rejected a lead" is only actionable once you know which
    // form's endpoint key or token is wrong.
    const line = vi.mocked(harness.dependencies.logger.error).mock
      .calls[0]?.[0];
    expect(line).toContain("lead_portal_failed");
    expect(line).toContain('"form":"contact"');
  });

  it("fails delivery when the portal push throws", async () => {
    const harness = createHarness();
    vi.mocked(harness.dependencies.submitToPortal).mockRejectedValue(
      new Error("Portal unavailable"),
    );

    await expect(
      processLead(lead, harness.bindings, { site }, harness.dependencies),
    ).rejects.toMatchObject({ failure: "delivery" });

    expect(harness.dependencies.pushToZ360).not.toHaveBeenCalled();
    expect(harness.dependencies.logger.error).toHaveBeenCalledOnce();
    expect(
      vi.mocked(harness.dependencies.logger.error).mock.calls[0]?.[0],
    ).toContain("lead_portal_errored");
  });

  it.each([
    [
      "an unauthenticated login page a redirect landed on",
      new Response("<!doctype html><title>Sign in</title>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    ],
    ["a 2xx with no body at all", new Response(null, { status: 200 })],
    [
      "a JSON body that reports ok: false",
      new Response(JSON.stringify({ ok: false, error: "rejected" }), {
        status: 200,
      }),
    ],
    [
      "a JSON body carrying no submissionId",
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ],
  ])(
    "fails delivery when a 2xx does not confirm a stored submission: %s",
    async (_label, response) => {
      const harness = createHarness();
      vi.mocked(harness.dependencies.submitToPortal).mockResolvedValue(
        response,
      );

      // A 2xx is not proof of storage. Nothing reached D1 or the archive
      // bucket, so the visitor must NOT be told the message was sent.
      await expect(
        processLead(lead, harness.bindings, { site }, harness.dependencies),
      ).rejects.toMatchObject({ failure: "delivery" });

      expect(harness.dependencies.pushToZ360).not.toHaveBeenCalled();
      expect(harness.dependencies.logger.error).toHaveBeenCalledOnce();
      expect(
        vi.mocked(harness.dependencies.logger.error).mock.calls[0]?.[0],
      ).toContain("lead_portal_unconfirmed");
    },
  );

  it("skips Z360 when the site config disables it", async () => {
    const harness = createHarness();

    await processLead(
      lead,
      harness.bindings,
      { site: { ...site, z360Enabled: false } },
      harness.dependencies,
    );

    expect(harness.dependencies.pushToZ360).not.toHaveBeenCalled();
  });

  it("skips Z360 when the token is missing", async () => {
    const harness = createHarness();

    await processLead(
      lead,
      { ...harness.bindings, Z360_TOKEN: undefined },
      { site },
      harness.dependencies,
    );

    expect(harness.dependencies.pushToZ360).not.toHaveBeenCalled();
  });

  it("survives a non-ok Z360 response — the lead is already in the portal", async () => {
    const harness = createHarness();
    vi.mocked(harness.dependencies.pushToZ360).mockResolvedValue(
      new Response(null, { status: 500 }),
    );

    await expect(
      processLead(lead, harness.bindings, { site }, harness.dependencies),
    ).resolves.toEqual({ ok: true, id: "sub_abc123" });

    expect(
      vi.mocked(harness.dependencies.logger.error).mock.calls[0]?.[0],
    ).toContain("lead_z360_failed");
  });

  it("survives a thrown Z360 error — the lead is already in the portal", async () => {
    const harness = createHarness();
    vi.mocked(harness.dependencies.pushToZ360).mockRejectedValue(
      new Error("Z360 unavailable"),
    );

    await expect(
      processLead(lead, harness.bindings, { site }, harness.dependencies),
    ).resolves.toEqual({ ok: true, id: "sub_abc123" });

    expect(
      vi.mocked(harness.dependencies.logger.error).mock.calls[0]?.[0],
    ).toContain("lead_z360_errored");
  });
});

import { afterEach, describe, it, expect, vi } from "vitest";

import {
  FORMS,
  FORM_IDS,
  isKnownFormId,
  PORTAL_API_BASE,
  portalSubmitUrl,
} from "@/config";
import { leadSchema, type LeadInput } from "@/lib/schema";
import { buildPortalPayload, submitToPortal } from "@/lib/portal";
import { buildTurnstileBody, verifyTurnstile } from "@/lib/turnstile";
import { buildZ360Payload, pushToZ360 } from "@/lib/z360";

const validLead: LeadInput = {
  form: "contact",
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "+1 555 0100",
  message: "I'd love to hear more about your services.",
  turnstileToken: "tok_123",
};

describe("leadSchema", () => {
  it("accepts a valid lead", () => {
    const result = leadSchema.safeParse(validLead);
    expect(result.success).toBe(true);
  });

  it("rejects a bad email", () => {
    const result = leadSchema.safeParse({
      ...validLead,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a too-short message", () => {
    const result = leadSchema.safeParse({ ...validLead, message: "hi" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing form id", () => {
    const result = leadSchema.safeParse({ ...validLead, form: "" });
    expect(result.success).toBe(false);
  });

  it("only SHAPE-checks the form id — membership is the server's job", () => {
    // Deliberate: this schema ships to the browser with the island, so it must
    // not import the FORMS registry (that would publish every form's portal
    // endpoint key in page source). An unknown id therefore parses here and is
    // rejected by `isKnownFormId` in the Action, before it can become a URL.
    const result = leadSchema.safeParse({ ...validLead, form: "not-a-form" });
    expect(result.success).toBe(true);
    expect(isKnownFormId("not-a-form")).toBe(false);
  });

  it("accepts an extra bag of per-form fields", () => {
    const result = leadSchema.safeParse({
      ...validLead,
      extra: { budget: "10k–25k", timeline: "Q4" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an extra bag with too many keys", () => {
    // The portal stores whatever it is sent, so this schema is the only thing
    // between a crafted POST and an unbounded row.
    const extra = Object.fromEntries(
      Array.from({ length: 26 }, (_value, index) => [`field${index}`, "x"]),
    );
    const result = leadSchema.safeParse({ ...validLead, extra });
    expect(result.success).toBe(false);
  });

  it("rejects an extra value that is too long", () => {
    const result = leadSchema.safeParse({
      ...validLead,
      extra: { notes: "x".repeat(2001) },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an extra key that is too long", () => {
    const result = leadSchema.safeParse({
      ...validLead,
      extra: { ["k".repeat(65)]: "value" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-string extra value", () => {
    const result = leadSchema.safeParse({
      ...validLead,
      extra: { budget: 25_000 },
    });
    expect(result.success).toBe(false);
  });
});

describe("portalSubmitUrl", () => {
  it("builds the submit endpoint for a form id", () => {
    // Derived from the registry rather than hardcoded, so a fork that changes
    // its endpoint keys still exercises the URL SHAPE, which is what breaks.
    const url = new URL(portalSubmitUrl("contact"));
    expect(url.origin).toBe(new URL(PORTAL_API_BASE).origin);
    expect(url.pathname).toBe(`/api/forms/${FORMS.contact.endpointKey}/submit`);
  });

  it("is driven by the PORTAL_API_BASE build-time variable", async () => {
    // Non-secret, build-time config: a staging build points at a staging
    // portal without editing code. The trailing slash is deliberate — a base
    // pasted with one must not produce "//api/forms/…", a different path the
    // portal would 404 on every submission.
    vi.stubEnv("PORTAL_API_BASE", "https://staging.portal.example/");
    vi.resetModules();
    const config = await import("@/config");

    expect(config.portalSubmitUrl("contact")).toBe(
      `https://staging.portal.example/api/forms/${config.FORMS.contact.endpointKey}/submit`,
    );

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe("TURNSTILE_SITE_KEY", () => {
  it("falls back to the Cloudflare test key when unset", async () => {
    // A fresh clone must render a working widget before anyone has provisioned
    // one, which is what makes `pnpm dev` useful out of the box.
    vi.resetModules();
    const { TURNSTILE_SITE_KEY } = await import("@/config.public");
    expect(TURNSTILE_SITE_KEY).toBe("1x00000000000000000000AA");
  });

  it("is driven by the PUBLIC_TURNSTILE_SITE_KEY build-time variable", async () => {
    vi.stubEnv("PUBLIC_TURNSTILE_SITE_KEY", "0x4AAAAAAAsiteKey");
    vi.resetModules();
    const { TURNSTILE_SITE_KEY } = await import("@/config.public");
    expect(TURNSTILE_SITE_KEY).toBe("0x4AAAAAAAsiteKey");

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("treats a blank value as unset rather than shipping an empty sitekey", async () => {
    // `PUBLIC_TURNSTILE_SITE_KEY=` in a .env file is the empty string, not
    // undefined. Taking it would render a broken widget on every page while
    // looking configured.
    vi.stubEnv("PUBLIC_TURNSTILE_SITE_KEY", "   ");
    vi.resetModules();
    const { TURNSTILE_SITE_KEY } = await import("@/config.public");
    expect(TURNSTILE_SITE_KEY).toBe("1x00000000000000000000AA");

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe("isKnownFormId", () => {
  it("accepts every id in the registry", () => {
    for (const id of FORM_IDS) {
      expect(isKnownFormId(id)).toBe(true);
    }
  });

  it("rejects an id that is not a form on this site", () => {
    expect(isKnownFormId("not-a-form")).toBe(false);
    expect(isKnownFormId("")).toBe(false);
  });

  it("rejects inherited Object properties", () => {
    // `in` would say true for all of these and then index FORMS into a
    // prototype method, resolving a hand-crafted POST to a nonsense endpoint
    // instead of rejecting it. `Object.hasOwn` is what makes them false.
    for (const key of ["toString", "constructor", "hasOwnProperty"]) {
      expect(isKnownFormId(key)).toBe(false);
    }
    expect(isKnownFormId("__proto__")).toBe(false);
  });
});

describe("buildPortalPayload", () => {
  it('carries the lead fields and sets source to "website"', () => {
    const payload = buildPortalPayload(validLead);
    expect(payload).toEqual({
      name: validLead.name,
      email: validLead.email,
      phone: validLead.phone,
      message: validLead.message,
      source: "website",
    });
  });

  it("never forwards the single-use Turnstile token", () => {
    // The site redeems the token with its own siteverify call; the portal runs
    // no challenge check, so forwarding it would be dead weight at best.
    const payload = buildPortalPayload(validLead);
    expect(payload).not.toHaveProperty("turnstileToken");
  });

  it("merges per-form fields from the extra bag", () => {
    // The portal stores the payload verbatim and auto-extracts the four known
    // fields, so a per-form field needs no portal-side registration.
    const payload = buildPortalPayload({
      ...validLead,
      extra: { budget: "10k–25k", timeline: "Q4" },
    });

    expect(payload.budget).toBe("10k–25k");
    expect(payload.timeline).toBe("Q4");
    expect(payload.email).toBe(validLead.email);
  });

  it("never lets an extra key overwrite a normalized field", () => {
    // Deliberately adversarial: the bag is whatever JSON the Action was
    // posted, so a crafted `extra` must not be able to displace the validated
    // email the portal extracts, notifies on, and replies to — nor the
    // `source` that marks where the lead came from.
    const payload = buildPortalPayload({
      ...validLead,
      extra: {
        email: "attacker@example.net",
        name: "Not Ada",
        phone: "+1 555 9999",
        message: "overwritten",
        source: "not-website",
      },
    });

    expect(payload.email).toBe(validLead.email);
    expect(payload.name).toBe(validLead.name);
    expect(payload.phone).toBe(validLead.phone);
    expect(payload.message).toBe(validLead.message);
    expect(payload.source).toBe("website");
  });

  it("drops a differently-cased extra key instead of shadowing the field", () => {
    // Overwriting the exact-case key is not enough: the portal matches its
    // dashboard fields case-insensitively and FIRST-WINS, so a surviving
    // `Email` would sit earlier in the payload than the validated `email` and
    // become the address staff read and reply to.
    const payload = buildPortalPayload({
      ...validLead,
      extra: {
        Email: "attacker@example.net",
        NAME: "Not Ada",
        Message: "overwritten",
        Source: "not-website",
      },
    });

    expect(payload).not.toHaveProperty("Email");
    expect(payload).not.toHaveProperty("NAME");
    expect(payload).not.toHaveProperty("Message");
    expect(payload).not.toHaveProperty("Source");
    expect(payload.email).toBe(validLead.email);
    expect(payload.name).toBe(validLead.name);
    expect(payload.message).toBe(validLead.message);
    expect(payload.source).toBe("website");
  });

  it("drops the portal's alias keys, even when the field is absent", () => {
    // `phone` is optional, so with the box left blank there is no `phone` key
    // to lose the race to — an alias the portal also accepts (`tel`,
    // `email_address`, `full_name`, …) would be extracted unopposed.
    const { phone: _phone, ...noPhoneLead } = validLead;
    const payload = buildPortalPayload({
      ...noPhoneLead,
      extra: {
        tel: "+1 555 9999",
        email_address: "attacker@example.net",
        full_name: "Not Ada",
        inquiry: "overwritten",
      },
    });

    expect(payload).not.toHaveProperty("tel");
    expect(payload).not.toHaveProperty("email_address");
    expect(payload).not.toHaveProperty("full_name");
    expect(payload).not.toHaveProperty("inquiry");
    expect(payload.phone).toBeUndefined();
  });
});

describe("buildTurnstileBody", () => {
  it("includes the token, secret and optional client IP", () => {
    const body = buildTurnstileBody(
      "turnstile-token",
      "turnstile-secret",
      "203.0.113.10",
    );

    expect(body.get("response")).toBe("turnstile-token");
    expect(body.get("secret")).toBe("turnstile-secret");
    expect(body.get("remoteip")).toBe("203.0.113.10");
  });
});

describe("verifyTurnstile", () => {
  // The site redeems the single-use token itself and the portal runs no
  // challenge check of its own, so this function is the entire bot boundary.
  // Every branch below must fail CLOSED: only an explicit `success: true` on a
  // 2xx JSON body is a passed challenge.
  function stubSiteverify(respond: () => Response | Promise<Response>) {
    const calls: { init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        calls.push({ init });
        return respond();
      }),
    );
    return calls;
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes a solved challenge and forwards the client IP", async () => {
    const calls = stubSiteverify(() => json({ success: true }));

    await expect(
      verifyTurnstile("tok_123", "turnstile-secret", "203.0.113.10"),
    ).resolves.toBe(true);

    const body = calls[0]?.init?.body as URLSearchParams;
    expect(body.get("response")).toBe("tok_123");
    expect(body.get("secret")).toBe("turnstile-secret");
    expect(body.get("remoteip")).toBe("203.0.113.10");
  });

  it("rejects a challenge Cloudflare reports as failed", async () => {
    stubSiteverify(() =>
      json({ success: false, "error-codes": ["invalid-input-response"] }),
    );

    await expect(verifyTurnstile("tok_123", "turnstile-secret")).resolves.toBe(
      false,
    );
  });

  it.each([
    ["a body with no success field", {}],
    ["a truthy non-boolean success", { success: "true" }],
    ["a success field that is not the literal true", { success: 1 }],
  ])("rejects a 2xx whose body is not a pass: %s", async (_label, body) => {
    // Anything short of `success === true` is a failed challenge — a truthy
    // stand-in must never be coerced into a pass.
    stubSiteverify(() => json(body));

    await expect(verifyTurnstile("tok_123", "turnstile-secret")).resolves.toBe(
      false,
    );
  });

  it("rejects a non-2xx status even when the body claims success", async () => {
    // Deliberately adversarial: pairing a failing status with a body that
    // would otherwise pass pins the status check independently of the body
    // check, so neither guard can be dropped without a test going red.
    stubSiteverify(() => json({ success: true }, 502));

    await expect(verifyTurnstile("tok_123", "turnstile-secret")).resolves.toBe(
      false,
    );
  });

  it("rejects a 2xx carrying a non-JSON body", async () => {
    // An interposed error or challenge page parses as neither pass nor fail.
    stubSiteverify(
      () =>
        new Response("<!doctype html><title>error</title>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
    );

    await expect(verifyTurnstile("tok_123", "turnstile-secret")).resolves.toBe(
      false,
    );
  });

  it("rejects when the call throws — a siteverify outage or timeout", async () => {
    // Failing open here would leave the form briefly unprotected; failing
    // closed only means visitors briefly cannot submit.
    stubSiteverify(() => {
      throw new Error("Network error");
    });

    await expect(verifyTurnstile("tok_123", "turnstile-secret")).resolves.toBe(
      false,
    );
  });
});

describe("buildZ360Payload", () => {
  it('sets source to "website"', () => {
    const payload = buildZ360Payload(validLead);
    expect(payload.source).toBe("website");
    expect(payload.email).toBe(validLead.email);
  });
});

describe("outbound call deadlines", () => {
  // `fetch` imposes no deadline of its own. An endpoint that accepts the
  // connection and then goes silent would stall the Action until the runtime
  // killed the invocation — skipping the pipeline's logging branches, and (for
  // the post-delivery Z360 push) turning a lead the portal already stored into
  // a visitor-facing error that invites a duplicate retry. Every outbound call
  // must therefore carry an abort signal.
  function captureFetchInit() {
    const captured: { init?: RequestInit } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        captured.init = init;
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    return captured;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bounds the portal submit", async () => {
    const captured = captureFetchInit();
    await submitToPortal("https://portal.example/submit", "pok_x", validLead);
    expect(captured.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("bounds the Turnstile siteverify call", async () => {
    const captured = captureFetchInit();
    await verifyTurnstile("tok_123", "turnstile-secret");
    expect(captured.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("bounds the best-effort Z360 push", async () => {
    const captured = captureFetchInit();
    await pushToZ360("https://z360.example/inquiries", "z360-token", validLead);
    expect(captured.init?.signal).toBeInstanceOf(AbortSignal);
  });
});

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { actions } from "astro:actions";
import { toast } from "sonner";

import { leadSchema, type LeadInput } from "@/lib/schema";
import { TURNSTILE_SITE_KEY } from "@/config.public";
// Type-only, so it is erased at compile time and creates NO bundle edge to
// `@/config` — which holds the FORMS registry's portal endpoint keys.
import type { FormId } from "@/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Toaster } from "@/components/ui/sonner";

const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js";

/** Mirrors the Action's own delivery-failure copy. */
const FALLBACK_ERROR = "We couldn't send your message. Please try again.";

/** Longest server message we will show a visitor verbatim. */
const MAX_TOAST_LENGTH = 160;

/**
 * Stable default for `extraFields`. A `= []` default parameter would allocate a
 * fresh array on every render, which is enough to defeat the memos below.
 */
const NO_EXTRA_FIELDS: LeadFormExtraField[] = [];

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      action?: string;
      callback: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    /** GTM's queue. Created by the container snippet in BaseLayout. */
    dataLayer?: unknown[];
  }
}

/** One additional, form-specific input, submitted inside the `extra` bag. */
export interface LeadFormExtraField {
  /**
   * The key this answer is stored under, both in the react-hook-form path
   * (`extra.<name>`) and in the payload the portal keeps verbatim. Use a plain
   * identifier — no dots, brackets or quotes, which react-hook-form would read
   * as a nested path (enforced below) — and keep it stable, because it is the
   * column a human reads in the portal.
   */
  name: string;
  /** Visible label, tied to the input (accessibility is non-negotiable). */
  label: string;
  /** Input type. Defaults to "text". */
  type?: "text" | "tel" | "email";
  /**
   * Require an answer. Enforced by extending the shared zod schema below, not
   * by the HTML `required` attribute — the form sets `noValidate`, so browser
   * validation never runs and an HTML-only rule would be decoration.
   */
  required?: boolean;
  placeholder?: string;
}

export interface LeadFormProps {
  /** Which form in the FORMS registry this island submits to. */
  formId: FormId;
  /** Optional heading rendered above the fields (the page still owns the h1). */
  heading?: string;
  /** Submit button copy. Defaults to "Send message". */
  submitLabel?: string;
  /** Label for the message textarea. Defaults to "Message". */
  messageLabel?: string;
  /** Extra inputs beyond name/email/phone/message. */
  extraFields?: LeadFormExtraField[];
}

/**
 * Inject the Turnstile script once (idempotent across islands / re-mounts).
 */
function loadTurnstileScript(): void {
  if (document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)) return;
  const script = document.createElement("script");
  script.src = TURNSTILE_SCRIPT_SRC;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

/**
 * The `form_submit_success` half of the shared dataLayer vocabulary — the
 * layout's delegated listener covers phone_click and cta_<name>, but only the
 * island knows the Action actually succeeded. Push to dataLayer, never
 * window.gtag: under a GTM-only setup it is undefined and the call vanishes
 * silently. Wrapped so a tracking failure can never break a real lead.
 *
 * The event NAME is unchanged so existing GTM triggers keep firing; `form_id`
 * is added because one site can now fire it from several forms, and a
 * conversion you cannot attribute to a form is barely a conversion.
 */
function trackFormSubmitSuccess(formId: FormId): void {
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: "form_submit_success", form_id: formId });
  } catch {
    /* analytics must never break the form */
  }
}

/**
 * The Action throws only short, visitor-safe copy. But a failure that never
 * reaches the Action — a Cloudflare 5xx, a rate-limit interstitial — still
 * arrives as an ActionError, and Astro fills its message with the raw response
 * body whenever that body is not JSON. Echoing it would toast an entire HTML
 * error page, so only pass through strings that still look like copy we wrote.
 */
function safeErrorMessage(message: string | undefined): string {
  const trimmed = message?.trim();
  if (!trimmed || trimmed.length > MAX_TOAST_LENGTH) return FALLBACK_ERROR;
  // Markup, or a serialized validation payload — never visitor-facing copy.
  if (/[<>{}]/.test(trimmed)) return FALLBACK_ERROR;
  return trimmed;
}

/**
 * The characters react-hook-form treats as PATH separators — it splits every
 * field name on this exact class before walking the values object.
 */
const RHF_PATH_CHARS = /[.[\]'"]/;

/**
 * Reject an `extraFields` name that react-hook-form would read as a nested
 * path, because the failure it causes is invisible.
 *
 * `extra.<name>` is a path, not a key. Give a field the name `budget.range`
 * and the default below lands at the flat key `extra["budget.range"]` while
 * typing writes `extra.budget.range` — leaving `extra` as
 * `{ "budget.range": "", budget: { range: "…" } }`. `leadSchema` types the bag
 * flat, so it rejects the nested object with an issue at `extra.budget`, a path
 * no rendered `<FormMessage />` is watching. `handleSubmit` then never reaches
 * `onSubmit`: no toast, no message, no request — the button just un-disables,
 * and the lead is gone. The docs have always said "a plain identifier", but a
 * rule nothing enforces is a rule that gets broken.
 *
 * Throwing is the point. The island is server-rendered at build time, so a bad
 * name fails `pnpm build` on the developer's machine instead of silently
 * eating submissions on the live site.
 */
function assertFlatExtraFieldNames(extraFields: LeadFormExtraField[]): void {
  for (const { name } of extraFields) {
    if (RHF_PATH_CHARS.test(name)) {
      throw new Error(
        `LeadForm: extraFields name ${JSON.stringify(name)} contains a ` +
          `react-hook-form path character (one of . [ ] ' "). Use a plain ` +
          `identifier — a name with one of these silently breaks submission.`,
      );
    }
  }
}

/**
 * Make required extra fields actually required.
 *
 * `leadSchema` types the bag as "strings in, strings out" — it cannot know
 * which keys a given form asks for. So the client resolver is the shared schema
 * plus a per-form refinement, with the issue reported at `extra.<name>` so
 * react-hook-form attaches it to the right input and `<FormMessage />` renders
 * it. The server keeps validating with the plain shared schema: presence of a
 * per-form field is a UX rule, not a "was this lead worth storing" rule, and
 * the portal is better off with a partially filled lead than none at all.
 */
function resolverSchemaFor(extraFields: LeadFormExtraField[]) {
  const required = extraFields.filter((field) => field.required);
  if (required.length === 0) return leadSchema;

  return leadSchema.superRefine((values, ctx) => {
    for (const field of required) {
      if (!values.extra?.[field.name]?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["extra", field.name],
          message: `Please fill in ${field.label.toLowerCase()}.`,
        });
      }
    }
  });
}

/**
 * The reusable lead-form island: the ONE form component every Zikra form is
 * built from. It renders the shared name/email/phone/message fields, any
 * per-form `extraFields`, and the Turnstile widget, then submits everything to
 * the single `submitLead` Astro Action tagged with `formId` so the server can
 * route it to the right portal form.
 *
 * Render it with an explicit `client:*` directive — it is the only JS a page
 * with a form ships.
 */
export default function LeadForm({
  formId,
  heading,
  submitLabel = "Send message",
  messageLabel = "Message",
  extraFields = NO_EXTRA_FIELDS,
}: LeadFormProps) {
  // Hook-free and fully determined by the props, so it is safe ahead of the
  // hooks below: it either throws on every render or on none of them.
  assertFlatExtraFieldNames(extraFields);

  const [submitted, setSubmitted] = useState(false);
  const [token, setToken] = useState("");
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  /**
   * Pairs this island's `<Toaster>` with the toasts it raises.
   *
   * sonner keeps ONE module-global toast store, and a `<Toaster>` with no `id`
   * renders every untargeted toast. Two islands on one page (say contact plus a
   * "book a demo" form in a dialog) share that single store through the deduped
   * `sonner` chunk, so an untargeted toast would paint twice and be announced
   * twice — a single delivery failure reading like two lost submissions. Tag
   * the Toaster and every `toast()` call with a per-instance id so each island
   * only ever renders its own. `useId()` rather than `formId`: two islands
   * could legitimately submit the same form.
   */
  const toasterId = useId();

  const resolver = useMemo(
    () => zodResolver(resolverSchemaFor(extraFields)),
    [extraFields],
  );

  // Left undefined when the form has no extra fields, so the payload a plain
  // contact form sends is exactly what it sent before the bag existed.
  const defaultExtra = useMemo(
    () =>
      extraFields.length > 0
        ? Object.fromEntries(extraFields.map((field) => [field.name, ""]))
        : undefined,
    [extraFields],
  );

  const form = useForm<LeadInput>({
    resolver,
    defaultValues: {
      form: formId,
      name: "",
      email: "",
      phone: "",
      message: "",
      turnstileToken: "",
      extra: defaultExtra,
    },
  });

  const setTurnstileToken = (value: string) => {
    setToken(value);
    form.setValue("turnstileToken", value, { shouldValidate: true });
  };

  const resetTurnstile = () => {
    setTurnstileToken("");
    window.turnstile?.reset(widgetIdRef.current ?? undefined);
  };

  useEffect(() => {
    loadTurnstileScript();

    let cancelled = false;
    const renderWidget = () => {
      if (cancelled || !window.turnstile || !widgetContainerRef.current) return;
      if (widgetIdRef.current !== null) return;
      widgetIdRef.current = window.turnstile.render(
        widgetContainerRef.current,
        {
          sitekey: TURNSTILE_SITE_KEY,
          // Names this widget in Turnstile's analytics (and comes back on the
          // siteverify response). It is the form id, so a site running several
          // forms off one sitekey can tell them apart. Turnstile allows up to
          // 32 characters of alphanumerics plus `_` and `-`, which every
          // sensible FORMS key already satisfies.
          action: formId,
          callback: (t) => setTurnstileToken(t),
          "error-callback": () => setTurnstileToken(""),
          "expired-callback": () => setTurnstileToken(""),
        },
      );
    };

    // The script loads async; poll briefly until window.turnstile is ready.
    const interval = window.setInterval(() => {
      if (window.turnstile) {
        renderWidget();
        window.clearInterval(interval);
      }
    }, 100);
    renderWidget();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const onSubmit = async (values: LeadInput) => {
    try {
      const { data, error } = await actions.submitLead(values);
      if (error || !data?.ok) {
        toast.error(safeErrorMessage(error?.message), { toasterId });
        resetTurnstile();
        return;
      }
      trackFormSubmitSuccess(formId);
      toast.success("Thanks — we'll be in touch shortly.", { toasterId });
      resetTurnstile();
      setSubmitted(true);
    } catch {
      // The call itself rejected rather than resolving to { error }: the
      // browser dropped the request mid-flight, or the response body was not
      // the payload Astro expects. react-hook-form rethrows out of
      // handleSubmit, and React ignores the promise an onSubmit prop returns,
      // so without this the rejection is silent — the button just flips back
      // from "Sending…" with no toast, and the portal never saw the lead.
      toast.error(FALLBACK_ERROR, { toasterId });
      resetTurnstile();
    }
  };

  const submitting = form.formState.isSubmitting;

  return (
    <>
      {/* Mounted here so the reusable form island is self-contained, scoped by
          `id` so a second island on the same page does not also render this
          one's toasts, and outside the branch below so it persists across the
          form → thank-you state change. */}
      <Toaster id={toasterId} richColors position="top-center" />
      {submitted ? (
        <div
          role="status"
          className="border-input rounded-lg border p-6 text-center"
        >
          <h2 className="text-lg font-semibold">Message sent</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Thanks for reaching out. We&apos;ve received your message and will
            get back to you soon.
          </p>
        </div>
      ) : (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid gap-6"
            noValidate
          >
            {heading ? (
              <h2 className="text-xl font-semibold tracking-tight">
                {heading}
              </h2>
            ) : null}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Phone{" "}
                    <span className="text-muted-foreground font-normal">
                      (optional)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Input type="tel" autoComplete="tel" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {extraFields.map((extraField) => (
              <FormField
                key={extraField.name}
                control={form.control}
                name={`extra.${extraField.name}` as const}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {extraField.label}
                      {extraField.required ? null : (
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          (optional)
                        </span>
                      )}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type={extraField.type ?? "text"}
                        placeholder={extraField.placeholder}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}

            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{messageLabel}</FormLabel>
                  <FormControl>
                    <Textarea rows={5} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div ref={widgetContainerRef} />

            {/* Disabled until the widget hands back a token: the Action fails
                closed on a missing one, so submitting early can only produce a
                spam rejection the visitor cannot act on. */}
            <Button type="submit" disabled={submitting || !token}>
              {submitting ? "Sending…" : submitLabel}
            </Button>
          </form>
        </Form>
      )}
    </>
  );
}

import { z } from "zod";

/**
 * Email validation via an explicit regex rather than zod's string `.email()`.
 * It is deterministic across every runtime and keeps the validation message
 * stable without depending on Zod's built-in email pattern.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Bounds for the `extra` bag. The portal stores whatever it is sent, so the
 * only thing standing between a crafted POST and an unbounded row is this
 * schema: the Action validates every submission with it before the pipeline
 * runs. Generous enough for any real form, small enough that the bag cannot be
 * used as free storage.
 */
const EXTRA_MAX_KEYS = 25;
const EXTRA_MAX_KEY_LENGTH = 64;
const EXTRA_MAX_VALUE_LENGTH = 2_000;

/**
 * The shared lead schema — the single source of truth for what a valid
 * submission looks like, for EVERY form on the site. Imported by BOTH the
 * client island (react-hook-form + zodResolver) and the server Astro Action,
 * so it MUST NOT import anything from "astro:*" (keeps it plain-Vitest
 * testable).
 *
 * It must also import nothing from `@/config`. That module holds the FORMS
 * registry — the portal endpoint keys — and this schema is bundled into the
 * browser with the island, so a `@/config` import here would publish those
 * keys in page source. See `config.public.ts`.
 */
export const leadSchema = z.object({
  /**
   * Which form in the FORMS registry this submission belongs to.
   *
   * Shape-checked here and membership-checked on the server (`isKnownFormId`
   * in the Action), rather than as a `z.enum` built from the registry: the enum
   * would have to be imported from `@/config`, dragging every form's portal
   * endpoint key into the client bundle. The island only ever sends an id it
   * was given as a prop, so the client gains nothing from the stricter check —
   * and the server, which is the side that matters, is strict either way.
   */
  form: z.string().min(1, "Missing form id.").max(64),
  name: z.string().min(2, "Please enter your name.").max(100),
  email: z
    .string()
    .min(1, "Please enter your email address.")
    .regex(EMAIL_RE, "Please enter a valid email address."),
  phone: z.string().optional(),
  message: z
    .string()
    .min(10, "Please add a little more detail (10+ characters).")
    .max(5000),
  /** The Cloudflare Turnstile response token, set by the widget callback. */
  turnstileToken: z.string().min(1, "Please complete the spam check."),
  /**
   * Form-specific fields, as a flat string bag. The portal stores the entire
   * payload verbatim and auto-extracts name/email/phone/message for its
   * dashboard, so a per-form field needs no portal-side registration — it just
   * rides along here and shows up on the submission.
   */
  extra: z
    .record(
      z.string(),
      z
        .string()
        .max(
          EXTRA_MAX_VALUE_LENGTH,
          `Please keep each answer under ${EXTRA_MAX_VALUE_LENGTH} characters.`,
        ),
    )
    .refine((bag) => Object.keys(bag).length <= EXTRA_MAX_KEYS, {
      message: `Too many extra fields (max ${EXTRA_MAX_KEYS}).`,
    })
    .refine(
      (bag) =>
        Object.keys(bag).every(
          (key) => key.length > 0 && key.length <= EXTRA_MAX_KEY_LENGTH,
        ),
      {
        message: `Extra field names must be 1–${EXTRA_MAX_KEY_LENGTH} characters.`,
      },
    )
    .optional(),
});

export type LeadInput = z.infer<typeof leadSchema>;

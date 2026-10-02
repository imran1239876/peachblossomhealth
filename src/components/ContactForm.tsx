import LeadForm from "@/components/LeadForm";

/**
 * The contact form — a thin preset over the reusable `LeadForm` island.
 *
 * It exists so pages, docs, and skills can keep saying `<ContactForm />` for
 * the one form every site starts with. Everything real lives in `LeadForm`:
 * to change how contact behaves, pass props here; to add a *second* form,
 * add it to the FORMS registry in `src/config.ts` and render `<LeadForm
 * formId="…" />` directly rather than cloning this file.
 */
export default function ContactForm() {
  return <LeadForm formId="contact" />;
}

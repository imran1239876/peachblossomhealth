/**
 * Practice details that the header, footer and homepage all repeat. Kept in
 * one place so a changed phone number or booking link is a one-line edit.
 * Structured-data fields (telephone, postal address) live in `SITE`.
 */
export const PRACTICE = {
  /** Elation booking page for the free Meet & Greet and all appointments. */
  bookingUrl: "https://app.elationemr.com/book/904893856284676",
  /** Hint Health self-serve membership sign-up. */
  enrollUrl: "https://peachblossomhealth.hint.com/signup",
  phone: { display: "302-618-4075", href: "tel:+13026184075" },
  fax: "302-360-1916",
  email: "info@peachblossomhealth.com",
  address: {
    line1: "121 Becks Woods Drive, Suite 203",
    line2: "Bear, DE 19701",
    mapsUrl:
      "https://maps.google.com/?q=121+Becks+Woods+Drive+Suite+203+Bear+DE+19701",
  },
  social: {
    facebook: "https://www.facebook.com/profile.php",
    instagram: "https://instagram.com/peachblossomhealth",
    tiktok: "https://www.tiktok.com/@peachblossomhealth",
  },
} as const;

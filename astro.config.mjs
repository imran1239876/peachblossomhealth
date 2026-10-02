import { defineConfig, sessionDrivers } from "astro/config";
import { fileURLToPath } from "node:url";

import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import partytown from "@astrojs/partytown";
import robotsTxt from "astro-robots-txt";
import tailwindcss from "@tailwindcss/vite";

import { SITE } from "./src/config";

// https://astro.build/config
export default defineConfig({
  site: SITE.url,

  // The Zikra stack does not use Astro sessions or Cloudflare KV. Declaring a
  // driver here stops the Cloudflare adapter from provisioning a default
  // KV-backed session store (which would require a `SESSION` KV binding).
  session: { driver: sessionDrivers.lruCache() },

  // Static-first: every page is prerendered to the edge CDN. The Cloudflare
  // adapter emits a Worker only for on-demand routes (the Astro Action
  // endpoint that powers the forms pipeline).
  output: "static",
  adapter: cloudflare({
    // Optimize local images at build time with Sharp (astro:assets).
    imageService: "compile",
  }),

  integrations: [
    react(),
    mdx(),
    sitemap(),
    // Partytown is for a BARE GA4 tag only (SITE.gaMeasurementId). A GTM
    // container (SITE.gtmId) stays on the main thread — container-managed tags
    // break inside a worker. See ANALYTICS-SEO.md.
    partytown({ config: { forward: ["dataLayer.push", "gtag"] } }),
    robotsTxt({ sitemap: true }),
  ],

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  },
});

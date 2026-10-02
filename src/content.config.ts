import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { SITE } from "@/config";

/**
 * The blog content collection. MDX files in src/content/blog/ are validated
 * against this schema at build time (Astro's glob loader). The zikra-blog-post
 * skill documents how to author a post correctly.
 */
const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: ({ image }) =>
    z
      .object({
        /** ~50–60 chars. Becomes the H1 and <title>. */
        title: z.string().min(1).max(70),
        /** Meta description, ~150–160 chars. */
        description: z.string().min(50).max(170),
        /** Publish date (drives ordering, sitemap, RSS). */
        pubDate: z.coerce.date(),
        /** Optional last-updated date. */
        updatedDate: z.coerce.date().optional(),
        /** Byline. Defaults to SITE.defaultAuthor. */
        author: z.string().default(SITE.defaultAuthor),
        /** Lowercase tags for tag pages + related posts. */
        tags: z.array(z.string()).default([]),
        /** Hero image, imported so astro:assets can optimize it. */
        image: image().optional(),
        /** Required alt text when `image` is set. */
        imageAlt: z.string().optional(),
        /** Hide from listings/sitemap/RSS while WIP. */
        draft: z.boolean().default(false),
        /** Canonical URL if the post is syndicated from elsewhere. */
        canonical: z.url().optional(),
      })
      .superRefine((data, ctx) => {
        if (data.image && !data.imageAlt?.trim()) {
          ctx.addIssue({
            code: "custom",
            path: ["imageAlt"],
            message: "imageAlt is required when image is set.",
          });
        }
      }),
});

export const collections = { blog };

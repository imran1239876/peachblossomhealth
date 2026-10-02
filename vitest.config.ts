import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests are pure (no astro:* virtual modules), so a plain Vitest config
// with the `@/*` alias is all we need — see tests/ and the zikra-form skill.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.{test,spec}.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});

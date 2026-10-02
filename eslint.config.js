import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      ".astro/",
      "node_modules/",
      ".wrangler/",
      ".agents/skills/",
      ".claude/skills/",
      "worker-configuration.d.ts",
    ],
  },

  // Base JS + TypeScript rules for .ts / .tsx.
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Allow intentionally-unused args/vars when prefixed with `_`.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // Ambient declaration files use empty interfaces to augment generated
  // platform types (e.g. the optional Cloudflare Z360 secret).
  {
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },

  // React islands: accessibility linting.
  {
    files: ["**/*.{jsx,tsx}"],
    ...jsxA11y.flatConfigs.recommended,
  },

  // Astro components (includes Astro's own a11y rules).
  ...astro.configs.recommended,
  ...astro.configs["jsx-a11y-recommended"],

  // Vendored shadcn/ui primitives — kept close to upstream, so relax the
  // rules that fight generated component code.
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "jsx-a11y/heading-has-content": "off",
    },
  },
);

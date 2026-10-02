# Changelog

Template releases follow semantic versioning. Forks should compare their last applied `vX.Y.Z`
tag with the latest release and use the `zikra-update` skill before adopting shared changes.

## 2.0.0 - 2026-07-14

### Breaking changes

- Upgrade the supported framework baseline from Astro 5 to Astro 7 and require Node.js 22+.
- Upgrade the Cloudflare adapter to v14 and change Wrangler's Worker entrypoint to
  `@astrojs/cloudflare/entrypoints/server`.
- Replace `context.locals.runtime.env` with generated bindings imported from
  `cloudflare:workers`.

### Improvements

- Add dependency update automation, security auditing, build artifact checks, and JavaScript
  budgets to CI.
- Add unit coverage for lead-pipeline ordering and failure behavior without changing the public
  `submitLead` Action contract.
- Document versioned template releases and preview-first updates for existing forks.

### Fork migration

- Preserve each fork's `src/config.ts`, `wrangler.jsonc`, `.dev.vars*`, content, assets, and
  custom pages while adopting the shared infrastructure changes.
- Run `pnpm cf-typegen` after resolving Wrangler configuration and complete the full green-CI
  gate before a non-production Cloudflare preview.

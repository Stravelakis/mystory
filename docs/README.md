# My Story — docs site

The site at https://docs.stravelakis.com/mystory/, built from the Stravelakis
docs theme (see `NOTICE` and `LICENSE` in this folder).

- `site.config.ts`: name, links, menu
- `src/docs/dev.md`, `plain.md`, `eli5.md`: the three reading levels, regenerated each release
- `src/pages/index.astro`: feature cards, the screenshot carousel, the walkthrough
- `public/screenshots/`: taken with `npx electron scripts/screenshots.cjs <url>` against a demo vault

```bash
npm ci
npm run dev
```

Deployed by `.github/workflows/deploy-docs.yml` at the repo root on every `v*` tag.

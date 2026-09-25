import { defineConfig } from 'astro/config';

// Update `site` + `base` per repo before deploying to GitHub Pages,
// e.g. site: 'https://dnd-world.github.io', base: '/your-repo-name'
export default defineConfig({
  site: 'https://stravelakis.github.io',
  base: '/mystory',
  outDir: './dist',
});

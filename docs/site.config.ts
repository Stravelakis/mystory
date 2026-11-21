// Per-repo config. Most projects only touch this file and src/docs/*.md.

interface SocialLink {
  kind: 'github' | 'linkedin';
  label: string;
  href: string;
}

export const siteConfig = {
  projectName: 'My Story',
  description:
    'A private, self-hosted journal. Speak or write in Greek or English; it keeps every word in plain files on your own machine, puts your life in order, and names what happened.',
  repoUrl: 'https://github.com/Stravelakis/mystory',
  // Path under /public including the base path, e.g. '/repo-name/favicon.svg'. Empty = no favicon tag.
  faviconHref: '/mystory/favicon.png',

  // What a link to the site shows when shared (Open Graph / Twitter cards).
  // The image is under /public, 1200x630; rebuild it with
  // npx electron scripts/social/render.cjs from the repo root.
  seoTitle: 'My Story: a private, self-hosted journal in Greek and English',
  socialImage: 'og-image.png',
  socialImageAlt: 'My Story: an art-deco journal on a pedestal, with the tagline "A private journal on your own machine."',
  locale: 'en_GB',

  // Left menu, top group. The "On this page" group below it is built from the
  // headings of the reading level on screen.
  nav: [
    { id: 'top', label: 'Overview' },
    { id: 'features', label: 'What it does' },
    { id: 'showcase', label: 'Screenshots' },
  ],

  // Buttons and chips in the hero.
  heroLinks: [
    { label: 'Download for Windows', href: 'https://github.com/Stravelakis/mystory/releases/latest', primary: true },
    { label: 'Source on GitHub', href: 'https://github.com/Stravelakis/mystory' },
    { label: 'What changed', href: 'https://github.com/Stravelakis/mystory/blob/HEAD/CHANGELOG.md' },
  ],
  heroPills: ['Plain files you own', 'No account', 'Greek and English', 'Local-only mode'],

  // The three cards under the hero. They switch the reading level.
  levelCards: [
    { id: 'dev', tag: 'Dev', title: 'How it is built', text: 'Architecture, the vault format, the model router, the consent gates, build, test and release.' },
    { id: 'plain', tag: 'English', title: 'How to use it', text: 'For people comfortable with tech who do not write code. Install, daily use, privacy, fixes.' },
    { id: 'eli5', tag: 'ELI5', title: 'Start from zero', text: 'Slow, calm and complete. Every word explained, every click spelled out, with what you should see.' },
  ],

  // First visit lands on English; a reader's saved choice still wins.
  defaultVernacular: 'plain',

  // Reading-level switch at the top of the sidebar. The ids are fixed (they
  // match src/docs/dev.md, plain.md, eli5.md); change labels only.
  vernaculars: [
    { id: 'dev', label: 'Dev' },
    { id: 'plain', label: 'English' },
    { id: 'eli5', label: 'ELI5' },
  ],

  playground: {
    // true only for JS/web projects, where running the code in the browser is real.
    enabled: false,
    starterCode: `// try it\nconsole.log("hello from the playground")`,
  },

  author: {
    name: 'Stravelakis',
    links: [
      { kind: 'github', label: 'GitHub', href: 'https://github.com/Stravelakis' },
      { kind: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/in/stravelakiscom/' },
    ] as SocialLink[],
  },
};

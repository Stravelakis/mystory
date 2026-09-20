/* =============================================================================
   REPAIR AND UPDATE

   Two things the standards require an installed app to be able to do to
   itself, from inside itself.

   Both obey the same rule, and it is the only rule that matters here: they
   may replace anything the installer put on disk, and they may not touch
   anything the person wrote. The vault and .env live in the user's data
   folder precisely so that this separation is structural rather than
   remembered — see electron/main.js.

   Repair checks the program's own files and reports what is missing.
   Update asks GitHub what the latest release is and compares it to what is
   running. Neither downloads and runs anything on its own: installing a new
   version opens the release page, because silently replacing the program that
   holds somebody's journal is not a thing to do without being asked.
   ========================================================================== */

import fs from 'fs/promises';
import path from 'path';

const REPO = 'Stravelakis/mystory';

export interface FileCheck {
  file: string;
  ok: boolean;
  bytes?: number;
}

export interface RepairReport {
  healthy: boolean;
  root: string;
  checks: FileCheck[];
  missing: string[];
  /** Plain-English next step, or null when there is nothing to do. */
  advice: string | null;
}

/** The files the app cannot run without. Data is deliberately absent from
 *  this list: a missing vault is an empty journal, not a broken install. */
const REQUIRED = [
  'dist/server.cjs',
  'dist/index.html',
  'package.json',
];

export async function repair(root = process.cwd()): Promise<RepairReport> {
  const checks: FileCheck[] = [];

  for (const rel of REQUIRED) {
    const full = path.join(root, rel);
    try {
      const stat = await fs.stat(full);
      checks.push({ file: rel, ok: stat.size > 0, bytes: stat.size });
    } catch {
      checks.push({ file: rel, ok: false });
    }
  }

  // The built client is a folder of hashed filenames, so it is checked for
  // contents rather than for a name that changes every build.
  try {
    const assets = await fs.readdir(path.join(root, 'dist', 'assets'));
    const js = assets.filter(f => f.endsWith('.js')).length;
    const css = assets.filter(f => f.endsWith('.css')).length;
    checks.push({ file: 'dist/assets (javascript)', ok: js > 0 });
    checks.push({ file: 'dist/assets (styles)', ok: css > 0 });
  } catch {
    checks.push({ file: 'dist/assets', ok: false });
  }

  const missing = checks.filter(c => !c.ok).map(c => c.file);

  return {
    healthy: missing.length === 0,
    root,
    checks,
    missing,
    advice: missing.length
      ? 'Some of the app\'s own files are missing or empty. Reinstalling from the latest release puts them back — your writing is kept in a separate folder and is not affected.'
      : null,
  };
}

export interface UpdateReport {
  current: string;
  latest: string | null;
  behind: boolean;
  url: string;
  notes?: string;
  error?: string;
}

/** Compares two SemVer strings. Prereleases (1.2.0-beta.1) sort below the
 *  release they lead to, which is what "am I behind?" should mean. */
function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => {
    const m = v.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
    if (!m) return null;
    return { nums: [+m[1], +m[2], +m[3]], pre: m[4] || '' };
  };
  const a = parse(latest);
  const b = parse(current);
  if (!a || !b) return false;

  for (let i = 0; i < 3; i++) {
    if (a.nums[i] !== b.nums[i]) return a.nums[i] > b.nums[i];
  }
  if (a.pre === b.pre) return false;
  if (!a.pre) return true; // a release beats the prerelease of the same version
  if (!b.pre) return false;
  return a.pre > b.pre;
}

export async function checkUpdate(current: string): Promise<UpdateReport> {
  const url = `https://github.com/${REPO}/releases/latest`;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'my-story' },
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 404) {
      return { current, latest: null, behind: false, url, error: 'No releases have been published yet.' };
    }
    if (!res.ok) {
      return { current, latest: null, behind: false, url, error: `GitHub answered ${res.status}.` };
    }

    const data: any = await res.json();
    const latest = String(data?.tag_name || '').replace(/^v/, '');
    if (!latest) {
      return { current, latest: null, behind: false, url, error: 'GitHub did not name a version.' };
    }

    return {
      current,
      latest,
      behind: isNewer(latest, current),
      url: data?.html_url || url,
      notes: typeof data?.body === 'string' ? data.body.slice(0, 2000) : undefined,
    };
  } catch (e: any) {
    return {
      current,
      latest: null,
      behind: false,
      url,
      error: `Could not reach GitHub: ${e?.message || e}`,
    };
  }
}

/* =============================================================================
   SESSIONS — what was said, written to disk while it is being said.

   The audio pieces already survive a crash (vault/audio/partial/). This is the
   same promise for the TEXT: the words on screen, and the interviewer's
   questions, are saved as markdown every few seconds, so a dead tab or a
   restarted server costs seconds, not a session.

     vault/sessions/<sid>.md
   ========================================================================== */

import fs from 'node:fs/promises';
import path from 'node:path';
import { VAULT_DIR, isValidSid } from './vault.ts';

const SESSIONS_DIR = path.join(VAULT_DIR, 'sessions');

export interface SessionNote {
  /** Seconds into the session. */
  at: number;
  kind: 'question' | 'suggestion' | 'topic';
  text: string;
}

export interface SessionLog {
  started: string;
  language: string;
  text: string;
  notes: SessionNote[];
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function renderSession(sid: string, log: SessionLog): string {
  const lines = [
    '---',
    `session: ${sid}`,
    `started: ${log.started}`,
    `updated: ${new Date().toISOString()}`,
    `language: ${log.language}`,
    '---',
    '',
    '## What I said',
    '',
    log.text.trim() || '_(nothing yet)_',
    '',
  ];
  if (log.notes.length) {
    lines.push('## The interviewer', '');
    for (const n of log.notes) {
      const label = n.kind === 'question' ? 'asked' : n.kind === 'suggestion' ? 'suggested' : 'I chose';
      lines.push(`- **${clock(n.at)}** ${label}: ${n.text.replace(/\n+/g, ' ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Replaces the session file. Atomic, so a crash mid-write keeps the last good copy. */
export async function saveSession(sid: string, log: SessionLog): Promise<void> {
  if (!isValidSid(sid)) throw new Error('Not a session id.');
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  const file = path.join(SESSIONS_DIR, `${sid}.md`);
  await fs.writeFile(`${file}.tmp`, renderSession(sid, log), 'utf8');
  await fs.rename(`${file}.tmp`, file);
}

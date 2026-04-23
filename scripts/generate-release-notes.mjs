#!/usr/bin/env node
/**
 * Auto-write GitHub Release notes for a Tokenly version.
 *
 * Triggered by `.github/workflows/release-notes.yml` on `release: published`.
 * Also runnable manually via workflow_dispatch for any past tag.
 *
 * Pipeline:
 *   1. Figure out the prior tag (git describe ... ^)
 *   2. Collect structured context: commit log, changed files, capped diff
 *   3. Send to Claude Sonnet 4.6 with a style guide + few-shot examples
 *   4. Parse "TITLE: …\n\n<body>" → `gh release edit`
 *
 * Env:
 *   RELEASE_TAG           (required, e.g. "v1.8.0")
 *   REPO                  (required, e.g. "tokenlyapp/tokenly")
 *   ANTHROPIC_API_KEY     (required)
 *   GH_TOKEN              (required — used by gh CLI)
 *   DRY_RUN=1             (optional — prints result, skips gh release edit)
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const tag = process.env.RELEASE_TAG;
const repo = process.env.REPO;
if (!tag || !repo) {
  console.error('[notes] RELEASE_TAG and REPO env vars are required');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[notes] ANTHROPIC_API_KEY secret is not set on the repo');
  process.exit(1);
}

const DRY_RUN = process.env.DRY_RUN === '1';

// Hard cap for the combined diff payload. Claude handles bigger, but past this
// point we're paying for tokens on noise (lockfile churn, vendored assets).
const DIFF_CHAR_CAP = 60_000;

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function safeSh(cmd, fallback = '') {
  try { return sh(cmd); } catch { return fallback; }
}

// --- Gather context ---------------------------------------------------------

// Prior tag (same repo, highest version below this one). If there is no prior
// tag (genuine first release) we get an empty string — Claude falls back to a
// "first release" frame.
const priorTag = safeSh(`git describe --tags --abbrev=0 ${tag}^ 2>/dev/null`);

const commits = priorTag
  ? safeSh(`git log --no-merges --pretty=format:'%h %s%n%b%n---END---' ${priorTag}..${tag}`)
  : safeSh(`git log --no-merges --pretty=format:'%h %s%n%b%n---END---' ${tag}`);

const changedFiles = priorTag
  ? safeSh(`git diff --name-status ${priorTag}..${tag}`)
  : '';

// Raw diff, prioritised so meaningful files come first and we cap near the end.
// We include *.md (release notes + docs often spell out the "why" cleaner
// than the code does), JSX, JS, edge functions, and package.json.
let diff = '';
if (priorTag) {
  const raw = safeSh(`git diff ${priorTag}..${tag} -- '*.md' '*.jsx' '*.js' '*.mjs' 'package.json'`);
  diff = raw.length > DIFF_CHAR_CAP
    ? raw.slice(0, DIFF_CHAR_CAP) + `\n\n[... diff truncated at ${DIFF_CHAR_CAP} chars ...]`
    : raw;
}

console.log(`[notes] ${priorTag || '(no prior tag)'} → ${tag}`);
console.log(`[notes] commits: ${(commits.match(/---END---/g) || []).length}`);
console.log(`[notes] diff bytes: ${diff.length}`);

// --- Prompt Claude ----------------------------------------------------------

const SYSTEM = `You write GitHub Release notes for **Tokenly**, a macOS menu-bar app that tracks AI token usage across Claude Code, Codex CLI, Gemini CLI, and the OpenAI / Anthropic / OpenRouter admin billing APIs. Tokenly is freemium: the three local CLIs are free; the admin APIs plus budget alerts unlock with a one-time $5.99 "Tokenly Max" activation.

# Voice — this is the most important thing

Write for **the person who just installed Tokenly**, not for your engineering team.

- **Lead with what the user gets**, not what the software does internally. "Tokenly is now free." beats "Freemium paywall launched." "A new tier unlocks the APIs." beats "Paywall is live."
- **Benefit-first bullets.** What changed *for them*, why it matters, what it feels like. Never describe the machinery.
- **Positive framing ONLY.** Never frame changes as defensive, protective, anti-fraud, anti-abuse, preventing misuse, catching bad actors, guarding against problems, etc. Users don't want to hear about problems — they want to hear what's better. Translate every change into a user benefit:
  - ❌ "Detects refunds and revokes access" → ✅ "Your plan state always reflects your current purchase"
  - ❌ "Clears stale data to prevent misleading numbers" → ✅ "Numbers always match your current plan — never out of sync"
  - ❌ "Rate limits prevent abuse" → ✅ (don't mention it)
  - ❌ "Validates input to avoid errors" → ✅ (don't mention it)
- **Positive framing for constraints too.** "Pay once. No subscription, no account, no upsells." beats "Requires activation."
- **Scope = user-visible optimizations and new capabilities.** If a change is purely internal (perf, security, resilience, stability, refactor), either skip it or translate the *outcome* into a user benefit. When in doubt, leave it out.
- **Big releases open with a short narrative headline** — one or two sentences before the first ## section, stating the release's theme in human terms. Minor/patch releases skip straight to ## What's new.

## Banned vocabulary in the customer-visible sections ("What's new", "Polish", the intro paragraph)

Never use these internal / engineering terms where a user will read them:

| ❌ Don't write      | ✅ Write instead                                         |
|---------------------|----------------------------------------------------------|
| paywall             | Tokenly Max                                              |
| locked behind       | part of Tokenly Max / unlocks with Max                   |
| session_id / cs_…   | activation code                                          |
| endpoint / handler / IPC / hook | (describe what the user sees instead)        |
| sheet / modal / dialog         | screen / view / (the name of the screen)      |
| fires / dispatches / emits     | runs / happens / appears                      |
| state / store                  | (describe the user-visible result)            |
| ship / shipped                 | (use past tense of the actual change)         |

"Under the hood" is the *only* section where these terms are acceptable — engineering-curious readers end up there and want the real names.

# Format (strict)

Return exactly this, nothing before or after:

TITLE: <version number> — <concise theme, ≤6 words>

<Optional one- or two-sentence narrative headline for major/minor releases with a story to tell. Omit for straight patch releases.>

## What's new
- **Big user-facing win**, described from the user's chair. Bold the specific thing that's different.
- Second biggest win, same pattern.
- Keep bullets to one sentence each unless a sub-bullet list genuinely helps.

## Polish (optional)
- Renames, label tweaks, small UX fixes that aren't headline features.
- Skip this section entirely if nothing fits.

## Under the hood (optional)
- Only include **novel user-visible infrastructure** users might want to know about (e.g. "pricing tables now refresh automatically", "releases install silently in the background"). Frame as what users get.
- **Never** include: version bumps, lockfile churn, merge commits, typo fixes, CI noise, linting, test-only changes, invisible refactors, security hardening, anti-abuse measures, refund handling, data validation, error handling, or anything defensive/protective in tone.
- Skip this section entirely if nothing fits. Most releases don't need it.

# Rules

- **Every claim must be traceable to the commits/diff.** Never invent features.
- Dollar amounts with digits need backslash escaping: \\$5.99, not $5.99. Don't over-escape anything else — angle brackets, asterisks, and dashes in plain prose are fine as-is.
- Headers are exactly \`## What's new\`, \`## Polish\`, \`## Under the hood\` — in that order, only the ones that apply.
- \`#NNN\` issue/PR numbers render as links automatically; copy them as written.

# Example — a real Tokenly release in the right voice

TITLE: 1.7.0 — Tokenly Max

## Tokenly is now free.

Download Tokenly and track every token from **Claude Code, Codex CLI, and Gemini CLI** without paying anything or creating an account.

## Tokenly Max — \\$5.99 one-time, lifetime

A new tier unlocks everything else:

- **OpenAI API** · live billed spend from the admin cost endpoint
- **Anthropic API** · live billed spend from the admin cost endpoint
- **OpenRouter** · live billed spend from the activity API
- **Daily budget alerts** — 50% / 80% / 100% thresholds per provider plus overall
- **Daily spend summary notification** at your chosen local time
- **Menu-bar token counter for API sources** (Free is local-tools only)
- **Every future API-side feature**

Pay once. No subscription, no account, no upsells.

## How activation works

- Purchase opens a Stripe checkout → after payment you land on a thank-you page with your **activation code** and an auto-downloading DMG.
- In Tokenly: **⚙ Settings → Unlock Tokenly Max → paste the code → Activate**.
- Refunded purchases can't activate — we verify live against Stripe every time.

## Max branding

- When Max is active, the main header shows the real Tokenly icon plus a gold **MAX** pill.
- Free users see a lock and an **Unlock Tokenly Max** button on the API provider cards and the API Keys / Budget alerts entries in Settings; tapping any of them opens the upgrade screen.

## Under the hood

- New \`license.json\` in \`~/Library/Application Support/Tokenly/\` persists activation state locally.
- New edge function at \`/api/license/verify\` does real-time Stripe session verification.
- New \`/api/download-free\` endpoint serves the DMG without payment — the old Stripe-gated download flow is retired.
- \`npm run dist:publish\` now auto-archives each signed DMG to \`~/Documents/Tokenly/versions/\` so prior binaries are always recoverable.`;

const userMessage = `Write the release notes for **${tag}**${priorTag ? ` (diff against ${priorTag})` : ' (first release)'}.

## Commits since ${priorTag || '(first release)'}

${commits || '(no commits found)'}

## Changed files

${changedFiles || '(no file-level diff)'}

## Code diff (capped)

${diff || '(no diff)'}
`;

console.log('[notes] calling Claude…');

const resp = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{ role: 'user', content: userMessage }],
  }),
});

if (!resp.ok) {
  const err = await resp.text();
  console.error(`[notes] Claude API ${resp.status}: ${err}`);
  process.exit(1);
}

const json = await resp.json();
const rawText = (json.content?.[0]?.text || '').trim();
if (!rawText) {
  console.error('[notes] Claude returned empty content');
  process.exit(1);
}

// --- Parse TITLE + body -----------------------------------------------------

const titleMatch = rawText.match(/^TITLE:\s*(.+)$/m);
if (!titleMatch) {
  console.error('[notes] Claude output missing TITLE line. Raw output:\n' + rawText);
  process.exit(1);
}
const title = titleMatch[1].trim();
const body = rawText.replace(/^TITLE:.*$\n*/m, '').trim();

console.log('[notes] title:', title);
console.log('[notes] body length:', body.length);

if (DRY_RUN) {
  console.log('\n---- DRY RUN · would update release ----');
  console.log('Tag:', tag);
  console.log('Title:', title);
  console.log('---- body ----');
  console.log(body);
  process.exit(0);
}

// --- Update the release -----------------------------------------------------

// Write body to a temp file so we don't have to shell-escape multi-line
// markdown with code fences, backticks, quotes, etc.
const tmpBody = path.join(process.env.RUNNER_TEMP || '/tmp', `release-notes-${tag}.md`);
await fs.writeFile(tmpBody, body);

const result = spawnSync(
  'gh',
  ['release', 'edit', tag, '--repo', repo, '--title', title, '--notes-file', tmpBody],
  { stdio: 'inherit', env: process.env }
);

if (result.status !== 0) {
  console.error(`[notes] gh release edit exited ${result.status}`);
  process.exit(result.status || 1);
}

console.log(`[notes] ${tag} updated successfully`);

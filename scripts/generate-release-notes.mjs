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

const SYSTEM = `You write GitHub Release notes for **Tokenly**, a macOS menu-bar app that tracks AI token usage across Claude Code, Codex CLI, Gemini CLI, and the OpenAI / Anthropic / OpenRouter admin billing APIs. Tokenly is freemium — the three local CLIs are free; the admin APIs plus budget alerts unlock with a one-time $5.99 "Tokenly Max" activation.

## Output format (strict)

Return exactly this shape, no preamble, no postamble:

TITLE: <version> — <concise theme, ≤6 words>

## What's new
- Bullet point about a user-visible change, **bold the specific thing**
- Each bullet starts with the feature/change, not with a verb like "Added"
- Lead with the biggest user-facing win first

## Polish (optional)
- Smaller tweaks: renames, label fixes, tiny UX polish
- Skip this section if there aren't real polish items

## Under the hood (optional)
- Only if there's a meaningful infrastructure change users should know about (e.g. new edge function, archive-on-build, auto-update wiring)
- NEVER mention routine commits like version bumps, lockfile updates, merge commits, linting, typo fixes, CI noise

## Rules
- Focus on what ships to users. Invisible refactors don't belong here.
- Don't invent features. If a change isn't clearly in the commits/diff, don't mention it.
- Match Tokenly's voice: punchy, specific, no corporate filler. "Tokenly is now free." not "We're excited to announce a new pricing model."
- Dollar signs need escaping in markdown when adjacent to digits: write \\$5.99 not $5.99.
- Headers are exactly "## What's new", "## Polish", "## Under the hood" — in that order, only include what applies.
- Reference \`#NNN\` issue/PR numbers exactly as they appear in commits; the page renders them as links.

## Example output for a previous release

TITLE: 1.6.0 — Sheet UX overhaul

## What's new
- **API Keys split into its own sheet.** Settings is now scannable: Icon appearance · Menu bar tokens · View current LLM token pricing · Set budget alerts · **API Keys →**.
- **New sheet chrome** across every bottom-sheet:
  - Subtle **chevron-down** at top-center to minimize (the old handle bar was decorative — this one actually clicks).
  - **Back arrow** (top-left) on Pricing / Budgets / API Keys returns you to Settings rather than dumping you back to the dashboard.
  - Sheets rise higher on screen (95% of popover height).
- **Budget inputs accept decimals down to \\$0.01** without losing keystrokes mid-typing.

## Polish
- "Appearance" → **Icon appearance**; "Budget alerts" → **Set budget alerts**; "View current pricing" → **View current LLM token pricing**.
- The pricing refresh button's spin animation was silently broken (wrong keyframe). It spins now, holds for at least 650ms on warm cache, and flashes green **Updated ✓** on success.`;

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

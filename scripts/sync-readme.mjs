#!/usr/bin/env node
/**
 * Auto-sync README.md to current project state.
 *
 * Triggered by .github/workflows/readme-sync.yml on pushes to main that touch
 * truth-source files (main.js, app/components/**, package.json, PROJECT.md,
 * scripts/**). Also runnable via workflow_dispatch and on release:published
 * so a new tag always reconciles the README.
 *
 * Pipeline:
 *   1. Load current README.md
 *   2. Load truth sources: package.json, PROJECT.md (§0 + architecture),
 *      recent commit log
 *   3. Ask Claude Sonnet to return either the full updated README or the
 *      sentinel string NO_CHANGES_NEEDED
 *   4. Diff; if identical to on-disk, exit 0 without committing
 *   5. Otherwise overwrite README.md — the workflow commits + pushes
 *
 * Env:
 *   ANTHROPIC_API_KEY     (required)
 *   REPO                  (optional, for log context, e.g. "tokenlyapp/tokenly")
 *   DRY_RUN=1             (optional — prints result, does not touch README.md)
 *   COMMIT_RANGE          (optional, e.g. "abc123..def456" to scope commit log)
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[readme-sync] ANTHROPIC_API_KEY is not set');
  process.exit(1);
}

const DRY_RUN = process.env.DRY_RUN === '1';
const DIFF_CHAR_CAP = 40_000;
const COMMIT_LOG_LINES = 40;

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

function safeSh(cmd, fallback = '') {
  try { return sh(cmd); } catch { return fallback; }
}

async function readIfExists(relPath) {
  try {
    return await fs.readFile(path.join(ROOT, relPath), 'utf8');
  } catch {
    return '';
  }
}

// --- Gather context ---------------------------------------------------------

const readmeCurrent = await readIfExists('README.md');
if (!readmeCurrent) {
  console.error('[readme-sync] README.md not found — nothing to sync');
  process.exit(1);
}

const packageJson = await readIfExists('package.json');
const pkg = packageJson ? JSON.parse(packageJson) : {};
const version = pkg.version || 'unknown';

// PROJECT.md is long; keep the opening state section + architecture section
// which are the bits most likely to conflict with the README.
const projectMd = await readIfExists('PROJECT.md');
const projectSummary = projectMd
  ? projectMd.split('\n').slice(0, 260).join('\n')
  : '';

const commitRange = process.env.COMMIT_RANGE || 'HEAD~40..HEAD';
const commitLog = safeSh(`git log --no-merges --pretty=format:'%h %s' ${commitRange}`)
  .split('\n')
  .slice(0, COMMIT_LOG_LINES)
  .join('\n');

// Paths that tend to change what the README should say.
const changedFiles = safeSh(
  `git diff --name-only ${commitRange} -- main.js preload.js app/ scripts/ package.json PROJECT.md`
);

console.log(`[readme-sync] version: ${version}`);
console.log(`[readme-sync] commit range: ${commitRange}`);
console.log(`[readme-sync] changed files (relevant):\n${changedFiles || '(none)'}`);

// --- Prompt Claude ----------------------------------------------------------

const SYSTEM = `You are the README-sync agent for **Tokenly**, a macOS menu-bar app that tracks AI token usage across Claude Code, Codex CLI, Gemini CLI, and the OpenAI / Anthropic / OpenRouter admin billing APIs.

Your job: keep \`README.md\` 100% accurate to the current state of the software, with minimum necessary edits. You are editing a hand-crafted document — preserve its voice, structure, and narrative. Do not restructure. Do not rewrite prose that is still accurate.

# What you have

- **Current README.md** — authoritative for structure, voice, and formatting style
- **package.json** — authoritative for the current version number and product metadata
- **PROJECT.md** — authoritative for architecture, file layout, and shipped feature state
- **Recent commit log** — signals what has changed lately
- **Changed files** — signals which parts of the README are most likely stale

# What to change (only if the README is wrong about it)

- **Version numbers** anywhere they appear (badges, copy, download links — though badges pull live from GitHub and rarely need hand-editing)
- **Feature lists** — if the README describes a feature that doesn't exist in the code, remove it. If code ships a feature the README omits, add it.
- **Tech stack** — Electron / React / dependency versions, if package.json changed
- **File paths and directory structure** — if project layout changed
- **Pricing & tier splits** — the Free vs. Max table must match the current pricing model
- **FAQ answers** — if the underlying facts changed

# What NOT to change

- The overall structure, section order, or headings
- Hand-crafted marketing prose (the tagline, hero pitch, positioning statement)
- The voice — warm, confident, indie. Never corporate.
- ASCII diagrams and mock-ups unless they are factually wrong
- Emojis (the current README uses none — keep it that way)
- External links (trytokenly.app, release URLs, support email) unless a file shows they changed

# Voice rules (same as release notes)

- Lead with what the user gets, not what the software does internally.
- **Positive framing only.** Never describe changes as defensive, protective, anti-fraud, anti-abuse, or protecting against problems. If a change is only describable defensively, leave it out of the README entirely.
- Never use these terms in customer-visible sections: "paywall" (use "Tokenly Max"), "locked behind", "session_id" (use "activation code"), "endpoint/handler/IPC/hook" (describe the user experience instead), "sheet/modal/dialog" (use "screen").
- Dollar amounts in prose: escape as \\$5.99 when inside markdown that would render it.

# Output format — STRICT

Return one of two things, nothing else:

1. If the current README is already accurate in every material respect, return literally:

\`\`\`
NO_CHANGES_NEEDED
\`\`\`

(Just that string, no other text. Trailing whitespace / whitespace-only edits do not count as material changes. A version number drift **does** count.)

2. Otherwise, return the **entire updated README.md** content — from the first character to the last — with no preamble, no trailing commentary, no code-fence wrapping. The file content itself. Your output will be written to \`README.md\` verbatim.

If you are uncertain whether a change is warranted, prefer NO_CHANGES_NEEDED.`;

const userMessage = `# Current package.json

\`\`\`json
${packageJson || '{}'}
\`\`\`

# Current PROJECT.md (truncated — first ~260 lines)

${projectSummary || '(no PROJECT.md)'}

# Recent commits (${commitRange})

${commitLog || '(none)'}

# Changed files in this range (README-relevant paths only)

${changedFiles || '(none)'}

# Current README.md

${readmeCurrent.length > DIFF_CHAR_CAP
    ? readmeCurrent.slice(0, DIFF_CHAR_CAP) + `\n\n[... truncated at ${DIFF_CHAR_CAP} chars ...]`
    : readmeCurrent}

---

Per your instructions, return either the literal string NO_CHANGES_NEEDED or the full updated README.md. No other output.`;

console.log('[readme-sync] calling Claude…');

const resp = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 16_000,
    system: SYSTEM,
    messages: [{ role: 'user', content: userMessage }],
  }),
});

if (!resp.ok) {
  const err = await resp.text();
  console.error(`[readme-sync] Claude API ${resp.status}: ${err}`);
  process.exit(1);
}

const json = await resp.json();
const rawText = (json.content?.[0]?.text || '').trim();
if (!rawText) {
  console.error('[readme-sync] Claude returned empty content');
  process.exit(1);
}

// --- Decide + write ---------------------------------------------------------

if (rawText === 'NO_CHANGES_NEEDED' || rawText.startsWith('NO_CHANGES_NEEDED')) {
  console.log('[readme-sync] NO_CHANGES_NEEDED — README is already accurate');
  process.exit(0);
}

// Strip accidental code-fence wrapping if the model added any.
let newReadme = rawText;
if (newReadme.startsWith('```markdown\n')) {
  newReadme = newReadme.slice('```markdown\n'.length);
  if (newReadme.endsWith('\n```')) newReadme = newReadme.slice(0, -4);
} else if (newReadme.startsWith('```\n')) {
  newReadme = newReadme.slice(4);
  if (newReadme.endsWith('\n```')) newReadme = newReadme.slice(0, -4);
}
newReadme = newReadme.trimEnd() + '\n';

// Sanity: a valid Tokenly README must start with the centered hero div.
if (!newReadme.startsWith('<div align="center">')) {
  console.error('[readme-sync] output does not start with the expected hero div — refusing to write.');
  console.error('First 200 chars of output:\n' + newReadme.slice(0, 200));
  process.exit(1);
}

// Normalise trailing newlines on both sides before comparing.
const normalizedOld = readmeCurrent.trimEnd() + '\n';
if (newReadme === normalizedOld) {
  console.log('[readme-sync] model returned identical content — no write');
  process.exit(0);
}

if (DRY_RUN) {
  console.log('\n---- DRY RUN · would rewrite README.md ----');
  console.log(`Old length: ${normalizedOld.length}  New length: ${newReadme.length}`);
  console.log('---- first 400 chars of proposed README ----');
  console.log(newReadme.slice(0, 400));
  process.exit(0);
}

await fs.writeFile(path.join(ROOT, 'README.md'), newReadme);
console.log(`[readme-sync] README.md updated (${normalizedOld.length} → ${newReadme.length} chars)`);

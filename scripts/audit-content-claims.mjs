#!/usr/bin/env node
/*
  Tokenly content-claim drift scan.

  Run from /opt/data/repos/tokenly or any directory:
    node /opt/data/repos/tokenly/scripts/audit-content-claims.mjs

  Optional env vars for CI/local overrides:
    TOKENLY_APP_REPO=/path/to/tokenly
    TOKENLY_SITE_REPO=/path/to/tokenly-site
    TOKENLY_LAUNCH_REPO=/path/to/tokenly-launch

  It scans the app repo, marketing-site repo, and launch-docs repo for high-risk
  Tokenly product claims that often drift: versions, pricing, tier names,
  Claude limit wording, privacy claims, Electron/native wording, and stale known
  phrases.
*/

import fs from 'fs';
import path from 'path';

const roots = [
  ['app', process.env.TOKENLY_APP_REPO || '/opt/data/repos/tokenly'],
  ['site', process.env.TOKENLY_SITE_REPO || '/opt/data/repos/tokenly-site'],
  ['launch', process.env.TOKENLY_LAUNCH_REPO || '/opt/data/repos/tokenly-launch'],
];

const skipDirs = new Set(['.git', 'node_modules', 'dist', 'build', '.cache', '.next', 'venv', '.venv']);
const extensions = new Set(['.md', '.html', '.js', '.jsx', '.json', '.toml', '.xml', '.txt', '.yml', '.yaml']);

const checks = [
  ['version', /\b(?:version|v)\s*[:=]?\s*`?([0-9]+\.[0-9]+\.[0-9]+)/gi],
  ['price', /\$\d+(?:\.\d{2})?/g],
  ['tier', /Tokenly Max \+ AI|Max \+ AI|Tokenly Max|Tokenly Free|Free tier|paid plan|paid tier/gi],
  ['source', /Claude Code|Claude Desktop|Codex CLI|Codex Desktop|Gemini CLI|ChatGPT Desktop|Cursor|Windsurf|Antigravity|Perplexity|OpenAI API|Anthropic API|OpenRouter/gi],
  ['privacy', /no account|no backend|no telemetry|safeStorage|Keychain|keys stay|never leave|never prox(?:y|ies)|does not proxy/gi],
  ['native-electron', /native macOS|Mac-native|Electron 33|Electron-based|Electron|universal binary|macOS 13/gi],
  ['stale-claude-limit', /three independent windows|7-day rolling|weekly absolute|does not tell you which limit|won't know which one tripped|5h \/ 7d \/ weekly cap/gi],
  ['known-stale-app-copy', /no built-in AI assistant|Current shipped version:\*\* `2\.0\.1`|v1\.8\.1 freemium-native/gi],
  ['public-native-copy', /native macOS|Mac-native/gi],
];

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!skipDirs.has(ent.name)) walk(p, out);
    } else if (ent.isFile()) {
      const ext = path.extname(ent.name).toLowerCase();
      if (extensions.has(ext) || ent.name === 'LICENSE') out.push(p);
    }
  }
  return out;
}

function lineNumber(text, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

function isSuppressed(kind, label, rel, snippet) {
  const correctiveDocs = new Set(['docs/SOURCE_OF_TRUTH.md', 'docs/CONTENT_MAINTENANCE_PLAYBOOK.md']);
  if (label === 'app' && correctiveDocs.has(rel)) {
    if (kind === 'known-stale-app-copy') return true;
    if (kind === 'public-native-copy') return true;
    if (kind === 'stale-claude-limit') return true;
  }

  // Code comments / technical implementation notes may legitimately say native macOS
  // when describing OS notifications/dialogs, not marketing positioning.
  if (kind === 'public-native-copy' && label === 'app' && /^(main\.js|PROJECT\.md)$/.test(rel)) return true;

  // Channel persona docs may discuss what an audience values; that is not public copy.
  if (kind === 'public-native-copy' && label === 'launch' && rel.startsWith('_hermes/')) return true;

  // Corrective phrasing is allowed when it explicitly says not to use the stale model.
  if (kind === 'stale-claude-limit' && /safe framing is not|Avoid claiming|unless verified|not as an asserted claim/i.test(snippet)) return true;

  return false;
}

const records = [];
const missingRoots = [];
for (const [label, root] of roots) {
  if (!fs.existsSync(root)) {
    missingRoots.push({ label, root });
    continue;
  }
  for (const file of walk(root)) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const [kind, re] of checks) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        const rel = path.relative(root, file);
        const start = Math.max(0, m.index - 100);
        const end = Math.min(text.length, m.index + m[0].length + 140);
        const snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
        if (isSuppressed(kind, label, rel, snippet)) continue;
        records.push({ repo: label, file, line: lineNumber(text, m.index), kind, match: m[0], snippet });
      }
    }
  }
}

const counts = new Map();
for (const r of records) counts.set(r.kind, (counts.get(r.kind) || 0) + 1);

console.log('Tokenly content-claim drift scan');
console.log('Roots:');
for (const [label, root] of roots) console.log(`- ${label}: ${root}${fs.existsSync(root) ? '' : ' (missing)'}`);
if (missingRoots.length) {
  console.log('\nMissing roots:');
  for (const r of missingRoots) console.log(`- ${r.label}: ${r.root}`);
}
console.log('\nCounts:');
for (const [kind, count] of [...counts.entries()].sort()) console.log(`- ${kind}: ${count}`);

function printSection(title, filter) {
  const rows = records.filter(filter);
  console.log(`\n${title}: ${rows.length}`);
  for (const r of rows.slice(0, 80)) {
    console.log(`${r.repo} ${path.relative(roots.find(([l]) => l === r.repo)[1], r.file)}:${r.line} [${r.match}] ${r.snippet}`);
  }
  if (rows.length > 80) console.log(`... ${rows.length - 80} more`);
}

printSection('Known stale / must-review claims', r => r.kind === 'known-stale-app-copy');
printSection('Public native wording to fix', r => r.kind === 'public-native-copy');
printSection('Claude-limit phrases to inspect', r => r.kind === 'stale-claude-limit');
printSection('Version claims', r => r.kind === 'version');
printSection('Native/Electron wording', r => r.kind === 'native-electron');

const outPath = process.env.TOKENLY_AUDIT_REPORT || '/tmp/tokenly_content_claim_scan.json';
fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), roots, missingRoots, records }, null, 2));
console.log(`\nFull JSON written to ${outPath}`);

const failureRows = records.filter(r =>
  r.kind === 'known-stale-app-copy' ||
  r.kind === 'public-native-copy' ||
  r.kind === 'stale-claude-limit'
);
if (failureRows.length > 0) {
  console.log(`\nFAIL: ${failureRows.length} stale or policy-violating claim(s) found. Review/fix before publishing.`);
  process.exitCode = 1;
}

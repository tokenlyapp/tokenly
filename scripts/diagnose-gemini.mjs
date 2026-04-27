#!/usr/bin/env node
// Diagnose a Google AI Studio (Gemini) API key end-to-end.
//
// Usage:
//   GEMINI_KEY=AIza... node scripts/diagnose-gemini.mjs
//   (or just `node scripts/diagnose-gemini.mjs AIza...`)
//
// Walks through the same calls Tokenly makes:
//   1. ListModels  — confirms the key is valid + which models it can call.
//   2. generateContent (single-turn) — confirms basic prompt → reply works.
//   3. streamGenerateContent (multi-turn) — confirms the streaming SSE path
//      Tokenly uses, with a 3-message history, succeeds.
// Reports the failure (status code + body) at the first step that breaks.

const KEY = process.argv[2] || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY;
if (!KEY) {
  console.error('No key provided. Pass as arg or set GEMINI_KEY env var.');
  process.exit(2);
}

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const ANSI = { red: (s) => `\x1b[31m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m` };

async function step(label, fn) {
  process.stdout.write(`${ANSI.bold(label)} ... `);
  try {
    const out = await fn();
    console.log(ANSI.green('ok'));
    return out;
  } catch (err) {
    console.log(ANSI.red('FAIL'));
    console.error(ANSI.red(String(err.message || err)));
    process.exit(1);
  }
}

// ---- 1. ListModels ----------------------------------------------------------
const models = await step('1. ListModels', async () => {
  const res = await fetch(`${BASE}/models?key=${encodeURIComponent(KEY)}&pageSize=200`);
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`);
  let j;
  try { j = JSON.parse(txt); } catch { throw new Error(`Non-JSON response: ${txt.slice(0, 200)}`); }
  if (!Array.isArray(j.models)) throw new Error(`Unexpected response shape: ${txt.slice(0, 200)}`);
  return j.models;
});
const chatable = models.filter((m) => {
  const id = String(m.name || '').replace(/^models\//, '');
  const methods = m.supportedGenerationMethods || [];
  if (!id.startsWith('gemini-')) return false;
  if (!methods.includes('generateContent')) return false;
  if (!methods.includes('streamGenerateContent')) return false;
  if (/embedding|aqa|imagen|tuning/i.test(id)) return false;
  if (id === 'gemini-pro' || id === 'gemini-pro-vision') return false;
  if (/^gemini-1\.0-/.test(id)) return false;
  return true;
});
console.log(ANSI.dim(`   ${models.length} total models, ${chatable.length} chat-capable after Tokenly's filter`));
if (!chatable.length) {
  console.error(ANSI.red('No chat-capable Gemini models exposed to this key. Check the key is from AI Studio (https://aistudio.google.com/apikey), not a service-account key, and that the project has the Generative Language API enabled.'));
  process.exit(1);
}
console.log(ANSI.dim('   First few chat-capable models:'));
for (const m of chatable.slice(0, 6)) {
  const id = m.name.replace(/^models\//, '');
  console.log(ANSI.dim(`     ${id}  (${(m.displayName || '').trim()})`));
}

// Pick the first chat-capable model for the live calls.
const TEST_MODEL = chatable[0].name.replace(/^models\//, '');
console.log(ANSI.dim(`   → using ${TEST_MODEL} for live calls below`));

// ---- 2. generateContent (single turn) ---------------------------------------
await step(`2. generateContent on ${TEST_MODEL}`, async () => {
  const res = await fetch(`${BASE}/models/${encodeURIComponent(TEST_MODEL)}:generateContent?key=${encodeURIComponent(KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: pong' }] }],
    }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 600)}`);
  const j = JSON.parse(txt);
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) {
    throw new Error(`Empty response. finishReason=${j.candidates?.[0]?.finishReason} body=${txt.slice(0, 400)}`);
  }
  console.log(ANSI.dim(`   reply: ${text.trim().slice(0, 120)}`));
});

// ---- 3. streamGenerateContent (multi-turn) ---------------------------------
await step(`3. streamGenerateContent on ${TEST_MODEL} (multi-turn, SSE)`, async () => {
  const res = await fetch(`${BASE}/models/${encodeURIComponent(TEST_MODEL)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        { role: 'user',  parts: [{ text: 'Pick a number 1-10.' }] },
        { role: 'model', parts: [{ text: '7' }] },
        { role: 'user',  parts: [{ text: 'Add 3 and reply with just the digits.' }] },
      ],
      systemInstruction: { parts: [{ text: 'Respond as briefly as possible.' }] },
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 600)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let collected = '';
  let finishReason = '';
  let errorMsg = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const events = buf.split('\n\n');
    buf = events.pop() || '';
    for (const ev of events) {
      const dataLine = ev.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      const payload = dataLine.slice(5).trim();
      try {
        const j = JSON.parse(payload);
        if (j.error?.message) errorMsg = j.error.message;
        const cand = j.candidates?.[0];
        const parts = cand?.content?.parts;
        if (parts) for (const p of parts) if (p.text) collected += p.text;
        if (cand?.finishReason) finishReason = cand.finishReason;
      } catch {}
    }
  }
  if (errorMsg) throw new Error(`Stream error: ${errorMsg}`);
  if (!collected) throw new Error(`Empty stream. finishReason=${finishReason || 'none'}`);
  console.log(ANSI.dim(`   reply: ${collected.trim().slice(0, 120)}`));
});

console.log('');
console.log(ANSI.green('All three steps passed. The key is healthy and supports the calls Tokenly makes.'));

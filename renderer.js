const PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    abbr: 'AI',
    keyHelp: 'Use an Admin API key (starts with <code>sk-admin-</code>) from platform.openai.com → Organization → Admin keys. Regular sk- keys cannot read usage.',
    keyLink: 'https://platform.openai.com/settings/organization/admin-keys',
    keyPlaceholder: 'sk-admin-...',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    abbr: 'AN',
    keyHelp: 'Use an Admin API key from console.anthropic.com → Settings → Admin Keys. Required for usage + cost reports.',
    keyLink: 'https://console.anthropic.com/settings/admin-keys',
    keyPlaceholder: 'sk-ant-admin...',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    abbr: 'PX',
    keyHelp: 'Paste a key from perplexity.ai/settings/api. Perplexity does not publish a per-key usage API — this validates the key and links you to the dashboard.',
    keyLink: 'https://www.perplexity.ai/settings/api',
    keyPlaceholder: 'pplx-...',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    abbr: 'GE',
    keyHelp: 'Paste an AI Studio key from aistudio.google.com/apikey. Token-level usage is only exposed via Google Cloud Billing.',
    keyLink: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza...',
  },
];

const state = {
  days: 30,
  expanded: { openai: true, anthropic: true, perplexity: false, gemini: false },
  data: {},
  meta: {},
};

const $ = (sel) => document.querySelector(sel);
const main = $('#main');

function fmt(n) {
  if (n == null) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}
function fmtMoney(n) {
  if (n == null) return '—';
  if (n < 0.01 && n > 0) return '<$0.01';
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderShell() {
  main.innerHTML = PROVIDERS.map((p) => `
    <div class="provider-card" data-provider="${p.id}">
      <div class="provider-head" data-action="toggle">
        <div class="provider-left">
          <div class="provider-badge ${p.id}">${p.abbr}</div>
          <div>
            <div class="provider-name">${p.name}</div>
            <div class="provider-sub" data-sub>—</div>
          </div>
        </div>
        <div class="provider-right">
          <div>
            <div class="provider-total" data-total>—</div>
            <div class="provider-total-sub" data-totalsub></div>
          </div>
          <div class="status-dot" data-dot></div>
        </div>
      </div>
      <div class="provider-body" data-body style="display:${state.expanded[p.id] ? 'block' : 'none'}">
        <div class="empty">Loading…</div>
      </div>
    </div>
  `).join('');

  main.querySelectorAll('.provider-head').forEach((el) => {
    el.addEventListener('click', () => {
      const card = el.closest('.provider-card');
      const id = card.dataset.provider;
      state.expanded[id] = !state.expanded[id];
      card.querySelector('[data-body]').style.display = state.expanded[id] ? 'block' : 'none';
    });
  });
}

function renderCard(p) {
  const card = main.querySelector(`[data-provider="${p.id}"]`);
  if (!card) return;
  const sub = card.querySelector('[data-sub]');
  const total = card.querySelector('[data-total]');
  const totalSub = card.querySelector('[data-totalsub]');
  const dot = card.querySelector('[data-dot]');
  const body = card.querySelector('[data-body]');
  const d = state.data[p.id];
  const meta = state.meta[p.id] || {};

  if (!meta.present) {
    dot.className = 'status-dot';
    sub.textContent = 'No key';
    total.textContent = '—';
    totalSub.textContent = '';
    body.innerHTML = `<div class="empty">
      No API key set.<br/>
      <span class="cta" data-action="open-settings">Add ${p.name} Key</span>
    </div>`;
    body.querySelector('[data-action="open-settings"]').addEventListener('click', openSheet);
    return;
  }

  if (!d) {
    sub.textContent = `•••• ${meta.tail || ''}`;
    body.innerHTML = `<div class="empty"><div class="skeleton" style="width:80%;margin:6px auto"></div><div class="skeleton" style="width:60%;margin:6px auto"></div></div>`;
    return;
  }

  if (d.error) {
    dot.className = 'status-dot err';
    sub.textContent = 'Error';
    total.textContent = '—';
    body.innerHTML = `<div class="empty" style="color:var(--red)">${escapeHtml(d.error)}</div>`;
    return;
  }

  dot.className = 'status-dot ok';
  sub.textContent = `•••• ${meta.tail || ''}`;
  const t = d.totals;
  if (t) {
    total.textContent = fmtMoney(t.cost);
    const tokens = (t.input || 0) + (t.output || 0);
    totalSub.textContent = `${fmt(tokens)} tokens`;
  } else {
    total.textContent = 'Key OK';
    totalSub.textContent = '';
  }

  if (!t) {
    body.innerHTML = `<div class="empty">${escapeHtml(d.note || 'No usage data available.')}${d.link ? `<br/><a data-link="${d.link}">Open dashboard →</a>` : ''}</div>`;
    const a = body.querySelector('[data-link]');
    if (a) a.addEventListener('click', () => window.api.openExternal(a.dataset.link));
    return;
  }

  const statsHtml = p.id === 'anthropic'
    ? `<div class="mini-stats">
        <div class="mini-stat"><div class="mini-stat-label">Input</div><div class="mini-stat-value">${fmt(t.input)}</div></div>
        <div class="mini-stat"><div class="mini-stat-label">Output</div><div class="mini-stat-value">${fmt(t.output)}</div></div>
        <div class="mini-stat"><div class="mini-stat-label">Cache R</div><div class="mini-stat-value">${fmt(t.cache_read)}</div></div>
      </div>`
    : `<div class="mini-stats">
        <div class="mini-stat"><div class="mini-stat-label">Input</div><div class="mini-stat-value">${fmt(t.input)}</div></div>
        <div class="mini-stat"><div class="mini-stat-label">Output</div><div class="mini-stat-value">${fmt(t.output)}</div></div>
        <div class="mini-stat"><div class="mini-stat-label">Requests</div><div class="mini-stat-value">${fmt(t.requests)}</div></div>
      </div>`;

  const models = (d.models || []).slice(0, 12);
  const rowsHtml = models.length
    ? models.map((m) => {
        const tokens = (m.input || 0) + (m.output || 0);
        const meta = p.id === 'anthropic'
          ? `in ${fmt(m.input)} · out ${fmt(m.output)}${m.cache_read ? ' · cache ' + fmt(m.cache_read) : ''}`
          : `in ${fmt(m.input)} · out ${fmt(m.output)} · ${fmt(m.requests)} req`;
        return `<div class="model-row">
          <div style="min-width:0">
            <div class="model-name">${escapeHtml(m.model)}</div>
            <div class="model-meta">${meta}</div>
          </div>
          <div class="model-right">
            <div class="model-tokens">${fmt(tokens)}</div>
            ${m.cost ? `<div class="model-cost">${fmtMoney(m.cost)}</div>` : ''}
          </div>
        </div>`;
      }).join('')
    : `<div class="empty">No usage in this window.</div>`;

  body.innerHTML = statsHtml + rowsHtml;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadMeta() {
  state.meta = await window.api.getKeyMeta();
}

async function refreshAll() {
  const btn = $('#refreshBtn');
  btn.classList.add('spin');
  await loadMeta();
  PROVIDERS.forEach(renderCard);
  await Promise.all(PROVIDERS.map(async (p) => {
    if (!state.meta[p.id]?.present) { state.data[p.id] = null; return; }
    state.data[p.id] = null;
    renderCard(p);
    const res = await window.api.fetchUsage(p.id, state.days);
    state.data[p.id] = res.ok ? res.data : { error: res.error };
    renderCard(p);
  }));
  btn.classList.remove('spin');
}

// Settings sheet
function openSheet() {
  $('#sheetBackdrop').classList.add('open');
  $('#sheet').classList.add('open');
  renderKeys();
}
function closeSheet() {
  $('#sheetBackdrop').classList.remove('open');
  $('#sheet').classList.remove('open');
}

async function renderKeys() {
  await loadMeta();
  const list = $('#keyList');
  list.innerHTML = PROVIDERS.map((p) => {
    const m = state.meta[p.id] || {};
    return `
      <div class="key-row" data-provider="${p.id}">
        <div class="key-row-head">
          <div class="key-row-title">
            <div class="provider-badge ${p.id}" style="width:20px;height:20px;font-size:9px;border-radius:5px">${p.abbr}</div>
            ${p.name}
          </div>
          ${m.present ? `<div class="key-row-saved">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            Saved ••••${escapeHtml(m.tail || '')}
          </div>` : ''}
        </div>
        <div class="key-row-help">${p.keyHelp} <a data-link="${p.keyLink}">Get key →</a></div>
        <div class="key-input-wrap">
          <input type="text" class="key-input" placeholder="${p.keyPlaceholder}" data-input autocomplete="off" spellcheck="false" />
          <button class="toggle-vis" data-toggle title="Show/hide">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="key-btn" data-save>Save</button>
          ${m.present ? `<button class="key-btn danger" data-remove>Remove</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-link]').forEach((a) => {
    a.addEventListener('click', () => window.api.openExternal(a.dataset.link));
  });
  list.querySelectorAll('.key-row').forEach((row) => {
    const id = row.dataset.provider;
    const input = row.querySelector('[data-input]');
    row.querySelector('[data-toggle]').addEventListener('click', () => {
      input.classList.toggle('show');
    });
    row.querySelector('[data-save]').addEventListener('click', async () => {
      const v = input.value.trim();
      if (!v) return;
      await window.api.setKey(id, v);
      input.value = '';
      await refreshAll();
      renderKeys();
    });
    const rm = row.querySelector('[data-remove]');
    if (rm) rm.addEventListener('click', async () => {
      await window.api.setKey(id, '');
      await refreshAll();
      renderKeys();
    });
  });
}

$('#settingsBtn').addEventListener('click', openSheet);
$('#sheetClose').addEventListener('click', closeSheet);
$('#sheetBackdrop').addEventListener('click', closeSheet);
$('#refreshBtn').addEventListener('click', refreshAll);
$('#rangeSelect').addEventListener('change', (e) => {
  state.days = parseInt(e.target.value, 10);
  const label = { 1: 'Last 24 hours', 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days' }[state.days];
  $('#rangeLabel').textContent = label;
  refreshAll();
});

(async function init() {
  renderShell();
  await refreshAll();
  setInterval(refreshAll, 60_000);
})();

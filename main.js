const { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, safeStorage, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');
const { autoUpdater } = require('electron-updater');

process.on('uncaughtException', (err) => { console.error('[uncaughtException]', err && err.stack || err); });
process.on('unhandledRejection', (r) => { console.error('[unhandledRejection]', r); });

const STORE_PATH = () => path.join(app.getPath('userData'), 'keys.enc');

function loadKeys() {
  try {
    if (!fs.existsSync(STORE_PATH())) return {};
    const buf = fs.readFileSync(STORE_PATH());
    if (!safeStorage.isEncryptionAvailable()) return {};
    const plain = safeStorage.decryptString(buf);
    const obj = JSON.parse(plain);
    // Prune keys for providers we no longer support.
    const allowed = new Set(['openai', 'anthropic', 'openrouter', 'claude-code', 'codex', 'gemini-cli']);
    for (const k of Object.keys(obj)) if (!allowed.has(k)) delete obj[k];
    return obj;
  } catch {
    return {};
  }
}

function saveKeys(obj) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS keychain unavailable');
  const enc = safeStorage.encryptString(JSON.stringify(obj));
  fs.writeFileSync(STORE_PATH(), enc, { mode: 0o600 });
}

// --- Windows & Tray ---------------------------------------------------------
let tray = null;
let popoverWin = null;
let desktopWin = null;
let popoverJustToggled = 0; // timestamp guard against click+blur race

const commonWebPrefs = {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
};

function makeTrayIcon() {
  // Try multiple locations so this works in dev (from source), packaged (from
  // extraResources outside asar), and asar-ed (from inside the archive).
  const candidates1x = [
    path.join(process.resourcesPath || '', 'tray-template.png'),
    path.join(__dirname, 'build', 'tray-template.png'),
  ];
  const candidates2x = [
    path.join(process.resourcesPath || '', 'tray-template@2x.png'),
    path.join(__dirname, 'build', 'tray-template@2x.png'),
  ];
  const p1x = candidates1x.find((p) => p && fs.existsSync(p));
  const p2x = candidates2x.find((p) => p && fs.existsSync(p));

  let img;
  if (p1x) {
    img = nativeImage.createFromPath(p1x);
    if (p2x) img.addRepresentation({ scaleFactor: 2, buffer: fs.readFileSync(p2x) });
  } else {
    // Last-resort fallback — render a tiny opaque dot so there's still *something*
    // visible in the menu bar if the template PNGs are unavailable.
    const W = 22, H = 22;
    const buf = Buffer.alloc(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = x - 10.5, dy = y - 10.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      const a = d < 7 ? 255 : d < 8 ? 128 : 0;
      const i = (y * W + x) * 4;
      buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = a;
    }
    img = nativeImage.createFromBitmap(buf, { width: W, height: H });
  }
  if (typeof img.setTemplateImage === 'function') img.setTemplateImage(true);
  return img;
}

function createPopoverWindow() {
  if (popoverWin && !popoverWin.isDestroyed()) return popoverWin;
  popoverWin = new BrowserWindow({
    width: 460, height: 640,
    show: false, frame: false, resizable: false, movable: false,
    skipTaskbar: true, alwaysOnTop: true,
    backgroundColor: '#0a0a0f',
    hasShadow: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: commonWebPrefs,
  });
  popoverWin.setWindowButtonVisibility?.(false);
  popoverWin.loadFile('index.html', { hash: 'popover' });
  popoverWin.on('blur', () => {
    if (Date.now() - popoverJustToggled < 250) return;
    if (popoverWin && popoverWin.isVisible()) popoverWin.hide();
  });
  return popoverWin;
}

function positionPopoverUnderTray() {
  if (!tray || !popoverWin) return;
  const b = tray.getBounds();
  const wb = popoverWin.getBounds();
  const display = screen.getDisplayMatching(b);
  const work = display.workArea;
  let x = Math.round(b.x + b.width / 2 - wb.width / 2);
  x = Math.max(work.x + 8, Math.min(x, work.x + work.width - wb.width - 8));
  const y = Math.round(b.y + b.height + 4);
  popoverWin.setPosition(x, y, false);
}

function togglePopover() {
  createPopoverWindow();
  if (popoverWin.isVisible()) {
    popoverWin.hide();
    return;
  }
  popoverJustToggled = Date.now();
  positionPopoverUnderTray();
  popoverWin.show();
  popoverWin.focus();
}

function createDesktopWindow() {
  if (desktopWin && !desktopWin.isDestroyed()) {
    desktopWin.show(); desktopWin.focus(); return desktopWin;
  }
  desktopWin = new BrowserWindow({
    width: 460, height: 720,
    minWidth: 380, minHeight: 520,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: '#0a0a0f',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    resizable: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: commonWebPrefs,
  });
  desktopWin.loadFile('index.html', { hash: 'desktop' });
  desktopWin.on('closed', () => { desktopWin = null; });
  return desktopWin;
}

function showTrayMenu() {
  const menu = Menu.buildFromTemplate([
    { label: 'Toggle Menubar Popover', click: togglePopover },
    { label: 'Open Desktop Window', click: () => createDesktopWindow() },
    { type: 'separator' },
    { label: 'Refresh Now', click: () => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send('refresh-now');
    }},
    { label: 'Check for Updates…', click: () => checkForUpdatesInteractive() },
    { type: 'separator' },
    { label: `Tokenly ${app.getVersion()}`, enabled: false },
    { label: 'Quit Tokenly', role: 'quit' },
  ]);
  tray.popUpContextMenu(menu);
}

// ---------------------------------------------------------------------------
// Auto-update via GitHub Releases
// ---------------------------------------------------------------------------
// Publishes flow:
//   1. `npm run dist -- --publish always` uploads DMG + zip + latest-mac.yml
//      to a GitHub Release draft tagged with the current version.
//   2. On user's machine, electron-updater polls the feed URL every 4h,
//      downloads the zip in the background when a newer version is found,
//      and installs it on next app quit.
//
// Only runs in packaged builds — skipping in dev (where update feeds would
// fail anyway because `app.isPackaged === false`).

let manualCheckInProgress = false;

function setupAutoUpdater() {
  if (!app.isPackaged) return; // dev mode: don't check
  autoUpdater.autoDownload = true;        // download in background
  autoUpdater.autoInstallOnAppQuit = true; // install on next quit
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err?.message || err);
    if (manualCheckInProgress) {
      manualCheckInProgress = false;
      dialog.showErrorBox('Update check failed', String(err?.message || err));
    }
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] update available:', info.version);
    if (manualCheckInProgress) {
      dialog.showMessageBox({
        type: 'info',
        message: `Tokenly ${info.version} is available`,
        detail: 'Downloading in the background. We\'ll prompt you to install when it\'s ready.',
        buttons: ['OK'],
      });
      manualCheckInProgress = false;
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[updater] up to date:', info.version);
    if (manualCheckInProgress) {
      dialog.showMessageBox({
        type: 'info',
        message: `You're on the latest version (${info.version}).`,
        buttons: ['OK'],
      });
      manualCheckInProgress = false;
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] downloaded:', info.version);
    const r = dialog.showMessageBoxSync({
      type: 'question',
      message: `Tokenly ${info.version} is ready to install.`,
      detail: 'The app will relaunch with the new version.',
      buttons: ['Install & Relaunch', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });
    if (r === 0) {
      setImmediate(() => autoUpdater.quitAndInstall());
    }
  });

  // Kick off the first check ~5s after launch (don't block startup).
  setTimeout(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 5_000);
  // Poll every 4 hours thereafter.
  setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 4 * 60 * 60 * 1000);
}

function checkForUpdatesInteractive() {
  if (!app.isPackaged) {
    dialog.showMessageBox({
      type: 'info',
      message: 'Update checks are disabled in dev mode.',
      detail: 'Build and install the packaged app to test auto-update.',
      buttons: ['OK'],
    });
    return;
  }
  manualCheckInProgress = true;
  autoUpdater.checkForUpdates().catch((err) => {
    manualCheckInProgress = false;
    console.error('[updater] manual check failed:', err);
  });
}

function createTray() {
  tray = new Tray(makeTrayIcon());
  tray.setToolTip('Tokenly — AI usage monitor');
  tray.on('click', togglePopover);
  tray.on('right-click', showTrayMenu);
}

app.whenReady().then(() => {
  // Dock icon for when the desktop window is visible.
  if (process.platform === 'darwin' && app.dock) {
    try { app.dock.setIcon(nativeImage.createFromPath(path.join(__dirname, 'icon.png'))); } catch {}
  }
  createTray();
  startClaudeWatcher();
  startCodexWatcher();
  startGeminiWatcher();
  setupAutoUpdater();
  // Default to popover mode on launch (no dock clutter) unless user had detached.
  const prefersDesktop = (() => {
    try {
      const p = path.join(app.getPath('userData'), 'prefs.json');
      if (!fs.existsSync(p)) return false;
      return !!JSON.parse(fs.readFileSync(p, 'utf8')).prefersDesktop;
    } catch { return false; }
  })();
  if (prefersDesktop) createDesktopWindow();
  else togglePopover();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) togglePopover();
  });
});

// Don't quit on window-all-closed — stay alive in the tray.
app.on('window-all-closed', () => { /* noop */ });

function savePref(k, v) {
  try {
    const p = path.join(app.getPath('userData'), 'prefs.json');
    const cur = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
    cur[k] = v;
    fs.writeFileSync(p, JSON.stringify(cur));
  } catch {}
}

ipcMain.handle('window:detach', () => {
  // Open desktop window, close popover.
  createDesktopWindow();
  if (popoverWin && !popoverWin.isDestroyed()) popoverWin.hide();
  savePref('prefersDesktop', true);
});
ipcMain.handle('window:minimize-to-tray', () => {
  if (desktopWin && !desktopWin.isDestroyed()) {
    desktopWin.close();
    desktopWin = null;
  }
  savePref('prefersDesktop', false);
});
ipcMain.handle('window:open-popover', () => togglePopover());

ipcMain.handle('diagnostic:reveal', () => {
  const dir = app.getPath('userData');
  shell.openPath(dir);
  return dir;
});

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const CODEX_HOME = path.join(os.homedir(), '.codex');
const CODEX_SESSIONS_DIR = path.join(CODEX_HOME, 'sessions');
const CODEX_ARCHIVED_DIR = path.join(CODEX_HOME, 'archived_sessions');
const GEMINI_TMP_DIR = path.join(os.homedir(), '.gemini', 'tmp');

ipcMain.handle('keys:get-meta', () => {
  const keys = loadKeys();
  const meta = {};
  for (const k of ['openai', 'anthropic', 'openrouter']) {
    const v = keys[k];
    meta[k] = v ? { present: true, tail: v.slice(-4) } : { present: false };
  }
  // claude-code is keyless: "present" if the Claude folder exists.
  meta['claude-code'] = fs.existsSync(CLAUDE_PROJECTS_DIR)
    ? { present: true, tail: 'local' }
    : { present: false };
  meta['codex'] = (fs.existsSync(CODEX_SESSIONS_DIR) || fs.existsSync(CODEX_ARCHIVED_DIR))
    ? { present: true, tail: 'local' }
    : { present: false };
  meta['gemini-cli'] = fs.existsSync(GEMINI_TMP_DIR)
    ? { present: true, tail: 'local' }
    : { present: false };
  return meta;
});

ipcMain.handle('keys:set', (_e, provider, value) => {
  const keys = loadKeys();
  if (!value) delete keys[provider]; else keys[provider] = value;
  saveKeys(keys);
  return true;
});

// In-flight request coalescing + short TTL cache per (provider, days).
// Prevents the "fs.watch fires while a scan is already running" thrash,
// and caps local-scan work at most every 8 seconds even under rapid refresh.
const fetchInflight = new Map();   // key -> Promise
const fetchCache = new Map();      // key -> { ts, value }
const FETCH_CACHE_TTL_MS = 8_000;

ipcMain.handle('usage:fetch', async (_e, provider, rangeDays) => {
  const keys = loadKeys();
  const key = keys[provider];
  const keyless = provider === 'claude-code' || provider === 'codex' || provider === 'gemini-cli';
  if (!keyless && !key) return { ok: false, error: 'no_key' };

  const days = rangeDays || 30;
  const cacheKey = `${provider}:${days}`;

  const cached = fetchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < FETCH_CACHE_TTL_MS) {
    return cached.value;
  }
  if (fetchInflight.has(cacheKey)) {
    return fetchInflight.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const data = await fetchUsage(provider, key, days);
      const value = { ok: true, data };
      fetchCache.set(cacheKey, { ts: Date.now(), value });
      return value;
    } catch (err) {
      const value = { ok: false, error: err.message || String(err) };
      // Cache errors briefly too so a broken provider doesn't get hammered.
      fetchCache.set(cacheKey, { ts: Date.now(), value });
      return value;
    } finally {
      fetchInflight.delete(cacheKey);
    }
  })();
  fetchInflight.set(cacheKey, promise);
  return promise;
});

ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));

async function fetchUsage(provider, key, days) {
  const now = Math.floor(Date.now() / 1000);
  const start = now - days * 86400;
  if (provider === 'claude-code') return fetchClaudeCodeLocal(days);
  if (provider === 'codex') return fetchCodexLocal(days);
  if (provider === 'gemini-cli') return fetchGeminiCLILocal(days);
  if (provider === 'openai') return fetchOpenAI(key, start, now, days);
  if (provider === 'anthropic') return fetchAnthropic(key, start, now, days);
  if (provider === 'openrouter') return fetchOpenRouter(key, days);
  throw new Error('unknown_provider');
}

async function pageAll(url, headers, parseNextPage) {
  const out = [];
  let nextUrl = url;
  const seen = new Set();
  let guard = 0;
  while (nextUrl && guard++ < 20) {
    if (seen.has(nextUrl)) break; // guard against APIs that return the same next_page repeatedly
    seen.add(nextUrl);
    const res = await fetch(nextUrl, { headers });
    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = body?.error?.message || body?.error || '';
        if (typeof detail !== 'string') detail = JSON.stringify(detail);
      } catch { /* ignore */ }
      return { error: res.status, detail, pages: out };
    }
    const body = await res.json();
    out.push(body);
    nextUrl = parseNextPage(body);
  }
  return { pages: out };
}

async function fetchOpenAI(key, start, end, days) {
  const base = 'https://api.openai.com/v1/organization';
  const headers = { Authorization: `Bearer ${key}` };
  // Both endpoints cap `limit` at 31 buckets per page — we paginate.
  const limit = 31;

  const usageUrl = (cursor) => {
    const p = new URLSearchParams({
      start_time: String(start), end_time: String(end),
      bucket_width: '1d', limit: String(limit),
    });
    p.append('group_by', 'model');
    if (cursor) p.set('page', cursor);
    return `${base}/usage/completions?${p}`;
  };
  const costsUrl = (cursor) => {
    const p = new URLSearchParams({
      start_time: String(start), end_time: String(end),
      limit: String(limit),
    });
    p.append('group_by', 'line_item');
    if (cursor) p.set('page', cursor);
    return `${base}/costs?${p}`;
  };

  const [uR, cR] = await Promise.all([
    pageAll(usageUrl(), headers, (b) => (b.has_more ? usageUrl(b.next_page) : null)),
    pageAll(costsUrl(), headers, (b) => (b.has_more ? costsUrl(b.next_page) : null)),
  ]);

  if (uR.error === 401 || uR.error === 403) throw new Error('Needs an Admin API key (sk-admin-…). Regular sk- keys can\'t read org usage.');
  if (uR.error) throw new Error(`OpenAI usage HTTP ${uR.error}${uR.detail ? ' — ' + uR.detail : ''}`);

  const byModel = {};
  const trend = new Map(); // date -> tokens
  let inTok = 0, outTok = 0, cached = 0, req = 0;
  for (const page of uR.pages) for (const bucket of page.data || []) {
    const dayKey = bucket.start_time;
    let dayTokens = 0;
    for (const r of bucket.results || []) {
      const m = r.model || 'unknown';
      const row = byModel[m] || { model: m, input: 0, output: 0, cached: 0, requests: 0 };
      row.input += r.input_tokens || 0;
      row.output += r.output_tokens || 0;
      row.cached += r.input_cached_tokens || 0;
      row.requests += r.num_model_requests || 0;
      byModel[m] = row;
      inTok += r.input_tokens || 0;
      outTok += r.output_tokens || 0;
      cached += r.input_cached_tokens || 0;
      req += r.num_model_requests || 0;
      dayTokens += (r.input_tokens || 0) + (r.output_tokens || 0);
    }
    trend.set(dayKey, (trend.get(dayKey) || 0) + dayTokens);
  }

  let totalCost = 0;
  const byLineItem = {};
  if (!cR.error) {
    for (const page of cR.pages) for (const bucket of page.data || []) {
      for (const r of bucket.results || []) {
        const amt = Number((r.amount && r.amount.value) || 0);
        if (!Number.isFinite(amt)) continue;
        totalCost += amt;
        const li = r.line_item || 'other';
        byLineItem[li] = (byLineItem[li] || 0) + amt;
      }
    }
  }

  const sortedTrend = [...trend.entries()].sort(([a], [b]) => a - b).map(([_, v]) => v);

  return {
    totals: { input: inTok, output: outTok, cached, requests: req, cost: totalCost, currency: 'USD' },
    models: Object.values(byModel).sort((a, b) => (b.input + b.output) - (a.input + a.output)),
    lineItems: Object.entries(byLineItem).sort((a, b) => b[1] - a[1]).map(([name, cost]) => ({ name, cost })),
    trend: sortedTrend,
    windowDays: days,
    note: null,
  };
}

async function fetchAnthropic(key, start, end, days) {
  const base = 'https://api.anthropic.com/v1/organizations';
  const headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  const starts = new Date(start * 1000).toISOString();
  const ends = new Date(end * 1000).toISOString();
  const limit = 31;

  const usageUrl = (cursor) => {
    const p = new URLSearchParams({ starting_at: starts, ending_at: ends, bucket_width: '1d', limit: String(limit) });
    p.append('group_by[]', 'model');
    if (cursor) p.set('page', cursor);
    return `${base}/usage_report/messages?${p}`;
  };
  const costUrl = (cursor) => {
    const p = new URLSearchParams({ starting_at: starts, ending_at: ends, bucket_width: '1d', limit: String(limit) });
    if (cursor) p.set('page', cursor);
    return `${base}/cost_report?${p}`;
  };

  const [uR, cR] = await Promise.all([
    pageAll(usageUrl(), headers, (b) => (b.has_more ? usageUrl(b.next_page) : null)),
    pageAll(costUrl(), headers, (b) => (b.has_more ? costUrl(b.next_page) : null)),
  ]);

  if (uR.error === 401 || uR.error === 403) throw new Error('Needs an Admin API key (sk-ant-admin-…). Regular sk-ant-api keys can\'t read usage/cost reports.');
  if (uR.error) throw new Error(`Anthropic usage HTTP ${uR.error}${uR.detail ? ' — ' + uR.detail : ''}`);

  const byModel = {};
  const trend = new Map();
  let inTok = 0, outTok = 0, cacheIn = 0, cacheRead = 0, req = 0;
  for (const page of uR.pages) for (const bucket of page.data || []) {
    const dayKey = bucket.starting_at;
    let dayTokens = 0;
    for (const r of bucket.results || []) {
      const m = r.model || 'unknown';
      const row = byModel[m] || { model: m, input: 0, output: 0, cache_creation: 0, cache_read: 0, requests: 0 };
      row.input += r.uncached_input_tokens || 0;
      row.output += r.output_tokens || 0;
      row.cache_creation += r.cache_creation_input_tokens || 0;
      row.cache_read += r.cache_read_input_tokens || 0;
      byModel[m] = row;
      inTok += r.uncached_input_tokens || 0;
      outTok += r.output_tokens || 0;
      cacheIn += r.cache_creation_input_tokens || 0;
      cacheRead += r.cache_read_input_tokens || 0;
      dayTokens += (r.uncached_input_tokens || 0) + (r.output_tokens || 0) + (r.cache_read_input_tokens || 0);
    }
    trend.set(dayKey, (trend.get(dayKey) || 0) + dayTokens);
  }

  // Anthropic's cost_report returns `amount` as a string in CENTS, not dollars —
  // despite the sibling `currency: "USD"` label. Empirically verified against the
  // Console: 843.65 reported ÷ 100 = $8.44, matching the Console's $8.48.
  const readAmount = (a) => {
    let raw = 0;
    if (a == null) raw = 0;
    else if (typeof a === 'string' || typeof a === 'number') raw = Number(a) || 0;
    else if (typeof a === 'object' && 'value' in a) raw = Number(a.value) || 0;
    return raw / 100;
  };

  let totalCost = 0;
  if (!cR.error) {
    const seenBuckets = new Set();
    for (const page of cR.pages) for (const bucket of page.data || []) {
      const key = bucket.starting_at;
      if (seenBuckets.has(key)) continue;
      seenBuckets.add(key);
      for (const r of bucket.results || []) {
        totalCost += readAmount(r.amount);
      }
    }
  }

  const sortedTrend = [...trend.entries()].sort().map(([_, v]) => v);

  return {
    totals: { input: inTok, output: outTok, cache_creation: cacheIn, cache_read: cacheRead, requests: req, cost: totalCost, currency: 'USD' },
    models: Object.values(byModel).sort((a, b) => (b.input + b.output + b.cache_read) - (a.input + a.output + a.cache_read)),
    trend: sortedTrend,
    windowDays: days,
    note: null,
  };
}

async function fetchOpenRouter(key, days) {
  // Fetch activity + credits balance in parallel.
  const [res, credRes] = await Promise.all([
    fetch('https://openrouter.ai/api/v1/activity', {
      headers: { Authorization: `Bearer ${key}` },
    }),
    fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${key}` },
    }).catch(() => null),
  ]);

  // Credits are non-fatal — if this fails we still return activity data.
  let balance = null;
  if (credRes && credRes.ok) {
    try {
      const cb = await credRes.json();
      const d = cb.data || cb;
      const total = Number(d.total_credits) || 0;
      const used = Number(d.total_usage) || 0;
      balance = { total, used, remaining: Math.max(0, total - used), currency: 'USD' };
    } catch { /* non-fatal */ }
  }
  if (res.status === 401 || res.status === 403) throw new Error('Invalid key. OpenRouter requires a Management key (not a regular API key).');
  if (!res.ok) {
    let detail = '';
    try { const b = await res.json(); detail = b?.error?.message || ''; } catch {}
    throw new Error(`OpenRouter HTTP ${res.status}${detail ? ' — ' + detail : ''}`);
  }
  const body = await res.json();
  const rows = Array.isArray(body.data) ? body.data : [];

  const cutoffMs = Date.now() - days * 86400 * 1000;
  const filtered = rows.filter((r) => {
    const t = Date.parse(r.date + 'T00:00:00Z');
    return Number.isFinite(t) ? t >= cutoffMs : true;
  });

  const byModel = {};
  const trend = new Map();
  let inTok = 0, outTok = 0, reasoningTok = 0, req = 0, totalCost = 0;
  for (const r of filtered) {
    const m = r.model || 'unknown';
    const row = byModel[m] || { model: m, input: 0, output: 0, reasoning: 0, requests: 0, cost: 0 };
    row.input += r.prompt_tokens || 0;
    row.output += r.completion_tokens || 0;
    row.reasoning += r.reasoning_tokens || 0;
    row.requests += r.requests || 0;
    row.cost += Number(r.usage) || 0;
    byModel[m] = row;
    inTok += r.prompt_tokens || 0;
    outTok += r.completion_tokens || 0;
    reasoningTok += r.reasoning_tokens || 0;
    req += r.requests || 0;
    totalCost += Number(r.usage) || 0;
    const dayTokens = (r.prompt_tokens || 0) + (r.completion_tokens || 0);
    trend.set(r.date, (trend.get(r.date) || 0) + dayTokens);
  }

  const sortedTrend = [...trend.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([_, v]) => v);
  const effectiveDays = Math.min(days, 30);

  return {
    totals: { input: inTok, output: outTok, reasoning: reasoningTok, requests: req, cost: totalCost, currency: 'USD' },
    models: Object.values(byModel).sort((a, b) => (b.input + b.output) - (a.input + a.output)),
    trend: sortedTrend,
    windowDays: effectiveDays,
    balance,
    note: days > 30 ? 'OpenRouter only exposes the last 30 completed UTC days.' : null,
  };
}

// ---------------------------------------------------------------------------
// Claude Code — local JSONL scanner. Reads ~/.claude/projects/**/*.jsonl which
// Claude Code (CLI) and the Claude desktop app write per assistant turn. This
// gives us real-time, per-message token usage with no API key required.
// ---------------------------------------------------------------------------

// Per-million-token USD pricing for Claude models (standard tier).
// Cache write = 1.25x input (5m) or 2x input (1h). Cache read = 0.1x input.
// Updated whenever Anthropic announces changes.
const CLAUDE_PRICING = [
  // Opus 4.5+ reduced price to $5/$25 (down from $15/$75 on Opus 3).
  { match: /^claude-opus-4-[5-9]/, input: 5,    output: 25 },
  { match: /^claude-opus-4/,       input: 5,    output: 25 },
  { match: /^claude-sonnet-4/,     input: 3,    output: 15 },
  { match: /^claude-haiku-4-5/,    input: 1,    output: 5 },
  { match: /^claude-haiku-4/,      input: 0.8,  output: 4 },
  { match: /^claude-3-7-sonnet/,   input: 3,    output: 15 },
  { match: /^claude-3-5-sonnet/,   input: 3,    output: 15 },
  { match: /^claude-3-5-haiku/,    input: 0.8,  output: 4 },
  { match: /^claude-3-opus/,       input: 15,   output: 75 },
  { match: /^claude-3-haiku/,      input: 0.25, output: 1.25 },
];
function priceFor(model) {
  const m = String(model || '');
  for (const p of CLAUDE_PRICING) if (p.match.test(m)) return p;
  return { input: 3, output: 15 }; // safe Sonnet default
}
function costFromUsage(model, u) {
  if (!u) return 0;
  const p = priceFor(model);
  const input = (u.input_tokens || 0) * p.input / 1e6;
  const output = (u.output_tokens || 0) * p.output / 1e6;
  const cc = u.cache_creation || {};
  const cache5m = cc.ephemeral_5m_input_tokens || 0;
  const cache1h = cc.ephemeral_1h_input_tokens || 0;
  // If the detailed split is missing, fall back to the flat total at 5m rate.
  const cacheCreation = (cache5m + cache1h) > 0
    ? (cache5m * 1.25 + cache1h * 2) * p.input / 1e6
    : (u.cache_creation_input_tokens || 0) * 1.25 * p.input / 1e6;
  const cacheRead = (u.cache_read_input_tokens || 0) * 0.1 * p.input / 1e6;
  return input + output + cacheCreation + cacheRead;
}

function* walkJsonlFiles(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { yield* walkJsonlFiles(full); }
    else if (e.isFile() && e.name.endsWith('.jsonl')) { yield full; }
  }
}

async function fetchClaudeCodeLocal(days) {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) {
    throw new Error('No local Claude Code data found (~/.claude/projects/ missing).');
  }
  const cutoffMs = Date.now() - days * 86400 * 1000;
  const byModel = {};
  const byDay = new Map();
  const seenIds = new Set();
  let inTok = 0, outTok = 0, cacheIn = 0, cacheRead = 0, req = 0, totalCost = 0;

  const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;

  for (const filepath of walkJsonlFiles(CLAUDE_PROJECTS_DIR)) {
    let stat;
    try { stat = fs.statSync(filepath); } catch { continue; }
    if (stat.mtimeMs < cutoffMs) continue;
    if (stat.size > MAX_FILE_BYTES) continue;

    try {
      const rl = readline.createInterface({
        input: fs.createReadStream(filepath, { encoding: 'utf8', highWaterMark: 64 * 1024 }),
        crlfDelay: Infinity,
      });
      for await (const line of rl) {
        if (!line) continue;
        let o;
        try { o = JSON.parse(line); } catch { continue; }
        if (o.type !== 'assistant' || !o.message || !o.message.usage) continue;
        const msgId = o.message.id;
        if (msgId && seenIds.has(msgId)) continue;
        if (msgId) seenIds.add(msgId);
        const ts = Date.parse(o.timestamp);
        if (!Number.isFinite(ts) || ts < cutoffMs) continue;

        const model = o.message.model || 'unknown';
        const u = o.message.usage;
        const cost = costFromUsage(model, u);
        const row = byModel[model] || { model, input: 0, output: 0, cache_creation: 0, cache_read: 0, requests: 0, cost: 0 };
        row.input += u.input_tokens || 0;
        row.output += u.output_tokens || 0;
        row.cache_creation += u.cache_creation_input_tokens || 0;
        row.cache_read += u.cache_read_input_tokens || 0;
        row.requests += 1;
        row.cost += cost;
        byModel[model] = row;

        inTok += u.input_tokens || 0;
        outTok += u.output_tokens || 0;
        cacheIn += u.cache_creation_input_tokens || 0;
        cacheRead += u.cache_read_input_tokens || 0;
        req += 1;
        totalCost += cost;

        const dayKey = new Date(ts).toISOString().slice(0, 10);
        const d = byDay.get(dayKey) || 0;
        const dayTokens = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_read_input_tokens || 0);
        byDay.set(dayKey, d + dayTokens);
      }
    } catch { continue; }
  }

  const sortedTrend = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([_, v]) => v);

  return {
    totals: { input: inTok, output: outTok, cache_creation: cacheIn, cache_read: cacheRead, requests: req, cost: totalCost, currency: 'USD' },
    models: Object.values(byModel).sort((a, b) => b.cost - a.cost),
    trend: sortedTrend,
    windowDays: days,
    note: 'Computed from local ~/.claude/projects logs. Prices are estimates — verify against Anthropic billing for exact charges.',
  };
}

// Real-time watcher: when a JSONL file changes, tell all windows to refresh.
let claudeWatcher = null;
let claudeWatchTimer = null;
function startClaudeWatcher() {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return;
  try {
    claudeWatcher = fs.watch(CLAUDE_PROJECTS_DIR, { recursive: true }, (_event, filename) => {
      if (!filename || !String(filename).endsWith('.jsonl')) return;
      clearTimeout(claudeWatchTimer);
      claudeWatchTimer = setTimeout(() => pingVisibleWindows(), 5000);
    });
    claudeWatcher.on('error', () => { try { claudeWatcher.close(); } catch {} claudeWatcher = null; });
  } catch { /* watcher not critical; polling still happens */ }
}

// Only push refresh to windows that are actually visible. If the popover is
// hidden and the desktop window isn't open, do nothing — saves work and
// prevents unnecessary UI state thrash.
function pingVisibleWindows() {
  for (const w of BrowserWindow.getAllWindows()) {
    if (w && !w.isDestroyed() && w.isVisible()) {
      w.webContents.send('refresh-now');
    }
  }
}

// ---------------------------------------------------------------------------
// Codex — reads ~/.codex/logs_2.sqlite. OpenTelemetry events on
// `codex_otel.log_only` with event.kind=response.completed carry per-turn
// token counts and the model. auth_mode tells us whether it's ChatGPT-bundled
// or API-billed so we can label cost appropriately.
// ---------------------------------------------------------------------------

const OPENAI_PRICING = [
  { match: /^gpt-5\.4-codex/,   input: 1.25, output: 10   },
  { match: /^gpt-5\.4-mini/,    input: 0.25, output: 2    },
  { match: /^gpt-5\.4/,         input: 2.50, output: 15   },
  { match: /^gpt-5-codex/,      input: 1.25, output: 10   },
  { match: /^gpt-5-mini/,       input: 0.25, output: 2    },
  { match: /^gpt-5/,            input: 1.25, output: 10   },
  { match: /^o1-mini/,          input: 1.10, output: 4.40 },
  { match: /^o1/,               input: 15,   output: 60   },
  { match: /^gpt-4\.1-mini/,    input: 0.40, output: 1.60 },
  { match: /^gpt-4\.1/,         input: 2,    output: 8    },
  { match: /^gpt-4o-mini/,      input: 0.15, output: 0.60 },
  { match: /^gpt-4o/,           input: 2.50, output: 10   },
];
function openaiPriceFor(model) {
  const m = String(model || '');
  for (const p of OPENAI_PRICING) if (p.match.test(m)) return p;
  return { input: 2.50, output: 10 }; // safe 4o default
}

function* walkCodexRollouts() {
  const dirs = [CODEX_SESSIONS_DIR, CODEX_ARCHIVED_DIR];
  for (const root of dirs) {
    if (!fs.existsSync(root)) continue;
    const stack = [root];
    while (stack.length) {
      const d = stack.pop();
      let entries;
      try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) stack.push(full);
        else if (e.isFile() && e.name.startsWith('rollout-') && e.name.endsWith('.jsonl')) yield full;
      }
    }
  }
}

async function fetchCodexLocal(days) {
  const sessions = fs.existsSync(CODEX_SESSIONS_DIR);
  const archived = fs.existsSync(CODEX_ARCHIVED_DIR);
  if (!sessions && !archived) {
    throw new Error('Codex rollouts not found (~/.codex/sessions and /archived_sessions both missing).');
  }
  const cutoffMs = Date.now() - days * 86400 * 1000;

  const byModel = {};
  const byDay = new Map();
  let inTok = 0, outTok = 0, cachedTok = 0, reasoningTok = 0, turns = 0;
  let totalCost = 0;
  const planTypes = new Map();
  const seenSessions = new Set();
  // Track the freshest rate_limits object we've seen, to surface "remaining quota".
  let latestRateLimits = null;
  let latestRateLimitsTs = 0;

  // Hard cap to prevent runaway reads on pathological multi-GB rollouts.
  // Files above this size are streamed in chunks (we already stream); if a
  // single file would take a *huge* amount of time, we skip it and note it.
  const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

  for (const filepath of walkCodexRollouts()) {
    let stat;
    try { stat = fs.statSync(filepath); } catch { continue; }
    if (stat.mtimeMs < cutoffMs) continue;
    if (stat.size > MAX_FILE_BYTES) continue;

    let sessionId = null;
    let currentModel = 'unknown';

    // Stream line-by-line so we never hold more than one line of the file in memory.
    let sessionSkip = false;
    try {
      const rl = readline.createInterface({
        input: fs.createReadStream(filepath, { encoding: 'utf8', highWaterMark: 64 * 1024 }),
        crlfDelay: Infinity,
      });
      for await (const line of rl) {
        if (sessionSkip || !line) continue;
        let o;
        try { o = JSON.parse(line); } catch { continue; }

        if (o.type === 'session_meta' && o.payload?.id && !sessionId) {
          sessionId = o.payload.id;
          if (seenSessions.has(sessionId)) { sessionSkip = true; continue; }
          seenSessions.add(sessionId);
        }

        if (o.type === 'turn_context' && o.payload?.model) {
          currentModel = o.payload.model;
        }

        if (o.type === 'event_msg' && o.payload?.type === 'token_count') {
          const info = o.payload.info;
          if (!info || !info.last_token_usage) continue;
          const ts = Date.parse(o.timestamp);
          if (!Number.isFinite(ts) || ts < cutoffMs) continue;

          const last = info.last_token_usage;
          const inT = last.input_tokens || 0;
          const cachedT = last.cached_input_tokens || 0;
          const outT = last.output_tokens || 0; // includes reasoning
          const reasoningT = last.reasoning_output_tokens || 0;
          if (inT === 0 && outT === 0) continue;

          const p = openaiPriceFor(currentModel);
          const billableInput = Math.max(0, inT - cachedT);
          const cost = billableInput * p.input / 1e6
                     + cachedT * p.input * 0.1 / 1e6
                     + outT * p.output / 1e6;

          const row = byModel[currentModel] || { model: currentModel, input: 0, output: 0, cached: 0, reasoning: 0, requests: 0, cost: 0 };
          row.input += inT; row.output += outT; row.cached += cachedT; row.reasoning += reasoningT;
          row.requests += 1; row.cost += cost;
          byModel[currentModel] = row;

          inTok += inT; outTok += outT; cachedTok += cachedT; reasoningTok += reasoningT;
          turns += 1; totalCost += cost;

          const plan = o.payload.rate_limits?.plan_type || 'unknown';
          planTypes.set(plan, (planTypes.get(plan) || 0) + 1);

          // Capture the most recent rate_limits snapshot across all rollout files.
          if (o.payload.rate_limits && ts > latestRateLimitsTs) {
            latestRateLimitsTs = ts;
            latestRateLimits = o.payload.rate_limits;
          }

          const dayKey = new Date(ts).toISOString().slice(0, 10);
          byDay.set(dayKey, (byDay.get(dayKey) || 0) + inT + outT);
        }
      }
    } catch (err) {
      // Skip unreadable files but keep going with the rest.
      continue;
    }
  }

  const sortedTrend = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([_, v]) => v);
  // Compose subscription-aware note.
  const planList = [...planTypes.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p).filter(Boolean).slice(0, 3);
  const subLabel = planList.length
    ? `Plan: ${planList.join(', ')}. Cost is a list-price estimate — most ChatGPT subscription usage is bundled and not billed per-token.`
    : 'Cost is an estimate based on public pricing.';

  return {
    totals: { input: inTok, output: outTok, cached: cachedTok, reasoning: reasoningTok, requests: turns, cost: totalCost, currency: 'USD' },
    models: Object.values(byModel).sort((a, b) => b.cost - a.cost),
    trend: sortedTrend,
    windowDays: days,
    rateLimits: latestRateLimits,
    note: `Computed from ~/.codex/sessions rollouts. ${subLabel}`,
  };
}

// Watch the rollouts directory for new files / updates.
let codexWatcher = null;
let codexWatchTimer = null;
function startCodexWatcher() {
  if (!fs.existsSync(CODEX_SESSIONS_DIR)) return;
  try {
    codexWatcher = fs.watch(CODEX_SESSIONS_DIR, { recursive: true }, (_event, filename) => {
      if (!filename || !String(filename).endsWith('.jsonl')) return;
      clearTimeout(codexWatchTimer);
      codexWatchTimer = setTimeout(() => pingVisibleWindows(), 5000);
    });
    codexWatcher.on('error', () => { try { codexWatcher.close(); } catch {} codexWatcher = null; });
  } catch { /* non-fatal */ }
}

// ---------------------------------------------------------------------------
// Gemini CLI — reads ~/.gemini/tmp/<project_hash>/chats/*.json for per-turn
// token usage. Schema is cleaner than Claude's / Codex's: every assistant turn
// ships { tokens: { input, output, cached, thoughts, tool, total }, model }.
// ---------------------------------------------------------------------------

// Per-million-token pricing (USD) as of April 2026. Update when Google changes rates.
// thoughts = reasoning (priced as output). cached = cached input (priced at 0.25x input).
// tool = tokens consumed by tool call context (priced at input rate).
const GEMINI_PRICING = [
  { match: /^gemini-3-pro/,         input: 2.00, output: 12.00 },
  { match: /^gemini-3-flash-lite/,  input: 0.10, output: 0.40  },
  { match: /^gemini-3-flash/,       input: 0.30, output: 2.50  },
  { match: /^gemini-2\.5-pro/,      input: 1.25, output: 10.00 },
  { match: /^gemini-2\.5-flash-lite/,input: 0.10, output: 0.40 },
  { match: /^gemini-2\.5-flash/,    input: 0.30, output: 2.50  },
  { match: /^gemini-2\.0-flash/,    input: 0.15, output: 0.60  },
  { match: /^gemini-1\.5-pro/,      input: 1.25, output: 5.00  },
  { match: /^gemini-1\.5-flash/,    input: 0.075, output: 0.30 },
];
function geminiPriceFor(model) {
  const m = String(model || '');
  for (const p of GEMINI_PRICING) if (p.match.test(m)) return p;
  return { input: 0.30, output: 2.50 }; // safe Flash default
}
function costFromGeminiTokens(model, t) {
  if (!t) return 0;
  const p = geminiPriceFor(model);
  const input    = (t.input    || 0) * p.input  / 1e6;
  const output   = (t.output   || 0) * p.output / 1e6;
  const cached   = (t.cached   || 0) * p.input  * 0.25 / 1e6;   // cache read
  const thoughts = (t.thoughts || 0) * p.output / 1e6;          // reasoning priced as output
  const tool     = (t.tool     || 0) * p.input  / 1e6;          // tool context priced as input
  return input + output + cached + thoughts + tool;
}

async function fetchGeminiCLILocal(days) {
  if (!fs.existsSync(GEMINI_TMP_DIR)) {
    throw new Error('No local Gemini CLI data (~/.gemini/tmp/ missing). Install gemini-cli.');
  }
  const cutoffMs = Date.now() - days * 86400 * 1000;
  const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;

  const byModel = {};
  const byDay = new Map();
  const seenIds = new Set();
  let inTok = 0, outTok = 0, cachedTok = 0, thoughtsTok = 0, toolTok = 0, req = 0, totalCost = 0;

  // Each project has ~/.gemini/tmp/<hash>/chats/*.json — walk all of them.
  let projectDirs;
  try { projectDirs = fs.readdirSync(GEMINI_TMP_DIR, { withFileTypes: true }); } catch { projectDirs = []; }

  for (const pd of projectDirs) {
    if (!pd.isDirectory()) continue;
    const chatsDir = path.join(GEMINI_TMP_DIR, pd.name, 'chats');
    if (!fs.existsSync(chatsDir)) continue;

    let sessFiles;
    try { sessFiles = fs.readdirSync(chatsDir); } catch { continue; }
    for (const fname of sessFiles) {
      if (!fname.endsWith('.json')) continue;
      const full = path.join(chatsDir, fname);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (stat.mtimeMs < cutoffMs) continue;
      if (stat.size > MAX_FILE_BYTES) continue;

      let content;
      try { content = fs.readFileSync(full, 'utf8'); } catch { continue; }
      let session;
      try { session = JSON.parse(content); } catch { continue; }

      const messages = Array.isArray(session.messages) ? session.messages : [];
      for (const msg of messages) {
        if (msg.type !== 'gemini') continue;        // only assistant turns have token data
        if (!msg.tokens) continue;
        if (msg.id && seenIds.has(msg.id)) continue;
        if (msg.id) seenIds.add(msg.id);

        const ts = Date.parse(msg.timestamp);
        if (!Number.isFinite(ts) || ts < cutoffMs) continue;

        const model = msg.model || 'unknown';
        const t = msg.tokens;
        const cost = costFromGeminiTokens(model, t);

        const row = byModel[model] || { model, input: 0, output: 0, cached: 0, thoughts: 0, tool: 0, requests: 0, cost: 0 };
        row.input    += t.input    || 0;
        row.output   += t.output   || 0;
        row.cached   += t.cached   || 0;
        row.thoughts += t.thoughts || 0;
        row.tool     += t.tool     || 0;
        row.requests += 1;
        row.cost     += cost;
        byModel[model] = row;

        inTok       += t.input    || 0;
        outTok      += t.output   || 0;
        cachedTok   += t.cached   || 0;
        thoughtsTok += t.thoughts || 0;
        toolTok     += t.tool     || 0;
        req         += 1;
        totalCost   += cost;

        const dayKey = new Date(ts).toISOString().slice(0, 10);
        byDay.set(dayKey, (byDay.get(dayKey) || 0) + (t.total || 0));
      }
    }
  }

  const sortedTrend = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([_, v]) => v);

  return {
    totals: {
      input: inTok, output: outTok, cached: cachedTok,
      reasoning: thoughtsTok, tool: toolTok,
      requests: req, cost: totalCost, currency: 'USD',
    },
    models: Object.values(byModel).sort((a, b) => b.cost - a.cost),
    trend: sortedTrend,
    windowDays: days,
    note: 'Computed from local ~/.gemini/tmp session files. Prices are estimates from published Google rates.',
  };
}

// File watcher — fires sub-second refresh when Gemini CLI writes a new turn.
let geminiWatcher = null;
let geminiWatchTimer = null;
function startGeminiWatcher() {
  if (!fs.existsSync(GEMINI_TMP_DIR)) return;
  try {
    geminiWatcher = fs.watch(GEMINI_TMP_DIR, { recursive: true }, (_event, filename) => {
      if (!filename || !String(filename).endsWith('.json')) return;
      clearTimeout(geminiWatchTimer);
      geminiWatchTimer = setTimeout(() => pingVisibleWindows(), 5000);
    });
    geminiWatcher.on('error', () => { try { geminiWatcher.close(); } catch {} geminiWatcher = null; });
  } catch { /* non-fatal */ }
}

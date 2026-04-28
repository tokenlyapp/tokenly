const { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, safeStorage, shell, dialog, Notification } = require('electron');
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
    const allowed = new Set([
      'openai', 'anthropic', 'openrouter', 'claude-code', 'codex', 'gemini-cli',
      // Tokenly Chat regular API keys (separate from admin keys above).
      'chat-openai', 'chat-anthropic', 'chat-google',
    ]);
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
    width: 690, height: 640,
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
    // Don't auto-hide when focus moved to a sibling Tokenly window (voice
    // mate window, onboarding overlay, detached desktop, hidden export
    // workers). Otherwise opening the voice AI from the popover would
    // immediately collapse the popover behind it.
    const focused = BrowserWindow.getFocusedWindow();
    if (focused && focused !== popoverWin) {
      const ours = [voiceMateWin, onboardingWin, desktopWin].filter(Boolean);
      if (ours.includes(focused)) return;
    }
    if (popoverWin && popoverWin.isVisible()) {
      popoverWin.hide();
      maybeShowTrayOnboarding();
    }
  });
  return popoverWin;
}

// ---- First-dismiss tray onboarding ---------------------------------------
// The first time a user opens Tokenly and then clicks away, surface a brief
// floating overlay below the tray icon explaining that Tokenly now lives in
// the menu bar. Shown exactly once — flag persisted in prefs.json. Skipped
// entirely after that, even if the user reinstalls the same prefs.json.
let onboardingWin = null;
function maybeShowTrayOnboarding() {
  if (onboardingWin && !onboardingWin.isDestroyed()) return;
  let prefs;
  try {
    const p = path.join(app.getPath('userData'), 'prefs.json');
    prefs = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
  } catch { prefs = {}; }
  if (prefs.trayOnboardingShown) return;
  // Persist immediately so a quick rapid-blur sequence doesn't fire it twice.
  savePref('trayOnboardingShown', true);

  const ONBOARDING_W = 320;
  const ONBOARDING_H = 180;

  let x = 100, y = 40;
  try {
    const b = tray.getBounds();
    const display = screen.getDisplayMatching(b);
    const work = display.workArea;
    // Center horizontally on the tray icon, sit just below the menu bar
    // (tray.y + height + small gap). Clamp to the active display.
    x = Math.round(b.x + b.width / 2 - ONBOARDING_W / 2);
    x = Math.max(work.x + 8, Math.min(x, work.x + work.width - ONBOARDING_W - 8));
    y = Math.round(b.y + b.height + 6);
  } catch {}

  onboardingWin = new BrowserWindow({
    width: ONBOARDING_W,
    height: ONBOARDING_H,
    x, y,
    show: false,
    frame: false,
    resizable: false, movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    focusable: false,         // never steal focus from whatever the user just clicked into
    acceptFirstMouse: true,   // first click hits the dismiss button without focusing window
    webPreferences: commonWebPrefs,
  });
  onboardingWin.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
  onboardingWin.setIgnoreMouseEvents(false);
  onboardingWin.loadFile('index.html', { hash: 'tray-onboarding' });
  onboardingWin.once('ready-to-show', () => onboardingWin.show());
  onboardingWin.on('closed', () => { onboardingWin = null; });
}

ipcMain.handle('tray-onboarding:close', () => {
  if (onboardingWin && !onboardingWin.isDestroyed()) onboardingWin.close();
  return true;
});

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
    width: 690, height: 720,
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
    { label: 'View Pricing…', click: () => openPricingFromTray() },
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
  setupPricingRefresh();
  setupLicenseReverify();
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

ipcMain.handle('tray:set-title', (_e, title) => {
  if (!tray) return;
  try {
    tray.setTitle(typeof title === 'string' ? title : '');
  } catch (err) {
    console.error('[tray] setTitle failed:', err?.message || err);
  }
});

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
      // Run usage + status in parallel. Status is strictly additive — the
      // call has its own 4s timeout + 5min cache and never throws.
      const [data, status] = await Promise.all([
        fetchUsage(provider, key, days),
        fetchProviderStatus(provider).catch(() => null),
      ]);
      const value = { ok: true, data: status ? { ...data, status } : data };
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

// Launch-at-login. macOS-only; falls back gracefully on other platforms so
// the renderer can render a disabled toggle without special-casing.
ipcMain.handle('prefs:launch-at-login:get', () => {
  if (process.platform !== 'darwin') return { supported: false, enabled: false };
  try {
    const s = app.getLoginItemSettings();
    return { supported: true, enabled: !!s.openAtLogin };
  } catch { return { supported: true, enabled: false }; }
});
ipcMain.handle('app:version', () => {
  try { return app.getVersion(); } catch { return null; }
});

// In-memory changelog cache (1h TTL). Falls back to last-known on network
// failures so the sheet always renders something.
let changelogCache = null;
ipcMain.handle('changelog:get', async () => {
  const TTL_MS = 60 * 60 * 1000;
  if (changelogCache && Date.now() - changelogCache.fetchedAt < TTL_MS) return changelogCache.data;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8000);
  let res;
  try {
    // Cache-bust the GitHub edge — the listing endpoint is eventually-
    // consistent for ~30-60min after a publish, so freshly-shipped versions
    // would flicker in/out depending on which edge node served the request.
    res = await fetch(`https://api.github.com/repos/tokenlyapp/tokenly/releases?per_page=20&_=${Date.now()}`, {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'tokenly/' + app.getVersion() },
      signal: ctrl.signal,
      cache: 'no-store',
    });
  } catch { clearTimeout(timeout); return changelogCache ? changelogCache.data : []; }
  clearTimeout(timeout);
  if (!res || !res.ok) return changelogCache ? changelogCache.data : [];
  let body;
  try { body = await res.json(); } catch { return changelogCache ? changelogCache.data : []; }
  if (!Array.isArray(body)) return changelogCache ? changelogCache.data : [];
  const data = body
    .filter((r) => !r.draft)
    .map((r) => ({
      version: String(r.tag_name || '').replace(/^v/, ''),
      tag: r.tag_name,
      title: r.name || r.tag_name,
      body: r.body || '',
      publishedAt: r.published_at,
      url: r.html_url,
      prerelease: !!r.prerelease,
    }));
  changelogCache = { fetchedAt: Date.now(), data };
  return data;
});

ipcMain.handle('prefs:launch-at-login:set', (_e, enabled) => {
  if (process.platform !== 'darwin') return { supported: false, enabled: false };
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      // Open hidden so the popover doesn't fly open in the user's face
      // immediately on every login. Tray icon still appears.
      openAsHidden: true,
    });
    return { supported: true, enabled: !!enabled };
  } catch { return { supported: true, enabled: false }; }
});

// Render an HTML string to a PDF via a hidden BrowserWindow + printToPDF,
// then prompt for a save location. Used by the Analytics "Export report"
// button for the flagship PDF report. Zero new deps — Chromium does the
// rendering, Electron's native printToPDF gives publication-quality output.
ipcMain.handle('export:charts-pdf', async (e, { html, suggestedName } = {}) => {
  let win;
  try {
    const parent = BrowserWindow.fromWebContents(e.sender) || BrowserWindow.getFocusedWindow();
    // Ask first so we don't render a PDF the user is about to throw away.
    const defaultPath = path.join(app.getPath('downloads'), suggestedName || 'tokenly-report.pdf');
    const saveRes = await dialog.showSaveDialog(parent, {
      title: 'Export Tokenly analytics report',
      defaultPath,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (saveRes.canceled || !saveRes.filePath) return { ok: false, canceled: true };

    win = new BrowserWindow({
      show: false,
      width: 816,   // Letter @ 96dpi: 8.5 * 96
      height: 1056, // Letter @ 96dpi: 11 * 96
      webPreferences: { offscreen: false, sandbox: true, contextIsolation: true },
    });

    // data: URL avoids writing to a temp file. Chromium handles large URLs fine.
    const dataUrl = 'data:text/html;charset=utf-8;base64,' + Buffer.from(String(html ?? ''), 'utf8').toString('base64');
    await win.loadURL(dataUrl);

    // Give the renderer a tick to paint SVGs / fonts before capturing.
    await new Promise((r) => setTimeout(r, 200));

    // Page header + footer via Chromium's displayHeaderFooter. CSS
    // classes like .pageNumber/.totalPages/.date/.title are substituted
    // at print time — no extra JS needed.
    const headerTemplate = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 8px; color: #8a8c99; padding: 0 12mm; width: 100%; display: flex; justify-content: space-between; align-items: center;">
        <span style="display: inline-flex; align-items: center; gap: 6px;">
          <span style="width: 8px; height: 8px; border-radius: 2px; background: linear-gradient(135deg,#ffd772,#e8a441);"></span>
          <b style="color:#ecedf3;">Tokenly</b>
          <span>Analytics Report</span>
        </span>
        <span class="date" style="color:#5d6070;"></span>
      </div>`;
    const footerTemplate = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 8px; color: #5d6070; padding: 0 12mm; width: 100%; display: flex; justify-content: space-between;">
        <span>tokenly.app · local data, never leaves your Mac</span>
        <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>`;
    const pdfBuf = await win.webContents.printToPDF({
      pageSize: 'Letter',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margins: { top: 0.5, right: 0.4, bottom: 0.5, left: 0.4 },
      landscape: false,
    });
    fs.writeFileSync(saveRes.filePath, pdfBuf);
    return { ok: true, path: saveRes.filePath };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
  }
});

// Render an HTML snippet in an isolated hidden BrowserWindow and capture it
// as PNG bytes. The window opens tall (we don't know final content height
// up front), then we measure the actual rendered bounds and resize + capture
// to fit. Prevents bottom cutoff when the isolated render re-flows slightly
// differently than the live DOM.
ipcMain.handle('export:capture-html', async (_e, { html, width = 900, height = 500 } = {}) => {
  let win;
  try {
    // Create with a generous initial height; real size comes from the page.
    win = new BrowserWindow({
      show: false,
      width,
      height: Math.max(height, 1200),
      webPreferences: { offscreen: false, sandbox: true, contextIsolation: true },
      backgroundColor: '#0d0d14',
      useContentSize: true,
    });
    const dataUrl = 'data:text/html;charset=utf-8;base64,' + Buffer.from(String(html ?? ''), 'utf8').toString('base64');
    await win.loadURL(dataUrl);

    // Wait for fonts + two rAFs so layout is fully committed before measuring.
    // Measure the wrapper frame directly — do NOT fall back to
    // documentElement.scrollHeight, which clamps to the viewport height (so
    // a 1200px-tall initial window reports scrollHeight=1200 even when the
    // actual content is ~280px, padding the capture with empty space).
    const { w: contentW, h: contentH } = await win.webContents.executeJavaScript(`
      (async () => {
        if (document.fonts && document.fonts.ready) {
          try { await document.fonts.ready; } catch {}
        }
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const el = document.querySelector('.frame') || document.body.firstElementChild || document.body;
        const r = el.getBoundingClientRect();
        return { w: Math.ceil(r.width), h: Math.ceil(r.height) };
      })()
    `);

    // Resize the window so capturePage's default "whole visible page"
    // captures the full content with no bottom cutoff.
    win.setContentSize(Math.max(1, contentW), Math.max(1, contentH));
    // Give the resize one frame to settle.
    await new Promise((r) => setTimeout(r, 120));

    const img = await win.webContents.capturePage({
      x: 0, y: 0,
      width: contentW,
      height: contentH,
    });
    return { ok: true, bytes: img.toPNG() };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
  }
});

// Capture a rectangle of the current web page as PNG bytes. Native to
// Chromium via webContents.capturePage — works for any mix of HTML / SVG /
// CSS without html2canvas-style fidelity loss. Returns a Buffer.
ipcMain.handle('export:capture-region', async (e, rect) => {
  try {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return { ok: false, error: 'no_window' };
    const img = rect && rect.width && rect.height
      ? await win.webContents.capturePage({
          x: Math.max(0, Math.floor(rect.x)),
          y: Math.max(0, Math.floor(rect.y)),
          width: Math.ceil(rect.width),
          height: Math.ceil(rect.height),
        })
      : await win.webContents.capturePage();
    return { ok: true, bytes: img.toPNG() };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

// Save a binary buffer (e.g. PNG bytes) to a user-chosen location.
ipcMain.handle('export:save-binary', async (e, { suggestedName, bytes, filters } = {}) => {
  try {
    const parent = BrowserWindow.fromWebContents(e.sender) || BrowserWindow.getFocusedWindow();
    const defaultPath = path.join(app.getPath('downloads'), suggestedName || 'tokenly-export.png');
    const res = await dialog.showSaveDialog(parent, {
      title: 'Save file',
      defaultPath,
      filters: filters || [{ name: 'PNG', extensions: ['png'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    fs.writeFileSync(res.filePath, buf);
    return { ok: true, path: res.filePath };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

// Save N binary files to a user-chosen folder. Used for PNG-per-chart export.
ipcMain.handle('export:save-bundle', async (e, { files, title } = {}) => {
  try {
    const parent = BrowserWindow.fromWebContents(e.sender) || BrowserWindow.getFocusedWindow();
    const res = await dialog.showOpenDialog(parent, {
      title: title || 'Choose a folder for the charts',
      defaultPath: app.getPath('downloads'),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths?.length) return { ok: false, canceled: true };
    const dir = res.filePaths[0];
    const written = [];
    for (const f of (files || [])) {
      if (!f?.name || !f?.bytes) continue;
      const safe = String(f.name).replace(/[^\w.\-]+/g, '_');
      const p = path.join(dir, safe);
      fs.writeFileSync(p, Buffer.isBuffer(f.bytes) ? f.bytes : Buffer.from(f.bytes));
      written.push(p);
    }
    return { ok: true, dir, count: written.length };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

// Save a string buffer to a user-chosen location. Used by ExportSheet for
// CSV / JSON export. Returns { ok, path?, canceled?, error? }.
ipcMain.handle('export:save-file', async (e, { suggestedName, content, format } = {}) => {
  try {
    const win = BrowserWindow.fromWebContents(e.sender) || BrowserWindow.getFocusedWindow();
    const ext = format === 'json' ? 'json' : 'csv';
    const filters = format === 'json'
      ? [{ name: 'JSON', extensions: ['json'] }]
      : [{ name: 'CSV', extensions: ['csv'] }];
    const defaultPath = path.join(app.getPath('downloads'), suggestedName || `tokenly-export.${ext}`);
    const res = await dialog.showSaveDialog(win, {
      title: 'Export Tokenly data',
      defaultPath,
      filters,
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(res.filePath, String(content ?? ''), 'utf8');
    return { ok: true, path: res.filePath };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

// Serialize pricing tables for the renderer. Remote tables already have
// string `match` fields; bundled tables use RegExp objects, which must be
// converted to their `.source` string before crossing the IPC boundary.
function getPricingTablesForRenderer() {
  if (remotePricing) {
    return {
      source: 'remote',
      updated_at: remotePricing.updated_at,
      fetched_at: lastPricingFetchAt,
      providers: remotePricing.providers,
    };
  }
  const serialize = (arr) => arr.map((r) => ({
    label: r.label, match: r.match.source, input: r.input, output: r.output,
  }));
  return {
    source: 'bundled',
    updated_at: null,
    fetched_at: 0,
    providers: {
      claude: {
        multipliers: { cache_5m_write: 1.25, cache_1h_write: 2.0, cache_read: 0.1 },
        default: { input: 3, output: 15 },
        models: serialize(CLAUDE_PRICING),
      },
      openai: {
        multipliers: { cache_read: 0.1, reasoning_included_in_output: true },
        default: { input: 2.50, output: 10 },
        models: serialize(OPENAI_PRICING),
      },
      gemini: {
        multipliers: { cache_read: 0.25, thoughts_as_output: true, tool_as_input: true },
        default: { input: 0.30, output: 2.50 },
        models: serialize(GEMINI_PRICING),
      },
    },
  };
}
ipcMain.handle('pricing:get-tables', () => getPricingTablesForRenderer());
ipcMain.handle('pricing:refresh', async () => {
  const result = await fetchRemotePricing();
  return { ...result, tables: getPricingTablesForRenderer() };
});

// ---------------------------------------------------------------------------
// Budget alerts (v1: daily $ budgets for API-billed providers only)
// ---------------------------------------------------------------------------
// The renderer owns evaluation since it already holds fresh usage data. Main
// process only:
//   - persists budgets to ~/Library/Application Support/Tokenly/budgets.json
//   - dedupes alerts against ~/Library/Application Support/Tokenly/alerts.json
//   - fires native macOS notifications (and prunes stale ledger entries)
//
// Budget scope: daily thresholds. Thresholds are evaluated against the
// rolling per-day cost trend that every API fetcher emits.

const DEFAULT_BUDGETS = {
  enabled: true,
  thresholds: [0.5, 0.8, 1.0],
  daily: {},                // { openai, anthropic, openrouter, _overall }
  summary: { enabled: true, hour: 17 }, // local 5pm
};

function budgetsPath()    { return path.join(app.getPath('userData'), 'budgets.json'); }
function alertLedgerPath(){ return path.join(app.getPath('userData'), 'alerts.json'); }

function loadBudgets() {
  try {
    const p = budgetsPath();
    if (!fs.existsSync(p)) return { ...DEFAULT_BUDGETS };
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      ...DEFAULT_BUDGETS,
      ...data,
      daily: { ...(data.daily || {}) },
      summary: { ...DEFAULT_BUDGETS.summary, ...(data.summary || {}) },
    };
  } catch {
    return { ...DEFAULT_BUDGETS };
  }
}

function saveBudgets(budgets) {
  try {
    fs.writeFileSync(budgetsPath(), JSON.stringify(budgets, null, 2));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

function loadAlertLedger() {
  try {
    const p = alertLedgerPath();
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8')) || {};
  } catch { return {}; }
}

function saveAlertLedger(ledger) {
  // Prune entries older than 14 days so the ledger doesn't grow unbounded.
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const pruned = {};
  for (const [k, v] of Object.entries(ledger)) {
    if (Number(v) >= cutoff) pruned[k] = v;
  }
  try { fs.writeFileSync(alertLedgerPath(), JSON.stringify(pruned)); } catch {}
  return pruned;
}

function fireNotification(title, body, { urgent = false } = {}) {
  try {
    if (!Notification.isSupported()) return false;
    const n = new Notification({
      title,
      body,
      silent: !urgent,
    });
    n.show();
    return true;
  } catch (e) {
    console.warn('[alerts] notification failed:', e?.message || e);
    return false;
  }
}

ipcMain.handle('budgets:get', () => loadBudgets());

ipcMain.handle('budgets:set', (_e, budgets) => {
  if (!budgets || typeof budgets !== 'object') return { ok: false, error: 'invalid' };
  return saveBudgets(budgets);
});

// Renderer sends an array of candidate alerts; main filters already-fired
// ones against the ledger and shows notifications for the rest.
// Each alert: { key, title, body, severity: 'info' | 'warn' | 'critical' }
ipcMain.handle('alerts:maybe-fire', (_e, alerts) => {
  if (!Array.isArray(alerts) || alerts.length === 0) return { fired: 0 };
  const ledger = loadAlertLedger();
  let fired = 0;
  for (const a of alerts) {
    if (!a || typeof a.key !== 'string') continue;
    if (ledger[a.key]) continue;
    const urgent = a.severity === 'critical';
    if (fireNotification(a.title || 'Tokenly', a.body || '', { urgent })) {
      ledger[a.key] = Date.now();
      fired++;
    }
  }
  if (fired > 0) saveAlertLedger(ledger);
  return { fired };
});

// Daily spend summary — fired at most once per local calendar day. Dedupe key
// is built from today's YYYY-MM-DD in the local timezone.
ipcMain.handle('alerts:maybe-fire-summary', (_e, payload) => {
  if (!payload || typeof payload !== 'object') return { fired: false };
  const now = new Date();
  const localDay = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
  const key = `summary:${localDay}`;
  const ledger = loadAlertLedger();
  if (ledger[key]) return { fired: false, reason: 'already_fired_today' };
  const ok = fireNotification(payload.title || 'Today\'s AI spend', payload.body || '');
  if (!ok) return { fired: false, reason: 'notification_unavailable' };
  ledger[key] = Date.now();
  saveAlertLedger(ledger);
  return { fired: true };
});

// ---------------------------------------------------------------------------
// Tokenly Max license (paywall for API sources + budget alerts)
// ---------------------------------------------------------------------------
// Storage: ~/Library/Application Support/Tokenly/license.json
// Tier model: 'free' (default) | 'max' (unlocked) | 'max-ai' (unlocked + AI).
//
// Free keeps the three local sources (Claude Code, Codex CLI, Gemini CLI),
// Settings, and the read-only pricing sheet. Max unlocks OpenAI API,
// Anthropic API, OpenRouter, and budget alerts. Max + AI is a monthly
// subscription that adds Tokenly Chat (text + web search + voice).
//
// Activation: the renderer passes a Stripe identifier (one-time checkout
// session_id for max, subscription session_id or sub_id for max-ai). We POST
// it to the Netlify edge function at /api/license/verify, which calls Stripe
// directly and returns the license metadata on a paid, non-refunded session.

const VALID_TIERS = new Set(['max', 'max-ai']);

function licensePath() { return path.join(app.getPath('userData'), 'license.json'); }

// Maximum time we'll trust a cached license without server confirmation.
// Background re-verify normally runs every 24h; this allows up to a week of
// offline use (travel, flaky wifi) before forcing a re-check. Without this
// cap, a refunded license could keep working indefinitely as long as the
// machine never reaches Stripe again.
const LICENSE_OFFLINE_GRACE_MS = 7 * 24 * 3600 * 1000;

function loadLicense() {
  try {
    const p = licensePath();
    if (!fs.existsSync(p)) return null;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!data || !VALID_TIERS.has(data.tier) || !data.session_id) return null;
    // Offline-grace cap. last_verified_at is set on activate AND on every
    // successful background re-verify, so this only triggers when the user
    // has been offline (or the server has been unreachable) for >7 days.
    // Field-missing case: legacy licenses pre-dating this field (none in
    // production yet) will skip the check — they'll get covered on next
    // successful re-verify.
    if (data.last_verified_at && Date.now() - data.last_verified_at > LICENSE_OFFLINE_GRACE_MS) {
      return null;
    }
    return data;
  } catch {}
  return null;
}

function saveLicense(license) {
  try {
    // Atomic write + 0o600 to match the OAuth credentials pattern. Prevents
    // partial-write states (e.g. crash mid-write) and keeps the license file
    // unreadable by other users on shared machines.
    const tmp = licensePath() + '.tokenly.tmp';
    fs.writeFileSync(tmp, JSON.stringify(license, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, licensePath());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

ipcMain.handle('license:get', () => {
  const lic = loadLicense();
  return { tier: lic ? lic.tier : 'free', license: lic };
});

const LICENSE_VERIFY_URL = 'https://trytokenly.app/api/license/verify';

ipcMain.handle('license:activate', async (_e, code) => {
  const trimmed = String(code || '').trim();
  if (!trimmed) return { ok: false, reason: 'empty_code' };
  if (!/^cs_(test|live)_[a-zA-Z0-9]{4,}$/.test(trimmed)) {
    return { ok: false, reason: 'invalid_format' };
  }
  try {
    const res = await fetch(LICENSE_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `Tokenly/${app.getVersion()}`,
      },
      body: JSON.stringify({ session_id: trimmed }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok || !VALID_TIERS.has(body?.tier)) {
      return { ok: false, reason: body?.reason || ('http_' + res.status) };
    }
    const license = {
      tier: body.tier,
      session_id: trimmed,
      activated_at: Date.now(),
      email: body.email || null,
      purchased_at: body.purchased_at || null,
      subscription_id: body.subscription_id || null,
      last_verified_at: Date.now(),
      verify_source: 'stripe',
    };
    const saved = saveLicense(license);
    if (!saved.ok) return { ok: false, reason: 'save_failed', error: saved.error };
    return { ok: true, tier: license.tier, license };
  } catch (e) {
    return { ok: false, reason: 'network', error: String(e?.message || e) };
  }
});

ipcMain.handle('license:deactivate', () => {
  try {
    if (fs.existsSync(licensePath())) fs.unlinkSync(licensePath());
    return { ok: true, tier: 'free' };
  } catch (e) {
    // Surface the failure for symmetry with saveLicense — silent ok=true
    // here would let the renderer claim "deactivated" while the file still
    // existed and the next launch would re-load the old tier.
    return { ok: false, reason: 'unlink_failed', error: String(e?.message || e) };
  }
});

// Background re-verify. Fires 20s after launch (give the app time to settle)
// and every 24h thereafter. Downgrades the app to Free if Stripe reports the
// session as refunded/invalid. Network errors are silently ignored so a
// paying user isn't locked out by a flaky wifi moment.
async function backgroundVerifyLicense() {
  const lic = loadLicense();
  if (!lic || !lic.session_id) return;
  try {
    const res = await fetch(LICENSE_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `Tokenly/${app.getVersion()}`,
      },
      body: JSON.stringify({ session_id: lic.session_id }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => ({}));
    const REVOKE_REASONS = new Set(['refunded', 'not_paid', 'invalid_session', 'invalid_format', 'subscription_canceled', 'subscription_past_due']);
    if (body && body.ok && VALID_TIERS.has(body.tier)) {
      // Server can also upgrade/downgrade tier (e.g. user upgraded from max to max-ai).
      saveLicense({ ...lic, tier: body.tier, last_verified_at: Date.now() });
      return;
    }
    if (body && body.ok === false && REVOKE_REASONS.has(body.reason)) {
      console.log('[license] revoked by re-verify:', body.reason);
      try { if (fs.existsSync(licensePath())) fs.unlinkSync(licensePath()); } catch {}
      // Order is intentional: unlink first, broadcast second. A concurrent
      // license:get IPC call landing between the two reads from disk and
      // sees the file is gone, so it returns tier=free — i.e. it observes
      // the same state we're about to broadcast. No race window where a
      // caller could see a stale "still paid" view.
      for (const w of BrowserWindow.getAllWindows()) {
        try { w.webContents.send('license-changed', { tier: 'free', license: null, reason: body.reason }); } catch {}
      }
    }
    // Everything else (server_misconfigured, http_5xx, etc.) — no-op. Trust
    // the cached license until the server can give a definitive revoke.
  } catch (err) {
    // Network / timeout / abort — no-op.
  }
}

function setupLicenseReverify() {
  setTimeout(() => backgroundVerifyLicense().catch(() => {}), 20_000);
  setInterval(() => backgroundVerifyLicense().catch(() => {}), 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Provider status — Statuspage.io feed for OpenAI / Anthropic / OpenRouter.
// Cached 5min in memory. Returned as `status` on every usage payload so the
// renderer can show an incident pill on affected cards.
// Gemini uses Google Workspace's incidents.json which has a different shape;
// deferred until the Gemini OAuth pass.
// ---------------------------------------------------------------------------

const STATUS_ENDPOINTS = {
  'claude-code': 'https://status.anthropic.com/api/v2/status.json',
  'codex':       'https://status.openai.com/api/v2/status.json',
  'openai':      'https://status.openai.com/api/v2/status.json',
  'anthropic':   'https://status.anthropic.com/api/v2/status.json',
  // 'openrouter' uses a hand-rolled status page (not Statuspage.io) and has
  // no JSON feed — link-only, same as CodexBar.
  // 'gemini-cli' uses Google Workspace's incidents.json with a different
  // shape — deferred until Phase 2.
};

const STATUS_TTL_MS = 5 * 60 * 1000;
const statusCache = new Map(); // url -> { ts, data }

async function fetchProviderStatus(provider) {
  const url = STATUS_ENDPOINTS[provider];
  if (!url) return null;

  const cached = statusCache.get(url);
  if (cached && Date.now() - cached.ts < STATUS_TTL_MS) return cached.data;

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 4000);
  let res;
  try {
    res = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: ctrl.signal });
  } catch { clearTimeout(timeout); return cached ? cached.data : null; }
  clearTimeout(timeout);
  if (!res || !res.ok) return cached ? cached.data : null;

  let body;
  try { body = await res.json(); } catch { return cached ? cached.data : null; }

  // Statuspage.io shape: { page: {...}, status: { indicator, description } }
  // indicator ∈ "none" | "minor" | "major" | "critical" | "maintenance"
  const s = body && body.status;
  if (!s || typeof s !== 'object') return cached ? cached.data : null;

  const data = {
    indicator: String(s.indicator || 'none'),
    description: String(s.description || ''),
    pageUrl: (body.page && body.page.url) || null,
    fetchedAt: Date.now(),
  };
  statusCache.set(url, { ts: Date.now(), data });
  return data;
}

async function fetchUsage(provider, key, days) {
  const now = Math.floor(Date.now() / 1000);
  const start = now - days * 86400;
  if (provider === 'claude-code') {
    // Run local JSONL scan + Claude Pro/Max OAuth quota in parallel. OAuth is
    // strictly additive — null on any failure (no creds, expired, network).
    const [local, quota] = await Promise.all([
      fetchClaudeCodeLocal(days),
      fetchClaudeOAuthQuota().catch(() => null),
    ]);
    return quota ? { ...local, quota } : local;
  }
  if (provider === 'codex') {
    // Same pattern as claude-code — local rollout scan + ChatGPT/Codex OAuth
    // window + credits via the private /backend-api/wham/usage endpoint.
    // OAuth response replaces the rollout-derived rateLimits when present
    // (it's authoritative and has the credits balance + plan name).
    const [local, quota] = await Promise.all([
      fetchCodexLocal(days),
      fetchCodexOAuthQuota().catch(() => null),
    ]);
    return quota ? { ...local, quota } : local;
  }
  if (provider === 'gemini-cli') {
    // Local CLI rollout + Gemini Code Assist OAuth quota.
    const [local, quota] = await Promise.all([
      fetchGeminiCLILocal(days),
      fetchGeminiOAuthQuota().catch(() => null),
    ]);
    return quota ? { ...local, quota } : local;
  }
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
  const byDayDetail = new Map();
  let inTok = 0, outTok = 0, cached = 0, req = 0;
  for (const page of uR.pages) for (const bucket of page.data || []) {
    const dayKey = bucket.start_time;
    let dayTokens = 0;
    const det = byDayDetail.get(dayKey) || { input: 0, output: 0, cached: 0, requests: 0, cost: 0 };
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

      det.input    += r.input_tokens         || 0;
      det.output   += r.output_tokens        || 0;
      det.cached   += r.input_cached_tokens  || 0;
      det.requests += r.num_model_requests   || 0;
    }
    byDayDetail.set(dayKey, det);
    trend.set(dayKey, (trend.get(dayKey) || 0) + dayTokens);
  }

  let totalCost = 0;
  const byLineItem = {};
  const costByDay = new Map();
  if (!cR.error) {
    for (const page of cR.pages) for (const bucket of page.data || []) {
      const bucketDayKey = bucket.start_time;
      let bucketCost = 0;
      for (const r of bucket.results || []) {
        const amt = Number((r.amount && r.amount.value) || 0);
        if (!Number.isFinite(amt)) continue;
        totalCost += amt;
        bucketCost += amt;
        const li = r.line_item || 'other';
        byLineItem[li] = (byLineItem[li] || 0) + amt;
      }
      costByDay.set(bucketDayKey, (costByDay.get(bucketDayKey) || 0) + bucketCost);
    }
  }

  // Fold per-day cost into the detail so exports carry a full breakdown.
  for (const [dayKey, amt] of costByDay.entries()) {
    const det = byDayDetail.get(dayKey) || { input: 0, output: 0, cached: 0, requests: 0, cost: 0 };
    det.cost = amt;
    byDayDetail.set(dayKey, det);
  }

  const sortedTrend = [...trend.entries()].sort(([a], [b]) => a - b).map(([_, v]) => v);
  const sortedCostTrend = [...costByDay.entries()].sort(([a], [b]) => a - b).map(([_, v]) => v);
  // OpenAI's bucket keys are Unix timestamp seconds — normalize to ISO date for export.
  const dailyBreakdown = [...byDayDetail.entries()]
    .sort(([a], [b]) => a - b)
    .map(([k, v]) => ({
      date: new Date(Number(k) * 1000).toISOString().slice(0, 10),
      ...v,
    }));

  return {
    totals: { input: inTok, output: outTok, cached, requests: req, cost: totalCost, currency: 'USD' },
    models: Object.values(byModel).sort((a, b) => (b.input + b.output) - (a.input + a.output)),
    lineItems: Object.entries(byLineItem).sort((a, b) => b[1] - a[1]).map(([name, cost]) => ({ name, cost })),
    trend: sortedTrend,
    costTrend: sortedCostTrend,
    dailyBreakdown,
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
  const byDayDetail = new Map();
  let inTok = 0, outTok = 0, cacheIn = 0, cacheRead = 0, req = 0;
  for (const page of uR.pages) for (const bucket of page.data || []) {
    const dayKey = bucket.starting_at;
    let dayTokens = 0;
    const det = byDayDetail.get(dayKey) || { input: 0, output: 0, cache_creation: 0, cache_read: 0, requests: 0, cost: 0 };
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

      det.input          += r.uncached_input_tokens       || 0;
      det.output         += r.output_tokens               || 0;
      det.cache_creation += r.cache_creation_input_tokens || 0;
      det.cache_read     += r.cache_read_input_tokens     || 0;
    }
    byDayDetail.set(dayKey, det);
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
  const costByDay = new Map();
  if (!cR.error) {
    const seenBuckets = new Set();
    for (const page of cR.pages) for (const bucket of page.data || []) {
      const key = bucket.starting_at;
      if (seenBuckets.has(key)) continue;
      seenBuckets.add(key);
      let bucketCost = 0;
      for (const r of bucket.results || []) {
        bucketCost += readAmount(r.amount);
      }
      totalCost += bucketCost;
      costByDay.set(key, (costByDay.get(key) || 0) + bucketCost);
    }
  }

  // Fold per-day cost into the detail so exports carry a full breakdown.
  for (const [dayKey, amt] of costByDay.entries()) {
    const det = byDayDetail.get(dayKey) || { input: 0, output: 0, cache_creation: 0, cache_read: 0, requests: 0, cost: 0 };
    det.cost = amt;
    byDayDetail.set(dayKey, det);
  }

  const sortedTrend = [...trend.entries()].sort().map(([_, v]) => v);
  const sortedCostTrend = [...costByDay.entries()].sort().map(([_, v]) => v);
  const dailyBreakdown = [...byDayDetail.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => ({
      date: String(k).slice(0, 10),
      ...v,
    }));

  return {
    totals: { input: inTok, output: outTok, cache_creation: cacheIn, cache_read: cacheRead, requests: req, cost: totalCost, currency: 'USD' },
    models: Object.values(byModel).sort((a, b) => (b.input + b.output + b.cache_read) - (a.input + a.output + a.cache_read)),
    trend: sortedTrend,
    costTrend: sortedCostTrend,
    dailyBreakdown,
    windowDays: days,
    note: null,
  };
}

async function fetchOpenRouter(key, days) {
  // /key enrichment must not block credits/activity if OpenRouter is slow.
  const keyAbort = new AbortController();
  const keyTimeout = setTimeout(() => keyAbort.abort(), 1000);

  // Fetch activity + credits balance + key info in parallel.
  const [res, credRes, keyRes] = await Promise.all([
    fetch('https://openrouter.ai/api/v1/activity', {
      headers: { Authorization: `Bearer ${key}` },
    }),
    fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${key}` },
    }).catch(() => null),
    fetch('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${key}` },
      signal: keyAbort.signal,
    }).catch(() => null),
  ]);
  clearTimeout(keyTimeout);

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

  // /key returns per-API-key spend cap + rate-limit info. All non-fatal.
  // Shape: { data: { limit: number|null, usage: number, rate_limit: { requests, interval } } }
  let keyQuota = null;
  let rateLimit = null;
  if (keyRes && keyRes.ok) {
    try {
      const kb = await keyRes.json();
      const d = kb.data || kb;
      if (d && typeof d === 'object') {
        const limit = Number(d.limit);
        const usage = Number(d.usage);
        if (Number.isFinite(limit) && limit > 0 && Number.isFinite(usage) && usage >= 0) {
          keyQuota = {
            limit,
            usage,
            remaining: Math.max(0, limit - usage),
            usedPercent: Math.min(100, (usage / limit) * 100),
            currency: 'USD',
          };
        }
        if (d.rate_limit && typeof d.rate_limit === 'object') {
          const reqs = Number(d.rate_limit.requests);
          const interval = String(d.rate_limit.interval || '');
          if (Number.isFinite(reqs) && reqs > 0 && interval) {
            rateLimit = { requests: reqs, interval };
          }
        }
      }
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
  const costByDay = new Map();
  const byDayDetail = new Map();
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
    const rowCost = Number(r.usage) || 0;
    totalCost += rowCost;
    const dayTokens = (r.prompt_tokens || 0) + (r.completion_tokens || 0);
    trend.set(r.date, (trend.get(r.date) || 0) + dayTokens);
    costByDay.set(r.date, (costByDay.get(r.date) || 0) + rowCost);

    const det = byDayDetail.get(r.date) || { input: 0, output: 0, reasoning: 0, requests: 0, cost: 0 };
    det.input     += r.prompt_tokens     || 0;
    det.output    += r.completion_tokens || 0;
    det.reasoning += r.reasoning_tokens  || 0;
    det.requests  += r.requests          || 0;
    det.cost      += rowCost;
    byDayDetail.set(r.date, det);
  }

  const sortedTrend = [...trend.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([_, v]) => v);
  const sortedCostTrend = [...costByDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([_, v]) => v);
  const dailyBreakdown = [...byDayDetail.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));
  const effectiveDays = Math.min(days, 30);

  return {
    totals: { input: inTok, output: outTok, reasoning: reasoningTok, requests: req, cost: totalCost, currency: 'USD' },
    models: Object.values(byModel).sort((a, b) => (b.input + b.output) - (a.input + a.output)),
    trend: sortedTrend,
    costTrend: sortedCostTrend,
    dailyBreakdown,
    windowDays: effectiveDays,
    balance,
    keyQuota,
    rateLimit,
    note: days > 30 ? 'OpenRouter only exposes the last 30 completed UTC days.' : null,
  };
}

// ---------------------------------------------------------------------------
// Claude Code — local JSONL scanner. Reads ~/.claude/projects/**/*.jsonl which
// Claude Code (CLI) and the Claude desktop app write per assistant turn. This
// gives us real-time, per-message token usage with no API key required.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Remote pricing table (ships independently of the app binary)
// ---------------------------------------------------------------------------
// Rates change more often than we cut releases. pricing.json on trytokenly.app
// holds the authoritative table. The app fetches on launch + every 24h and
// caches to disk. The bundled CLAUDE_PRICING / OPENAI_PRICING / GEMINI_PRICING
// arrays below remain as the permanent fallback if network + disk cache are
// both unavailable.
//
// Lookup order: remote in-memory → disk cache → bundled defaults.

const REMOTE_PRICING_URL = 'https://trytokenly.app/pricing.json';
const PRICING_SCHEMA_VERSION = 1;

let remotePricing = null;
let lastPricingFetchAt = 0;

function pricingCachePath() {
  return path.join(app.getPath('userData'), 'pricing.json');
}

// Reject malformed or hostile pricing payloads BEFORE they're cached or used
// for cost math. We control the server but the disk cache survives a server
// compromise — and the cost math has no further sanity checks downstream
// (negative rates would silently produce negative costs, undefined defaults
// would crash chat:stream). Strict validation here is the trust boundary.
function validatePricingPayload(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.schema_version !== PRICING_SCHEMA_VERSION) return false;
  if (!data.providers || typeof data.providers !== 'object') return false;

  const isNonNegFinite = (n) => Number.isFinite(n) && n >= 0;
  const isValidRate = (row) =>
    row && typeof row === 'object' &&
    isNonNegFinite(Number(row.input)) &&
    isNonNegFinite(Number(row.output));

  for (const k of ['claude', 'openai', 'gemini']) {
    const p = data.providers[k];
    if (!p || typeof p !== 'object') return false;
    if (!Array.isArray(p.models)) return false;
    // Every model row must have a string match + non-negative finite rates.
    // Bad rows would later short-circuit cost math to a wrong dollar value.
    for (const row of p.models) {
      if (!row || typeof row.match !== 'string') return false;
      if (!isValidRate(row)) return false;
    }
    // Default block is required (chat path falls back to {0,0} defensively
    // but the canonical contract is that the server always ships a default).
    if (!isValidRate(p.default)) return false;
    // Multipliers are optional, but if present every value must be a
    // non-negative finite number — masks server-side typos like
    // multipliers.cache_read = "yes".
    if (p.multipliers != null) {
      if (typeof p.multipliers !== 'object') return false;
      for (const v of Object.values(p.multipliers)) {
        // Booleans (e.g. multipliers.thoughts_as_output) are allowed pass-through.
        if (typeof v === 'boolean') continue;
        if (!isNonNegFinite(Number(v))) return false;
      }
    }
  }
  return true;
}

function loadPricingFromDisk() {
  try {
    const p = pricingCachePath();
    if (!fs.existsSync(p)) return;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (validatePricingPayload(data)) {
      remotePricing = data;
      console.log('[pricing] loaded disk cache, updated_at=', data.updated_at);
    }
  } catch (e) {
    console.warn('[pricing] disk cache read failed:', e?.message || e);
  }
}

async function fetchRemotePricing() {
  try {
    const res = await fetch(REMOTE_PRICING_URL, {
      headers: { 'User-Agent': `Tokenly/${app.getVersion()}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { ok: false, reason: 'http_' + res.status };
    const data = await res.json();
    if (!validatePricingPayload(data)) return { ok: false, reason: 'invalid_schema' };
    remotePricing = data;
    lastPricingFetchAt = Date.now();
    try { fs.writeFileSync(pricingCachePath(), JSON.stringify(data)); } catch {}
    console.log('[pricing] refreshed, updated_at=', data.updated_at);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: 'network', error: String(e?.message || e) };
  }
}

function setupPricingRefresh() {
  loadPricingFromDisk();
  setTimeout(() => fetchRemotePricing().catch(() => {}), 8_000);
  setInterval(() => fetchRemotePricing().catch(() => {}), 24 * 60 * 60 * 1000);
}

// Per-provider default cache-read multipliers, applied when the loaded
// pricing payload doesn't specify multipliers.cache_read for the block.
// These match each provider's published rates as of April 2026 — used by
// BOTH the poll-path cost helpers (costFromUsage, costFromGeminiTokens)
// AND the chat-path costUSD via getCacheReadMul. Centralizing prevents
// the drift bug where the chat path silently picked up remote multiplier
// updates while the poll path stayed on a hardcoded value, or vice versa.
//
// Note on openai: 0.1 matches the bundled fallback in
// getPricingTablesForRenderer; the actual per-model rates vary (gpt-4o
// 0.5×, mini 0.25×, o-series 0.5×). H2 from the pricing review proposes
// per-row overrides on each model entry — separate PR.
const DEFAULT_CACHE_READ_MUL = {
  claude: 0.1,
  openai: 0.1,
  gemini: 0.25,
};

// Single source of truth for the cache-read multiplier across poll path
// and chat path. Reads remotePricing[provider].multipliers.cache_read when
// available and finite/non-negative; otherwise the per-provider default.
// Caller passes the internal provider key ('claude' | 'openai' | 'gemini').
function getCacheReadMul(providerKey) {
  if (remotePricing) {
    const m = Number(remotePricing.providers?.[providerKey]?.multipliers?.cache_read);
    if (Number.isFinite(m) && m >= 0) return m;
  }
  return DEFAULT_CACHE_READ_MUL[providerKey] ?? 0.1;
}

// Look up a remote rate row for a provider/model. Returns null if no remote
// data is loaded or no row matches — caller falls back to bundled defaults.
function remotePriceFor(providerKey, modelName) {
  if (!remotePricing) return null;
  const provider = remotePricing.providers?.[providerKey];
  if (!provider || !Array.isArray(provider.models)) return null;
  // Defense in depth: validatePricingPayload already rejects negative/NaN
  // rates and required default blocks, but reject anything that slips
  // through (older cached payload from before the strict validator,
  // edge cases) so we never multiply tokens by a bad number.
  const isNonNegFinite = (n) => Number.isFinite(n) && n >= 0;
  const m = String(modelName || '');
  for (const row of provider.models) {
    if (typeof row.match !== 'string') continue;
    try {
      if (new RegExp(row.match).test(m)) {
        const input = Number(row.input), output = Number(row.output);
        if (isNonNegFinite(input) && isNonNegFinite(output)) return { input, output };
      }
    } catch { /* malformed regex on remote row; skip */ }
  }
  const d = provider.default;
  if (d) {
    const input = Number(d.input), output = Number(d.output);
    if (isNonNegFinite(input) && isNonNegFinite(output)) return { input, output };
  }
  return null;
}

// Open the pricing sheet from the tray. Ensures the popover is visible, then
// tells the renderer to open the sheet.
function openPricingFromTray() {
  try {
    if (typeof togglePopover === 'function' && (!popoverWin || !popoverWin.isVisible())) {
      togglePopover();
    }
  } catch {}
  setTimeout(() => {
    for (const w of BrowserWindow.getAllWindows()) {
      try { w.webContents.send('open-pricing'); } catch {}
    }
  }, 80);
}

async function refreshPricingInteractive() {
  const result = await fetchRemotePricing();
  if (result.ok) {
    dialog.showMessageBox({
      type: 'info',
      message: 'Pricing tables refreshed.',
      detail: `Rates as of ${result.data.updated_at}`,
      buttons: ['OK'],
    });
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('refresh-now');
  } else {
    dialog.showErrorBox('Pricing refresh failed',
      `Using last cached rates. Reason: ${result.reason}`);
  }
}

// Per-million-token USD pricing for Claude models (standard tier).
// Cache write = 1.25x input (5m) or 2x input (1h). Cache read = 0.1x input.
// Bundled as a permanent fallback — the remote table above is authoritative.
const CLAUDE_PRICING = [
  // Opus 4.5+ reduced price to $5/$25 (down from $15/$75 on Opus 3).
  { label: 'Opus 4.5+',         match: /^claude-opus-4-[5-9]/, input: 5,    output: 25 },
  { label: 'Opus 4 (pre-4.5)',  match: /^claude-opus-4/,       input: 5,    output: 25 },
  { label: 'Sonnet 4',          match: /^claude-sonnet-4/,     input: 3,    output: 15 },
  { label: 'Haiku 4.5',         match: /^claude-haiku-4-5/,    input: 1,    output: 5 },
  { label: 'Haiku 4 (pre-4.5)', match: /^claude-haiku-4/,      input: 0.8,  output: 4 },
  { label: 'Claude 3.7 Sonnet', match: /^claude-3-7-sonnet/,   input: 3,    output: 15 },
  { label: 'Claude 3.5 Sonnet', match: /^claude-3-5-sonnet/,   input: 3,    output: 15 },
  { label: 'Claude 3.5 Haiku',  match: /^claude-3-5-haiku/,    input: 0.8,  output: 4 },
  { label: 'Claude 3 Opus',     match: /^claude-3-opus/,       input: 15,   output: 75 },
  { label: 'Claude 3 Haiku',    match: /^claude-3-haiku/,      input: 0.25, output: 1.25 },
];
function priceFor(model) {
  const remote = remotePriceFor('claude', model);
  if (remote) return remote;
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
  // Cache-read multiplier sourced from the shared helper so the poll path
  // and chat-path costUSD stay in lockstep — see getCacheReadMul / H1.
  const cacheRead = (u.cache_read_input_tokens || 0) * getCacheReadMul('claude') * p.input / 1e6;
  return input + output + cacheCreation + cacheRead;
}

// Decode the encoded folder names Claude writes under ~/.claude/projects/ —
// e.g. "-Users-adowney-Documents-LLM-Usage-Dash" → "/Users/adowney/Documents/LLM Usage Dash".
// Best-effort: ambiguous when a real folder name contains a hyphen (we can't
// distinguish hyphen-as-separator from hyphen-as-literal). The embedded `cwd`
// field on event lines is preferred when present; this is just the fallback.
function decodeClaudeProjectFolder(name) {
  if (!name || typeof name !== 'string') return null;
  if (!name.startsWith('-')) return null;
  return name.replace(/-/g, '/');
}

// Project label = last meaningful path segment. "/Users/x/Documents/Mikey" → "Mikey".
// Falls back to the full path when basename is empty (root, etc).
function friendlyProjectName(cwd) {
  if (!cwd || typeof cwd !== 'string') return '(unknown)';
  const base = path.basename(cwd);
  return base || cwd;
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

// ---------------------------------------------------------------------------
// Claude OAuth quota — for Claude Pro/Max subscribers without an admin key.
// Reads OAuth credentials written by the Claude CLI (file or macOS Keychain
// item "Claude Code-credentials") and calls the same /api/oauth/usage
// endpoint the CLI uses to render `/usage`. Returns session (5h), weekly,
// model-specific quotas + plan tier. Strictly additive: any failure returns
// null and the local card data is shown unchanged.
// ---------------------------------------------------------------------------

const CLAUDE_CREDENTIALS_FILE = path.join(os.homedir(), '.claude', '.credentials.json');
const CLAUDE_KEYCHAIN_SERVICE = 'Claude Code-credentials';
const CLAUDE_OAUTH_REFRESH_URL = 'https://platform.claude.com/v1/oauth/token';
// Public OAuth client ID shipped with the open-source Claude Code CLI.
// Used only for refresh-token grants — no client secret needed (PKCE public client).
const CLAUDE_OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

// In-memory cache of refreshed Claude tokens keyed by the underlying refresh
// token. Anthropic ROTATES refresh tokens on every refresh (single-use OAuth
// security), so we MUST persist the new refresh token back to the Keychain
// or the next process launch will be stuck with an invalid refresh_token.
const claudeRefreshedTokenCache = new Map();

// De-dupes concurrent refreshes for the same refresh_token: Anthropic
// invalidates the old token on first use, so a parallel second POST 401s.
const claudeRefreshInflight = new Map();

// --- Test sketches for the inflight dedup (cannot run yet — main.js does not
// export refresh*OAuthToken; extract these helpers to their own module before
// wiring a real test runner). Keep here as the spec they need to satisfy.
//
// (a) Two concurrent callers share one fetch and one resolution:
//
//   let calls = 0; let release;
//   global.fetch = () => { calls++; return new Promise(r => { release = r; }); };
//   const p1 = refreshClaudeOAuthToken({ refreshToken: 'rt_abc' });
//   const p2 = refreshClaudeOAuthToken({ refreshToken: 'rt_abc' });
//   assert.equal(p1, p2);                                  // same Promise
//   release({ ok: true, json: async () => ({
//     access_token: 'at_new', refresh_token: 'rt_new',
//     expires_in: 28800, scope: 'user:profile' }) });
//   const [a, b] = await Promise.all([p1, p2]);
//   assert.equal(calls, 1);                                // single round-trip
//   assert.equal(a, b);                                    // same resolution
//
// (b) Failed fetch clears the inflight slot so the next call retries:
//
//   let calls = 0;
//   global.fetch = () => {
//     calls++;
//     if (calls === 1) return Promise.reject(new Error('ECONNRESET'));
//     return Promise.resolve({ ok: true, json: async () => ({
//       access_token: 'at_ok', refresh_token: 'rt_ok',
//       expires_in: 28800, scope: 'user:profile' }) });
//   };
//   const first = await refreshClaudeOAuthToken({ refreshToken: 'rt_xyz' });
//   assert.equal(first, null);                             // network error
//   const second = await refreshClaudeOAuthToken({ refreshToken: 'rt_xyz' });
//   assert.equal(calls, 2);                                // inflight cleared
//   assert.equal(second.accessToken, 'at_ok');
//
// Same shape applies to refreshCodexOAuthToken / codexRefreshInflight.

// Returns the macOS Keychain account name for the "Claude Code-credentials"
// item by parsing `security find-generic-password -g` output, or null if the
// item isn't present.
// Write a secret to the macOS Keychain WITHOUT putting it in argv. The
// `security add-generic-password -w "<secret>"` form puts the entire secret
// in argv, where any same-uid process can read it via `ps -wwww`. This
// helper instead pipes the command through `security -i` (interactive mode)
// over stdin, so the secret only crosses the pipe and never appears in
// argv. The caller must handle errors — we throw on non-zero exit so the
// existing try/catch flow in persistClaudeCredentials still works.
//
// Single-quote escape for the security CLI's shell-style command parser:
// any literal `'` becomes `'\''` (close-quote, escaped quote, reopen quote).
function writeKeychainSecret(service, account, secret) {
  const { spawnSync } = require('child_process');
  const esc = (s) => String(s).replace(/'/g, "'\\''");
  const cmd = `add-generic-password -U -s '${esc(service)}' -a '${esc(account)}' -w '${esc(secret)}'\n`;
  const result = spawnSync('/usr/bin/security', ['-i'], {
    input: cmd,
    encoding: 'utf8',
    timeout: 5000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const err = new Error(`security exited ${result.status}`);
    err.code = `security_exit_${result.status}`;
    err.stderr = result.stderr;
    throw err;
  }
}

function findClaudeKeychainAccount() {
  if (process.platform !== 'darwin') return null;
  const { execFileSync } = require('child_process');
  try {
    const out = execFileSync('/usr/bin/security',
      ['find-generic-password', '-s', CLAUDE_KEYCHAIN_SERVICE, '-g'],
      { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] });
    const m = out.match(/"acct"<blob>="([^"]*)"/);
    return m ? m[1] : null;
  } catch {
    // -g writes the password to stderr but exits 0; on failure we get a non-zero exit.
    return null;
  }
}

// Surface a single user-facing notification per (provider, error kind) per
// 24h when OAuth credential persistence fails. Without this, a refresh that
// rotates the token but fails to write back leaves the user silently locked
// out at next launch — they'd just see a broken card with no diagnostic and
// no idea their refresh token rotated underneath them.
//
// The body never includes token text or paths — only the error code.
// Dedupe is done through the existing alert ledger so it survives restarts.
function maybeFireOAuthPersistFailure(provider, error) {
  const key = `oauth-persist-failure:${provider}:${error}`;
  const ledger = loadAlertLedger();
  const last = ledger[key];
  if (last && Date.now() - last < 24 * 3600 * 1000) return;
  const labels = { claude: 'Claude Code', codex: 'ChatGPT (Codex)' };
  const label = labels[provider] || provider;
  fireNotification(
    `Tokenly: ${label} credentials`,
    `Couldn't save refreshed credentials (${error}). You may need to re-authenticate ${label} on next launch.`,
    { urgent: true },
  );
  ledger[key] = Date.now();
  saveAlertLedger(ledger);
}

// Persist refreshed credentials. Writes to the source that loaded them, AND
// also writes-through to the Keychain when source=file on macOS and a
// Keychain item already exists (otherwise a stale Keychain becomes the
// active source after manual file cleanup or a Claude CLI re-init).
//
// Returns {ok, error}. Silent failure here = silent auth_expired at next
// launch — callers MUST surface failures via maybeFireOAuthPersistFailure.
function persistClaudeCredentials(originalRaw, source, refreshed, originalParsed) {
  if (!refreshed || !refreshed.refreshToken || !refreshed.accessToken) {
    return { ok: false, error: 'no_refresh' };
  }
  // Parse already succeeded upstream (loadClaudeOAuthCredentials → parse →
  // refresh → here). If we still can't parse, something corrupted the input
  // between load and here — refuse to write a stripped object that would
  // drop sibling fields the Claude CLI expects (telemetry IDs, etc).
  let jsonObj;
  try { jsonObj = JSON.parse(originalRaw); } catch {
    return { ok: false, error: 'parse_failed' };
  }
  const oa = jsonObj.claudeAiOauth || {};
  // Preserve every field on the original oa block; only update the rotating ones.
  oa.accessToken  = refreshed.accessToken;
  oa.refreshToken = refreshed.refreshToken;
  oa.expiresAt    = refreshed.expiresAtMs;
  if (refreshed.scopes && refreshed.scopes.length) oa.scopes = refreshed.scopes;
  jsonObj.claudeAiOauth = oa;
  const next = JSON.stringify(jsonObj);

  let canonicalOk = false;
  let canonicalError = null;

  if (source === 'file') {
    try {
      const tmp = CLAUDE_CREDENTIALS_FILE + '.tokenly.tmp';
      fs.writeFileSync(tmp, next, { mode: 0o600 });
      fs.renameSync(tmp, CLAUDE_CREDENTIALS_FILE);
      canonicalOk = true;
    } catch (e) {
      canonicalError = 'file_write_failed';
      console.warn('[oauth] claude file persist failed:', e?.code || e?.message || e);
    }
  } else if (source === 'keychain' && process.platform === 'darwin') {
    const account = findClaudeKeychainAccount();
    if (!account) {
      canonicalError = 'keychain_no_account';
      console.warn('[oauth] claude keychain persist failed: account not found');
    } else {
      try {
        writeKeychainSecret(CLAUDE_KEYCHAIN_SERVICE, account, next);
        canonicalOk = true;
      } catch (e) {
        canonicalError = 'keychain_write_failed';
        console.warn('[oauth] claude keychain persist failed:', e?.code || e?.message || e);
      }
    }
  } else {
    return { ok: false, error: 'unknown_source' };
  }

  // Write-through to the OTHER store when source=file on darwin and a
  // Keychain item exists. Best-effort — failure here doesn't fail the whole
  // operation because the canonical store wrote successfully. We DO log it
  // because a stale Keychain becomes the active source if the file is later
  // removed (manual cleanup, OS migration, Claude CLI re-init).
  if (source === 'file' && canonicalOk && process.platform === 'darwin') {
    const account = findClaudeKeychainAccount();
    if (account) {
      try {
        writeKeychainSecret(CLAUDE_KEYCHAIN_SERVICE, account, next);
      } catch (e) {
        console.warn('[oauth] claude keychain write-through failed:', e?.code || e?.message || e);
      }
    }
  }

  return canonicalOk ? { ok: true } : { ok: false, error: canonicalError || 'unknown' };
}

async function refreshClaudeOAuthToken(creds) {
  if (!creds || !creds.refreshToken) return null;
  const cached = claudeRefreshedTokenCache.get(creds.refreshToken);
  if (cached && cached.expiresAtMs - Date.now() > 60_000) return cached;
  if (claudeRefreshInflight.has(creds.refreshToken)) return claudeRefreshInflight.get(creds.refreshToken);
  const p = (async () => {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: creds.refreshToken,
      client_id: CLAUDE_OAUTH_CLIENT_ID,
    });
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);
    let res;
    try {
      res = await fetch(CLAUDE_OAUTH_REFRESH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: body.toString(),
        signal: ctrl.signal,
      });
    } catch { clearTimeout(timeout); return null; }
    clearTimeout(timeout);
    if (!res || !res.ok) return null;
    let json;
    try { json = await res.json(); } catch { return null; }
    if (!json.access_token) return null;
    const next = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token || creds.refreshToken,
      expiresAtMs: Date.now() + ((Number(json.expires_in) || 28800) * 1000),
      scopes: Array.isArray(json.scope) ? json.scope
        : (typeof json.scope === 'string' ? json.scope.split(/\s+/).filter(Boolean) : creds.scopes),
      rateLimitTier: creds.rateLimitTier,
    };
    claudeRefreshedTokenCache.set(creds.refreshToken, next);
    return next;
  })().finally(() => claudeRefreshInflight.delete(creds.refreshToken));
  claudeRefreshInflight.set(creds.refreshToken, p);
  return p;
}

function parseClaudeCredentials(raw) {
  if (!raw) return null;
  let obj;
  try { obj = JSON.parse(raw); } catch { return null; }
  const oa = obj && obj.claudeAiOauth;
  if (!oa || typeof oa !== 'object') return null;
  const accessToken = String(oa.accessToken || '').trim();
  if (!accessToken) return null;
  const expiresAtMs = Number(oa.expiresAt) || null;
  return {
    accessToken,
    refreshToken: oa.refreshToken || null,
    expiresAtMs,
    scopes: Array.isArray(oa.scopes) ? oa.scopes : [],
    rateLimitTier: oa.rateLimitTier || null,
  };
}

function readClaudeCredentialsFromFile() {
  try {
    if (!fs.existsSync(CLAUDE_CREDENTIALS_FILE)) return null;
    const raw = fs.readFileSync(CLAUDE_CREDENTIALS_FILE, 'utf8');
    const parsed = parseClaudeCredentials(raw);
    return parsed ? { creds: parsed, raw, source: 'file' } : null;
  } catch { return null; }
}

function readClaudeCredentialsFromKeychain() {
  if (process.platform !== 'darwin') return null;
  const { execFileSync } = require('child_process');
  try {
    const raw = execFileSync(
      '/usr/bin/security',
      ['find-generic-password', '-s', CLAUDE_KEYCHAIN_SERVICE, '-w'],
      { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const parsed = parseClaudeCredentials(raw);
    return parsed ? { creds: parsed, raw, source: 'keychain' } : null;
  } catch { return null; }
}

function loadClaudeOAuthCredentials() {
  return readClaudeCredentialsFromFile() || readClaudeCredentialsFromKeychain();
}

function planLabelFromTier(tier) {
  if (!tier) return null;
  const t = String(tier).toLowerCase();
  if (t.includes('max20'))      return 'Max 20x';
  if (t.includes('max5'))       return 'Max 5x';
  if (t.includes('max'))        return 'Max';
  if (t.includes('team'))       return 'Team';
  if (t.includes('enterprise')) return 'Enterprise';
  if (t.includes('pro'))        return 'Pro';
  return tier;
}

function mapOAuthWindow(win) {
  if (!win || typeof win !== 'object') return null;
  const u = Number(win.utilization);
  if (!Number.isFinite(u)) return null;
  // Anthropic's /api/oauth/usage returns `utilization` as a percentage (0-100),
  // not a fraction (0-1). Some endpoints in the wild use the fraction form, so
  // auto-detect: values <= 1 are treated as fractions and scaled by 100.
  // (Don't clamp to 100 here — overage usage can exceed 100% and we want the
  // raw value preserved for display.)
  const usedPercent = u > 1 ? u : u * 100;
  return {
    usedPercent: Math.max(0, usedPercent),
    resetsAt: win.resets_at || null,
  };
}

// Last-known-good quota cache + stale-serve. Anthropic's /api/oauth/usage is
// a private endpoint and occasionally 429s, 5xxs, or just blips on the network
// — when it does, we don't want the whole quota block to vanish from the UI.
// On any transient failure we serve the most recent successful response with
// a stale flag, and the renderer surfaces a subtle "Xm ago" indicator.
//
// Cache TTLs:
//   FRESH (5 min)    — under this, treat as live data, no indicator
//   STALE (2h)       — over fresh but under this, serve with stale indicator
//   MAX (24h)        — over this, drop the cache entirely
const oauthQuotaCache = new Map(); // key: provider id → { data, ts }
const OAUTH_CACHE_FRESH_MS = 5 * 60 * 1000;
const OAUTH_CACHE_STALE_MS = 2 * 60 * 60 * 1000;
const OAUTH_CACHE_MAX_MS   = 24 * 60 * 60 * 1000;

function readQuotaCache(key) {
  const entry = oauthQuotaCache.get(key);
  if (!entry) return null;
  const ageMs = Date.now() - entry.ts;
  if (ageMs > OAUTH_CACHE_MAX_MS) { oauthQuotaCache.delete(key); return null; }
  return { data: entry.data, ageMs };
}
function writeQuotaCache(key, data) {
  if (data) oauthQuotaCache.set(key, { data, ts: Date.now() });
}
// Wraps a successful fetch with cache write + the live shape; wraps a failure
// with cache lookup + stale indicator. `reason` describes why a fresh fetch
// failed so the UI can show an actionable message when no cache exists.
function withQuotaCache(key, freshData, failureReason) {
  if (freshData) {
    writeQuotaCache(key, freshData);
    return freshData;
  }
  const cached = readQuotaCache(key);
  if (cached) {
    return { ...cached.data, _stale: true, _ageMs: cached.ageMs, _reason: failureReason || null };
  }
  // No cache and fresh fetch failed — return an unavailable marker so the
  // renderer can display a tasteful notice instead of an empty block.
  if (failureReason) return { _unavailable: true, _reason: failureReason };
  return null;
}

async function fetchClaudeOAuthQuota() {
  const loaded = loadClaudeOAuthCredentials();
  // No credentials at all = user not on a subscription. Suppress entirely.
  if (!loaded) return null;
  let creds = loaded.creds;

  // Refresh if expiring within 60s. Falls back to the stale token if refresh
  // fails (still might work for a few seconds), and bails entirely if the
  // refresh fails AND the token is already past its expiry.
  // CRITICAL: Anthropic rotates refresh_token on every refresh — we MUST
  // persist the new credentials back to Keychain/file or the next process
  // launch will be stuck with an invalidated refresh_token.
  if (creds.expiresAtMs && (creds.expiresAtMs - Date.now() < 60_000)) {
    const refreshed = await refreshClaudeOAuthToken(creds);
    if (refreshed) {
      creds = { ...creds, ...refreshed };
      const persisted = persistClaudeCredentials(loaded.raw, loaded.source, refreshed, loaded.creds);
      if (!persisted.ok) {
        // Refresh succeeded but writeback failed — Anthropic has invalidated
        // the old refresh_token by now, so the next process launch will be
        // dead unless we tell the user to re-auth.
        maybeFireOAuthPersistFailure('claude', persisted.error || 'unknown');
      }
    } else if (Date.now() >= creds.expiresAtMs) {
      return withQuotaCache('claude-code', null, 'auth_expired');
    }
  }
  // The /api/oauth/usage endpoint requires user:profile scope (CLI tokens
  // with only user:inference cannot call it).
  if (creds.scopes.length && !creds.scopes.includes('user:profile')) {
    return withQuotaCache('claude-code', null, 'scopes_insufficient');
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 5000);
  let res;
  try {
    res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        'Authorization': `Bearer ${creds.accessToken}`,
        'Accept': 'application/json',
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'tokenly/' + (app.getVersion ? app.getVersion() : 'dev'),
      },
      signal: ctrl.signal,
    });
  } catch {
    clearTimeout(timeout);
    return withQuotaCache('claude-code', null, 'network');
  }
  clearTimeout(timeout);
  if (!res) return withQuotaCache('claude-code', null, 'network');
  if (!res.ok) {
    // 401/403 mean tokens are bad — surface re-auth. Other statuses are likely
    // transient (429 rate limit, 5xx outage) so we'll serve cache.
    const reason = (res.status === 401 || res.status === 403) ? 'auth_expired' : 'network';
    return withQuotaCache('claude-code', null, reason);
  }

  let body;
  try { body = await res.json(); } catch { return withQuotaCache('claude-code', null, 'network'); }

  const fiveHour       = mapOAuthWindow(body.five_hour);
  const sevenDay       = mapOAuthWindow(body.seven_day);
  const sevenDaySonnet = mapOAuthWindow(body.seven_day_sonnet);
  const sevenDayOpus   = mapOAuthWindow(body.seven_day_opus);

  let extraUsage = null;
  if (body.extra_usage && typeof body.extra_usage === 'object') {
    const e = body.extra_usage;
    // Anthropic returns monthly_limit and used_credits in CENTS (paired with
    // currency: "USD"). Same gotcha as the admin Cost Report — see the
    // §8 bug table in PROJECT.md. Divide by 100 to get dollars.
    const limit = (Number(e.monthly_limit) || 0) / 100;
    const used  = (Number(e.used_credits)  || 0) / 100;
    extraUsage = {
      enabled: Boolean(e.is_enabled),
      used,
      limit,
      currency: e.currency || 'USD',
    };
  }

  if (!fiveHour && !sevenDay && !sevenDaySonnet && !sevenDayOpus && !extraUsage) {
    return withQuotaCache('claude-code', null, 'empty_response');
  }

  return withQuotaCache('claude-code', {
    fiveHour,
    sevenDay,
    sevenDaySonnet,
    sevenDayOpus,
    extraUsage,
    planTier: planLabelFromTier(creds.rateLimitTier),
  });
}

// ---------------------------------------------------------------------------
// Codex OAuth quota — for ChatGPT Pro/Plus/Team/Business users without an
// OpenAI Admin API key. Reads OAuth tokens written by the Codex CLI to
// ~/.codex/auth.json and calls the same private /backend-api/wham/usage
// endpoint the CLI uses internally. Returns 5h/weekly windows, credits
// balance, and plan tier. Strictly additive: any failure returns null.
//
// Note on token refresh: this minimal v1 only reads the existing access_token.
// The Codex CLI refreshes its own tokens proactively every 8 days, so for
// users actively running `codex` the token is fresh. If the access_token has
// expired we silently return null; the next `codex` invocation will refresh
// it and OAuth data reappears on the next Tokenly poll.
// ---------------------------------------------------------------------------

const CODEX_AUTH_FILE = path.join(os.homedir(), '.codex', 'auth.json');
const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const CODEX_OAUTH_REFRESH_URL = 'https://auth.openai.com/oauth/token';
// Public OAuth client ID baked into the open-source Codex CLI.
const CODEX_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

// In-memory cache of refreshed Codex tokens — same shape as the Claude one.
const codexRefreshedTokenCache = new Map(); // refresh_token → { accessToken, expiresAtMs, accountId, idToken, refreshToken }

// Same dedup pattern as the Claude path — see claudeRefreshInflight.
const codexRefreshInflight = new Map();

async function refreshCodexOAuthToken(creds) {
  if (!creds || !creds.refreshToken) return null;
  const cached = codexRefreshedTokenCache.get(creds.refreshToken);
  if (cached && cached.expiresAtMs - Date.now() > 5 * 60_000) return cached;
  if (codexRefreshInflight.has(creds.refreshToken)) return codexRefreshInflight.get(creds.refreshToken);
  const p = (async () => {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);
    let res;
    try {
      res = await fetch(CODEX_OAUTH_REFRESH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          client_id: CODEX_OAUTH_CLIENT_ID,
          grant_type: 'refresh_token',
          refresh_token: creds.refreshToken,
          scope: 'openid profile email',
        }),
        signal: ctrl.signal,
      });
    } catch { clearTimeout(timeout); return null; }
    clearTimeout(timeout);
    if (!res || !res.ok) return null;
    let json;
    try { json = await res.json(); } catch { return null; }
    if (!json.access_token) return null;
    // JWT exp claim → expiresAtMs. Falls back to 8 days if the JWT isn't parseable.
    let expMs = Date.now() + 8 * 24 * 3600_000;
    try {
      const parts = String(json.access_token).split('.');
      const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      if (typeof payload.exp === 'number') expMs = payload.exp * 1000;
    } catch { /* keep fallback */ }
    const next = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token || creds.refreshToken,
      idToken: json.id_token || creds.idToken,
      accountId: creds.accountId,
      expiresAtMs: expMs,
    };
    codexRefreshedTokenCache.set(creds.refreshToken, next);
    return next;
  })().finally(() => codexRefreshInflight.delete(creds.refreshToken));
  codexRefreshInflight.set(creds.refreshToken, p);
  return p;
}

// Returns ms until JWT exp, or 0 if unparseable / no exp claim.
function jwtMsUntilExpiry(jwt) {
  try {
    const parts = String(jwt).split('.');
    if (parts.length < 2) return 0;
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (typeof payload.exp !== 'number') return 0;
    return payload.exp * 1000 - Date.now();
  } catch { return 0; }
}

function readCodexAuth() {
  try {
    if (!fs.existsSync(CODEX_AUTH_FILE)) return null;
    const raw = fs.readFileSync(CODEX_AUTH_FILE, 'utf8');
    const json = JSON.parse(raw);
    const tokens = json && json.tokens;
    if (!tokens || typeof tokens !== 'object') return null;
    const accessToken = String(tokens.access_token || '').trim();
    if (!accessToken) return null;
    return {
      creds: {
        accessToken,
        refreshToken: tokens.refresh_token || null,
        accountId: tokens.account_id || null,
        idToken: tokens.id_token || null,
        lastRefresh: json.last_refresh || null,
      },
      raw, // full original file contents — preserved for write-back
    };
  } catch { return null; }
}

// Persist refreshed Codex credentials. OpenAI's refresh response MAY rotate
// refresh_token (OAuth allows it either way) — write back defensively to
// avoid the same single-use trap Anthropic has. Updates last_refresh so the
// codex CLI sees the file as fresh and skips its own redundant refresh.
function persistCodexCredentials(originalRaw, refreshed) {
  if (!refreshed || !refreshed.accessToken) {
    return { ok: false, error: 'no_refresh' };
  }
  let json;
  try { json = JSON.parse(originalRaw); } catch {
    return { ok: false, error: 'parse_failed' };
  }
  if (!json.tokens) json.tokens = {};
  json.tokens.access_token = refreshed.accessToken;
  // Only overwrite refresh_token if we actually got one back. The refresher
  // already falls back to creds.refreshToken when the response omits it, so
  // this should always be truthy — but guard against a future code path
  // passing a refreshed object without it (would otherwise wipe a working
  // token to undefined, which JSON.stringify drops, leaving the file with
  // no refresh capability at all).
  if (refreshed.refreshToken) json.tokens.refresh_token = refreshed.refreshToken;
  if (refreshed.idToken) json.tokens.id_token = refreshed.idToken;
  json.last_refresh = new Date().toISOString();
  try {
    const tmp = CODEX_AUTH_FILE + '.tokenly.tmp';
    fs.writeFileSync(tmp, JSON.stringify(json, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, CODEX_AUTH_FILE);
    return { ok: true };
  } catch (e) {
    console.warn('[oauth] codex persist failed:', e?.code || e?.message || e);
    return { ok: false, error: 'file_write_failed' };
  }
}

// JWT exp claim is in seconds since epoch. Returns true if the token is
// already expired (so we can short-circuit the network call).
function isJwtExpired(jwt) {
  try {
    const parts = String(jwt).split('.');
    if (parts.length < 2) return false;
    // base64url → base64
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    const obj = JSON.parse(decoded);
    if (!obj || typeof obj.exp !== 'number') return false;
    return obj.exp * 1000 <= Date.now();
  } catch { return false; } // unparseable — let the server decide
}

function planLabelFromCodexTier(planType) {
  if (!planType) return null;
  const p = String(planType).toLowerCase();
  // Codex returns lowercase enum values; map to the casing the user sees in
  // their ChatGPT account ("ChatGPT Pro", "ChatGPT Plus", etc).
  const map = {
    pro: 'Pro',
    plus: 'Plus',
    free: 'Free',
    go: 'Go',
    team: 'Team',
    business: 'Business',
    enterprise: 'Enterprise',
    edu: 'Edu',
    education: 'Education',
    free_workspace: 'Free Workspace',
    guest: 'Guest',
  };
  return map[p] || planType;
}

function mapCodexWindow(win) {
  if (!win || typeof win !== 'object') return null;
  const u = Number(win.used_percent);
  if (!Number.isFinite(u)) return null;
  // Codex returns used_percent as 0–100 (matches the CLI's /status display).
  // Same auto-detect guard as the Claude fetcher in case the shape changes.
  const usedPercent = u > 1 ? u : u * 100;
  const resetAt = Number(win.reset_at);
  return {
    usedPercent: Math.max(0, usedPercent),
    resetsAt: Number.isFinite(resetAt) ? new Date(resetAt * 1000).toISOString() : null,
  };
}

async function fetchCodexOAuthQuota() {
  const loaded = readCodexAuth();
  if (!loaded) return null;
  let creds = loaded.creds;
  // Refresh proactively when the JWT is within 5 min of expiry, OR if it's
  // already expired. Falls back to the stale token if refresh fails AND the
  // token isn't fully expired yet (still might work briefly).
  const msLeft = jwtMsUntilExpiry(creds.accessToken);
  if (msLeft < 5 * 60_000) {
    const refreshed = await refreshCodexOAuthToken(creds);
    if (refreshed) {
      creds = { ...creds, accessToken: refreshed.accessToken, idToken: refreshed.idToken, refreshToken: refreshed.refreshToken };
      const persisted = persistCodexCredentials(loaded.raw, refreshed);
      if (!persisted.ok) {
        // OpenAI MAY rotate refresh_token (OAuth allows it either way). If it
        // did, the in-memory cache is correct but the file isn't — next
        // launch will read the dead token. Tell the user.
        maybeFireOAuthPersistFailure('codex', persisted.error || 'unknown');
      }
    } else if (msLeft <= 0) {
      return withQuotaCache('codex', null, 'auth_expired');
    }
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 5000);
  let res;
  try {
    const headers = {
      'Authorization': `Bearer ${creds.accessToken}`,
      'Accept': 'application/json',
      // Match the Codex CLI's user-agent so the endpoint accepts us; some
      // backends gate on UA. We pretend to be `codex-cli` rather than tokenly
      // because that's what the endpoint expects.
      'User-Agent': 'codex-cli',
    };
    if (creds.accountId) headers['ChatGPT-Account-Id'] = creds.accountId;
    res = await fetch(CODEX_USAGE_URL, { headers, signal: ctrl.signal });
  } catch {
    clearTimeout(timeout);
    return withQuotaCache('codex', null, 'network');
  }
  clearTimeout(timeout);
  if (!res) return withQuotaCache('codex', null, 'network');
  if (!res.ok) {
    const reason = (res.status === 401 || res.status === 403) ? 'auth_expired' : 'network';
    return withQuotaCache('codex', null, reason);
  }

  let body;
  try { body = await res.json(); } catch { return withQuotaCache('codex', null, 'network'); }

  const rl = body && body.rate_limit;
  const fiveHour = rl ? mapCodexWindow(rl.primary_window)   : null;
  const sevenDay = rl ? mapCodexWindow(rl.secondary_window) : null;

  let credits = null;
  if (body && body.credits && typeof body.credits === 'object') {
    const c = body.credits;
    credits = {
      hasCredits: Boolean(c.has_credits),
      unlimited:  Boolean(c.unlimited),
      balance:    Number.isFinite(Number(c.balance)) ? Number(c.balance) : null,
      currency:   c.currency || 'USD',
    };
  }

  if (!fiveHour && !sevenDay && !credits) {
    return withQuotaCache('codex', null, 'empty_response');
  }

  return withQuotaCache('codex', {
    fiveHour,
    sevenDay,
    credits,
    planTier: planLabelFromCodexTier(body && body.plan_type),
  });
}

async function fetchClaudeCodeLocal(days) {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) {
    throw new Error('No local Claude Code data found (~/.claude/projects/ missing).');
  }
  const cutoffMs = Date.now() - days * 86400 * 1000;
  const byModel = {};
  const byDay = new Map();
  const byDayDetail = new Map();
  const byProject = new Map(); // cwd → aggregate
  const seenIds = new Set();
  let inTok = 0, outTok = 0, cacheIn = 0, cacheRead = 0, req = 0, totalCost = 0;

  const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;

  for (const filepath of walkJsonlFiles(CLAUDE_PROJECTS_DIR)) {
    let stat;
    try { stat = fs.statSync(filepath); } catch { continue; }
    if (stat.mtimeMs < cutoffMs) continue;
    if (stat.size > MAX_FILE_BYTES) continue;

    // cwd / entrypoint are session-level facts captured from the first line
    // that has them. Fall back to decoding the parent folder name (the encoded
    // form Claude writes — leading "-", slashes replaced with "-").
    let sessionCwd = null;
    let sessionEntry = null;
    let sessionContributed = false; // for byProject.sessions count

    try {
      const rl = readline.createInterface({
        input: fs.createReadStream(filepath, { encoding: 'utf8', highWaterMark: 64 * 1024 }),
        crlfDelay: Infinity,
      });
      for await (const line of rl) {
        if (!line) continue;
        let o;
        try { o = JSON.parse(line); } catch { continue; }

        if (!sessionCwd && typeof o.cwd === 'string' && o.cwd) sessionCwd = o.cwd;
        if (!sessionEntry && typeof o.entrypoint === 'string') sessionEntry = o.entrypoint;

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

        const det = byDayDetail.get(dayKey) || { input: 0, output: 0, cache_creation: 0, cache_read: 0, requests: 0, cost: 0 };
        det.input          += u.input_tokens                || 0;
        det.output         += u.output_tokens               || 0;
        det.cache_creation += u.cache_creation_input_tokens || 0;
        det.cache_read     += u.cache_read_input_tokens     || 0;
        det.requests       += 1;
        det.cost           += cost;
        byDayDetail.set(dayKey, det);

        // Project bucket. Resolved lazily — we may not have seen cwd yet on
        // this line, but in practice user/system events precede the first
        // assistant turn so sessionCwd is populated by now.
        const cwdKey = sessionCwd || decodeClaudeProjectFolder(path.basename(path.dirname(filepath))) || '(unknown)';
        const proj = byProject.get(cwdKey) || {
          cwd: cwdKey,
          project: friendlyProjectName(cwdKey),
          input: 0, output: 0, cache_creation: 0, cache_read: 0, requests: 0, cost: 0,
          entrypoints: {},
          modelsMap: new Map(),
          sessions: 0,
        };
        proj.input          += u.input_tokens                || 0;
        proj.output         += u.output_tokens               || 0;
        proj.cache_creation += u.cache_creation_input_tokens || 0;
        proj.cache_read     += u.cache_read_input_tokens     || 0;
        proj.requests       += 1;
        proj.cost           += cost;
        if (sessionEntry) proj.entrypoints[sessionEntry] = (proj.entrypoints[sessionEntry] || 0) + 1;
        const m = proj.modelsMap.get(model) || { model, requests: 0, cost: 0 };
        m.requests += 1; m.cost += cost;
        proj.modelsMap.set(model, m);
        if (!sessionContributed) { proj.sessions += 1; sessionContributed = true; }
        byProject.set(cwdKey, proj);
      }
    } catch { continue; }
  }

  const sortedTrend = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([_, v]) => v);
  const dailyBreakdown = [...byDayDetail.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));
  const byProjectArr = [...byProject.values()]
    .map(({ modelsMap, ...rest }) => ({
      ...rest,
      models: [...modelsMap.values()].sort((a, b) => b.cost - a.cost),
    }))
    .sort((a, b) => b.cost - a.cost);

  return {
    totals: { input: inTok, output: outTok, cache_creation: cacheIn, cache_read: cacheRead, requests: req, cost: totalCost, currency: 'USD' },
    models: Object.values(byModel).sort((a, b) => b.cost - a.cost),
    byProject: byProjectArr,
    trend: sortedTrend,
    dailyBreakdown,
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
  { label: 'GPT-5.4 Codex', match: /^gpt-5\.4-codex/,   input: 1.25, output: 10   },
  { label: 'GPT-5.4 mini',  match: /^gpt-5\.4-mini/,    input: 0.25, output: 2    },
  { label: 'GPT-5.4',       match: /^gpt-5\.4/,         input: 2.50, output: 15   },
  { label: 'GPT-5 Codex',   match: /^gpt-5-codex/,      input: 1.25, output: 10   },
  { label: 'GPT-5 mini',    match: /^gpt-5-mini/,       input: 0.25, output: 2    },
  { label: 'GPT-5',         match: /^gpt-5/,            input: 1.25, output: 10   },
  { label: 'o1-mini',       match: /^o1-mini/,          input: 1.10, output: 4.40 },
  { label: 'o1',            match: /^o1/,               input: 15,   output: 60   },
  { label: 'GPT-4.1 mini',  match: /^gpt-4\.1-mini/,    input: 0.40, output: 1.60 },
  { label: 'GPT-4.1',       match: /^gpt-4\.1/,         input: 2,    output: 8    },
  { label: 'GPT-4o mini',   match: /^gpt-4o-mini/,      input: 0.15, output: 0.60 },
  { label: 'GPT-4o',        match: /^gpt-4o/,           input: 2.50, output: 10   },
];
function openaiPriceFor(model) {
  const remote = remotePriceFor('openai', model);
  if (remote) return remote;
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
  const byDayDetail = new Map();
  const byProject = new Map(); // cwd → aggregate
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
    let sessionCwd = null;
    let sessionOriginator = null;
    let sessionContributed = false;

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
          if (typeof o.payload.cwd === 'string') sessionCwd = o.payload.cwd;
          if (typeof o.payload.originator === 'string') sessionOriginator = o.payload.originator;
        }

        // Some sessions also surface cwd later via turn_context — capture it
        // as a fallback in case session_meta was malformed.
        if (!sessionCwd && o.type === 'turn_context' && typeof o.payload?.cwd === 'string') {
          sessionCwd = o.payload.cwd;
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

          const det = byDayDetail.get(dayKey) || { input: 0, output: 0, cached: 0, reasoning: 0, requests: 0, cost: 0 };
          det.input     += inT;
          det.output    += outT;
          det.cached    += cachedT;
          det.reasoning += reasoningT;
          det.requests  += 1;
          det.cost      += cost;
          byDayDetail.set(dayKey, det);

          // Project bucket. cwd is captured from session_meta (line 1).
          const cwdKey = sessionCwd || '(unknown)';
          const proj = byProject.get(cwdKey) || {
            cwd: cwdKey,
            project: friendlyProjectName(cwdKey),
            input: 0, output: 0, cached: 0, reasoning: 0, requests: 0, cost: 0,
            originators: {},
            modelsMap: new Map(),
            sessions: 0,
          };
          proj.input     += inT;
          proj.output    += outT;
          proj.cached    += cachedT;
          proj.reasoning += reasoningT;
          proj.requests  += 1;
          proj.cost      += cost;
          if (sessionOriginator) proj.originators[sessionOriginator] = (proj.originators[sessionOriginator] || 0) + 1;
          const m = proj.modelsMap.get(currentModel) || { model: currentModel, requests: 0, cost: 0 };
          m.requests += 1; m.cost += cost;
          proj.modelsMap.set(currentModel, m);
          if (!sessionContributed) { proj.sessions += 1; sessionContributed = true; }
          byProject.set(cwdKey, proj);
        }
      }
    } catch (err) {
      // Skip unreadable files but keep going with the rest.
      continue;
    }
  }

  const sortedTrend = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([_, v]) => v);
  const dailyBreakdown = [...byDayDetail.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));
  // Compose subscription-aware note.
  const planList = [...planTypes.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p).filter(Boolean).slice(0, 3);
  const subLabel = planList.length
    ? `Plan: ${planList.join(', ')}. Cost is a list-price estimate — most ChatGPT subscription usage is bundled and not billed per-token.`
    : 'Cost is an estimate based on public pricing.';

  const byProjectArr = [...byProject.values()]
    .map(({ modelsMap, ...rest }) => ({
      ...rest,
      models: [...modelsMap.values()].sort((a, b) => b.cost - a.cost),
    }))
    .sort((a, b) => b.cost - a.cost);

  return {
    totals: { input: inTok, output: outTok, cached: cachedTok, reasoning: reasoningTok, requests: turns, cost: totalCost, currency: 'USD' },
    models: Object.values(byModel).sort((a, b) => b.cost - a.cost),
    byProject: byProjectArr,
    trend: sortedTrend,
    dailyBreakdown,
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
  { label: 'Gemini 3 Pro',          match: /^gemini-3-pro/,          input: 2.00,  output: 12.00 },
  { label: 'Gemini 3 Flash Lite',   match: /^gemini-3-flash-lite/,   input: 0.10,  output: 0.40  },
  { label: 'Gemini 3 Flash',        match: /^gemini-3-flash/,        input: 0.30,  output: 2.50  },
  { label: 'Gemini 2.5 Pro',        match: /^gemini-2\.5-pro/,       input: 1.25,  output: 10.00 },
  { label: 'Gemini 2.5 Flash Lite', match: /^gemini-2\.5-flash-lite/,input: 0.10,  output: 0.40  },
  { label: 'Gemini 2.5 Flash',      match: /^gemini-2\.5-flash/,     input: 0.30,  output: 2.50  },
  { label: 'Gemini 2.0 Flash',      match: /^gemini-2\.0-flash/,     input: 0.15,  output: 0.60  },
  { label: 'Gemini 1.5 Pro',        match: /^gemini-1\.5-pro/,       input: 1.25,  output: 5.00  },
  { label: 'Gemini 1.5 Flash',      match: /^gemini-1\.5-flash/,     input: 0.075, output: 0.30  },
];
function geminiPriceFor(model) {
  const remote = remotePriceFor('gemini', model);
  if (remote) return remote;
  const m = String(model || '');
  for (const p of GEMINI_PRICING) if (p.match.test(m)) return p;
  return { input: 0.30, output: 2.50 }; // safe Flash default
}
function costFromGeminiTokens(model, t) {
  if (!t) return 0;
  const p = geminiPriceFor(model);
  const input    = (t.input    || 0) * p.input  / 1e6;
  const output   = (t.output   || 0) * p.output / 1e6;
  // Cache-read multiplier from shared helper (was hardcoded 0.25, which is
  // Gemini's published rate — but if a remote pricing payload ever ships a
  // different value, both poll and chat paths now honor it). See H3 in
  // the pricing review.
  const cached   = (t.cached   || 0) * p.input  * getCacheReadMul('gemini') / 1e6;
  const thoughts = (t.thoughts || 0) * p.output / 1e6;          // reasoning priced as output
  const tool     = (t.tool     || 0) * p.input  / 1e6;          // tool context priced as input
  return input + output + cached + thoughts + tool;
}

// ---------------------------------------------------------------------------
// Gemini OAuth quota — for Gemini CLI / Code Assist users without an API key.
// Reads OAuth tokens from ~/.gemini/oauth_creds.json (written by `gemini`),
// refreshes via Google's OAuth endpoint when expired (writes new tokens back
// so the CLI keeps working), discovers the Code Assist project, then calls
// the private `retrieveUserQuota` and `loadCodeAssist` endpoints to pull
// per-model quotas + tier (Free / Paid / Workspace).
//
// OAuth client_id/secret are public "installed app" values shipped with the
// open-source gemini-cli. Rather than embed them here, we extract them at
// runtime from the user's installed gemini-cli bundle — this stays current
// across CLI updates and avoids checking known-public OAuth constants into
// the public Tokenly source. Refresh requires the CLI to be installed.
// ---------------------------------------------------------------------------

const GEMINI_CREDS_FILE = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
let geminiOAuthClientCache = null;

function geminiOAuthClient() {
  if (geminiOAuthClientCache) return geminiOAuthClientCache;
  const candidates = [
    '/opt/homebrew/lib/node_modules/@google/gemini-cli/bundle',
    '/usr/local/lib/node_modules/@google/gemini-cli/bundle',
    path.join(os.homedir(), '.bun/install/global/node_modules/@google/gemini-cli/bundle'),
  ];
  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.js')) continue;
        const txt = fs.readFileSync(path.join(dir, f), 'utf8');
        const idM  = txt.match(/OAUTH_CLIENT_ID\s*=\s*"([^"]+)"/);
        const secM = txt.match(/OAUTH_CLIENT_SECRET\s*=\s*"([^"]+)"/);
        if (idM && secM) {
          geminiOAuthClientCache = { id: idM[1], secret: secM[1] };
          return geminiOAuthClientCache;
        }
      }
    } catch { /* try next */ }
  }
  return null;
}

function readGeminiCreds() {
  try {
    if (!fs.existsSync(GEMINI_CREDS_FILE)) return null;
    const j = JSON.parse(fs.readFileSync(GEMINI_CREDS_FILE, 'utf8'));
    if (!j.access_token && !j.refresh_token) return null;
    return j;
  } catch { return null; }
}

function writeGeminiCreds(creds) {
  // Atomic write so we don't half-clobber the file mid-CLI launch.
  try {
    const tmp = GEMINI_CREDS_FILE + '.tokenly.tmp';
    fs.writeFileSync(tmp, JSON.stringify(creds, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, GEMINI_CREDS_FILE);
  } catch { /* non-fatal — refresh still works in-memory */ }
}

async function refreshGeminiToken(creds) {
  if (!creds || !creds.refresh_token) return null;
  const client = geminiOAuthClient();
  if (!client) return null; // gemini-cli not installed → can't refresh
  const params = new URLSearchParams({
    client_id: client.id,
    client_secret: client.secret,
    refresh_token: creds.refresh_token,
    grant_type: 'refresh_token',
  });
  let res;
  try {
    res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
  } catch { return null; }
  if (!res.ok) return null;
  let body;
  try { body = await res.json(); } catch { return null; }
  if (!body.access_token) return null;
  const next = {
    ...creds,
    access_token: body.access_token,
    expiry_date: Date.now() + (Number(body.expires_in) || 3600) * 1000,
    scope: body.scope || creds.scope,
    token_type: body.token_type || creds.token_type,
    id_token: body.id_token || creds.id_token,
    // refresh_token is reused across refreshes by Google for installed apps.
  };
  writeGeminiCreds(next);
  return next;
}

async function ensureGeminiAccessToken() {
  let creds = readGeminiCreds();
  if (!creds) return null;
  // Refresh if expiring within 60s (avoids races with in-flight calls).
  const stale = !creds.access_token || !creds.expiry_date || creds.expiry_date - Date.now() < 60_000;
  if (stale) {
    const refreshed = await refreshGeminiToken(creds);
    if (refreshed) creds = refreshed;
    else if (!creds.access_token) return null;
  }
  return creds.access_token;
}

function tierLabelFromGemini(currentTier) {
  if (!currentTier || !currentTier.id) return null;
  const id = String(currentTier.id);
  if (id === 'standard-tier') return 'Paid';
  if (id === 'legacy-tier')   return 'Legacy';
  if (id === 'free-tier')     return 'Free';
  return id;
}

// Group Gemini's per-model buckets into rows. Filters out "not entitled"
// buckets (remainingFraction === 0 + epoch resetTime — happens when Free-tier
// users see Pro models in the response they can't actually access).
function buildGeminiQuotaRows(buckets) {
  const isEntitled = (b) => !(b.remainingFraction === 0 && /^1970-01-01/.test(String(b.resetTime || '')));
  const families = [
    { key: 'pro',        label: 'Pro models',        match: /pro/i,                                  exclude: null },
    { key: 'flash-lite', label: 'Flash Lite models', match: /flash[-_.]?lite/i,                      exclude: null },
    { key: 'flash',      label: 'Flash models',      match: /flash/i,                                exclude: /flash[-_.]?lite/i },
  ];
  const rows = [];
  for (const fam of families) {
    const matched = buckets.filter((b) => fam.match.test(b.modelId || '') && (!fam.exclude || !fam.exclude.test(b.modelId || '')) && isEntitled(b));
    if (!matched.length) continue;
    // Most-constrained bucket in this family wins (lowest remainingFraction).
    const worst = matched.reduce((a, b) => (Number(a.remainingFraction) <= Number(b.remainingFraction) ? a : b));
    const remaining = Math.max(0, Math.min(1, Number(worst.remainingFraction)));
    rows.push({
      key: fam.key,
      label: fam.label,
      win: {
        usedPercent: (1 - remaining) * 100,
        resetsAt: worst.resetTime || null,
      },
    });
  }
  return rows;
}

async function fetchGeminiOAuthQuota() {
  const at = await ensureGeminiAccessToken();
  if (!at) return null;

  const headers = { 'Authorization': `Bearer ${at}`, 'Content-Type': 'application/json' };

  // loadCodeAssist gives us tier + project ID in one call. Treat as best-effort
  // — quota fetch can still proceed without the project hint (the endpoint
  // accepts an empty body).
  let project = null;
  let tierLabel = null;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch('https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist', {
      method: 'POST', headers,
      body: JSON.stringify({ metadata: { ideType: 'GEMINI_CLI', pluginType: 'GEMINI' } }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    if (res.ok) {
      const j = await res.json();
      project = j.cloudaicompanionProject || null;
      tierLabel = tierLabelFromGemini(j.currentTier);
    }
  } catch { /* non-fatal */ }

  // retrieveUserQuota
  let buckets;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch('https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota', {
      method: 'POST', headers,
      body: JSON.stringify(project ? { project } : {}),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    if (!res.ok) {
      const reason = (res.status === 401 || res.status === 403) ? 'auth_expired' : 'network';
      return withQuotaCache('gemini-cli', null, reason);
    }
    const j = await res.json();
    buckets = Array.isArray(j.buckets) ? j.buckets : [];
  } catch { return withQuotaCache('gemini-cli', null, 'network'); }

  const rows = buildGeminiQuotaRows(buckets);
  if (!rows.length && !tierLabel) {
    return withQuotaCache('gemini-cli', null, 'empty_response');
  }

  return withQuotaCache('gemini-cli', {
    rows, // [{ key, label, win: { usedPercent, resetsAt } }]
    planTier: tierLabel,
  });
}

async function fetchGeminiCLILocal(days) {
  if (!fs.existsSync(GEMINI_TMP_DIR)) {
    throw new Error('No local Gemini CLI data (~/.gemini/tmp/ missing). Install gemini-cli.');
  }
  const cutoffMs = Date.now() - days * 86400 * 1000;
  const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;

  const byModel = {};
  const byDay = new Map();
  const byDayDetail = new Map();
  const byProject = new Map(); // slug → aggregate
  const seenIds = new Set();
  let inTok = 0, outTok = 0, cachedTok = 0, thoughtsTok = 0, toolTok = 0, req = 0, totalCost = 0;

  // Each project has ~/.gemini/tmp/<slug>/chats/*.json — walk all of them.
  // Gemini CLI uses a slug derived from the cwd as the folder name; in some
  // versions it's a short slug ("rina-email-builder"), in others a hash.
  let projectDirs;
  try { projectDirs = fs.readdirSync(GEMINI_TMP_DIR, { withFileTypes: true }); } catch { projectDirs = []; }

  for (const pd of projectDirs) {
    if (!pd.isDirectory()) continue;
    const chatsDir = path.join(GEMINI_TMP_DIR, pd.name, 'chats');
    if (!fs.existsSync(chatsDir)) continue;

    const projectSlug = pd.name;
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
      let sessionContributed = false;
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

        const det = byDayDetail.get(dayKey) || { input: 0, output: 0, cached: 0, reasoning: 0, tool: 0, requests: 0, cost: 0 };
        det.input     += t.input    || 0;
        det.output    += t.output   || 0;
        det.cached    += t.cached   || 0;
        det.reasoning += t.thoughts || 0;
        det.tool      += t.tool     || 0;
        det.requests  += 1;
        det.cost      += cost;
        byDayDetail.set(dayKey, det);

        // Project bucket — slug from folder name (Gemini doesn't write a cwd
        // field into the session JSON, so the slug is all we have).
        const proj = byProject.get(projectSlug) || {
          cwd: projectSlug,
          project: friendlyProjectName(projectSlug),
          input: 0, output: 0, cached: 0, reasoning: 0, tool: 0, requests: 0, cost: 0,
          modelsMap: new Map(),
          sessions: 0,
        };
        proj.input     += t.input    || 0;
        proj.output    += t.output   || 0;
        proj.cached    += t.cached   || 0;
        proj.reasoning += t.thoughts || 0;
        proj.tool      += t.tool     || 0;
        proj.requests  += 1;
        proj.cost      += cost;
        const m = proj.modelsMap.get(model) || { model, requests: 0, cost: 0 };
        m.requests += 1; m.cost += cost;
        proj.modelsMap.set(model, m);
        if (!sessionContributed) { proj.sessions += 1; sessionContributed = true; }
        byProject.set(projectSlug, proj);
      }
    }
  }

  const sortedTrend = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([_, v]) => v);
  const dailyBreakdown = [...byDayDetail.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));
  const byProjectArr = [...byProject.values()]
    .map(({ modelsMap, ...rest }) => ({
      ...rest,
      models: [...modelsMap.values()].sort((a, b) => b.cost - a.cost),
    }))
    .sort((a, b) => b.cost - a.cost);

  return {
    totals: {
      input: inTok, output: outTok, cached: cachedTok,
      reasoning: thoughtsTok, tool: toolTok,
      requests: req, cost: totalCost, currency: 'USD',
    },
    models: Object.values(byModel).sort((a, b) => b.cost - a.cost),
    byProject: byProjectArr,
    trend: sortedTrend,
    dailyBreakdown,
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

// ===========================================================================
// Tokenly Chat — direct-to-API chat with OpenAI / Anthropic / Google
// ===========================================================================
// Three concerns kept together so the file stays grep-able:
//   1. Chat keys (separate from admin/usage keys above — chat uses regular keys)
//   2. Streaming completions per provider (SSE parsing)
//   3. Conversation persistence on disk
//   4. Voice: Whisper STT + OpenAI TTS
//   5. Global push-to-talk + voice-mode hotkeys
// All API calls happen here in main so keys never cross to renderer.

const CHAT_PROVIDERS = ['openai', 'anthropic', 'google'];
function chatKeyId(p) { return 'chat-' + p; }

function loadChatKeys() {
  const all = loadKeys();
  const out = {};
  for (const p of CHAT_PROVIDERS) {
    const v = all[chatKeyId(p)];
    if (v) out[p] = v;
  }
  return out;
}

ipcMain.handle('chat:keys-meta', () => {
  const all = loadKeys();
  const meta = {};
  for (const p of CHAT_PROVIDERS) {
    const v = all[chatKeyId(p)];
    meta[p] = v ? { present: true, tail: v.slice(-4) } : { present: false };
  }
  return meta;
});
ipcMain.handle('chat:set-key', (_e, provider, value) => {
  if (!CHAT_PROVIDERS.includes(provider)) throw new Error('unknown provider');
  const all = loadKeys();
  if (!value) delete all[chatKeyId(provider)]; else all[chatKeyId(provider)] = value;
  saveKeys(all);
  // Bust the Google model cache so the next chat-sheet open re-discovers
  // models with the new key (or falls back if removed).
  if (provider === 'google') googleModelsCache = null;
  return true;
});

// Curated default model lists — kept short so the dropdown is scannable.
// User can also type a custom model id via the "Custom…" input.
const CHAT_MODELS = {
  openai: [
    { id: 'gpt-5',          label: 'GPT-5',        desc: 'Most capable' },
    { id: 'gpt-5-mini',     label: 'GPT-5 mini',   desc: 'Fast + cheap' },
    { id: 'gpt-4o',         label: 'GPT-4o',       desc: 'Multimodal' },
    { id: 'gpt-4o-mini',    label: 'GPT-4o mini',  desc: 'Cheapest' },
    { id: 'o3',             label: 'o3',           desc: 'Reasoning' },
    { id: 'o3-mini',        label: 'o3-mini',      desc: 'Fast reasoning' },
  ],
  anthropic: [
    { id: 'claude-opus-4-7',         label: 'Claude Opus 4.7',   desc: 'Most capable' },
    { id: 'claude-sonnet-4-6',       label: 'Claude Sonnet 4.6', desc: 'Balanced' },
    { id: 'claude-haiku-4-5',        label: 'Claude Haiku 4.5',  desc: 'Fast + cheap' },
  ],
  google: [
    { id: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro',        desc: 'Most capable' },
    { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash',      desc: 'Fast' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', desc: 'Cheapest' },
    { id: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash',      desc: 'Legacy' },
  ],
};

// Live model discovery for Google — hit ListModels with the user's key so the
// dropdown reflects whatever Google currently exposes (gemini-3-* preview ids
// flip in/out of availability frequently). Falls back to the curated list if
// the call fails or the key is missing. 5-min cache so repeated chat-sheet
// opens don't spam the API.
let googleModelsCache = null;
async function listGoogleChatModels() {
  if (googleModelsCache && Date.now() - googleModelsCache.at < 5 * 60 * 1000) {
    return googleModelsCache.list;
  }
  const keys = loadKeys();
  const key = keys[chatKeyId('google')];
  if (!key) return CHAT_MODELS.google;
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=200`,
      { signal: ctrl.signal },
    );
    clearTimeout(timeout);
    if (!res.ok) {
      // Cache the failure too so we don't slow every chat-sheet open by
      // re-hitting a key that just got revoked.
      googleModelsCache = { at: Date.now(), list: CHAT_MODELS.google };
      return CHAT_MODELS.google;
    }
    const json = await res.json();
    const all = Array.isArray(json.models) ? json.models : [];
    // Keep any Gemini model that supports both generateContent and the
    // streaming endpoint (Tokenly uses streamGenerateContent). Explicitly
    // exclude the legacy 1.0 family (`gemini-pro`, `gemini-pro-vision`) —
    // those throw "Multiturn chat is not enabled" — and the helper SKUs
    // (embedding, aqa, imagen, tuning, vision-only). Everything else is
    // surfaced so newly-released versions show up automatically.
    const seen = new Set();
    const out = [];
    for (const m of all) {
      const id = String(m.name || '').replace(/^models\//, '');
      if (!id.startsWith('gemini-')) continue;
      const methods = m.supportedGenerationMethods || [];
      if (!methods.includes('generateContent')) continue;
      if (!methods.includes('streamGenerateContent')) continue;
      // Helper SKUs that aren't chat models.
      if (/embedding|aqa|imagen|tuning/i.test(id)) continue;
      // Legacy 1.0 chat models — fail multi-turn on the v1beta endpoint.
      // (`gemini-pro`, `gemini-pro-vision`, `gemini-1.0-pro*`)
      if (id === 'gemini-pro' || id === 'gemini-pro-vision') continue;
      if (/^gemini-1\.0-/.test(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      const label = m.displayName || id;
      out.push({ id, label });
    }
    if (!out.length) return CHAT_MODELS.google;
    // Sort newest-version first so 3.x > 2.5 > 2.0 > 1.5, then pro before
    // flash, dated/preview last.
    const versionScore = (id) => {
      const m = id.match(/gemini-(\d+(?:\.\d+)?)/);
      return m ? parseFloat(m[1]) : 0;
    };
    const tierScore = (id) => {
      if (/-pro/.test(id) && !/-flash/.test(id)) return 3;
      if (/-flash(?!-lite)/.test(id)) return 2;
      if (/-flash-lite/.test(id)) return 1;
      return 0;
    };
    out.sort((a, b) => {
      const v = versionScore(b.id) - versionScore(a.id);
      if (v) return v;
      const t = tierScore(b.id) - tierScore(a.id);
      if (t) return t;
      // Stable models (no preview/date suffix) before preview/dated.
      const aPreview = /preview|exp|\d{4}/.test(a.id);
      const bPreview = /preview|exp|\d{4}/.test(b.id);
      if (aPreview !== bPreview) return aPreview ? 1 : -1;
      return a.id.localeCompare(b.id);
    });
    googleModelsCache = { at: Date.now(), list: out };
    return out;
  } catch {
    googleModelsCache = { at: Date.now(), list: CHAT_MODELS.google };
    return CHAT_MODELS.google;
  }
}

ipcMain.handle('chat:list-models', async () => {
  // Run Google discovery in parallel; OpenAI + Anthropic stay curated since
  // their list endpoints aren't worth the round-trip for a stable list.
  const google = await listGoogleChatModels();
  return { ...CHAT_MODELS, google };
});

// --- SSE line splitter ------------------------------------------------------
// Web Streams arrive as Uint8Array chunks; SSE events are delimited by blank
// lines, with each event made up of `event:` / `data:` lines. We accumulate
// into a buffer, split on \n\n, and yield events.
async function* sseEvents(response) {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const ev = { event: 'message', data: '' };
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) ev.event = line.slice(6).trim();
        else if (line.startsWith('data:')) ev.data += (ev.data ? '\n' : '') + line.slice(5).trim();
      }
      if (ev.data || ev.event !== 'message') yield ev;
    }
  }
}

// --- Provider-specific streamers --------------------------------------------
// Each streams: { type: 'delta', text } or { type: 'usage', input, output, cost }
// or { type: 'done' } or { type: 'error', message }.
// `signal` is an AbortSignal so we can cancel mid-stream.

async function* streamOpenAI({ key, model, messages, system, signal }) {
  const body = {
    model,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages,
    ],
    stream: true,
    stream_options: { include_usage: true },
  };
  let res;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    yield { type: 'error', message: err?.message || String(err) };
    return;
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    yield { type: 'error', message: `OpenAI ${res.status}: ${txt.slice(0, 300)}` };
    return;
  }
  let usageEvt = null;
  try {
    for await (const ev of sseEvents(res)) {
      if (ev.data === '[DONE]') break;
      let json;
      try { json = JSON.parse(ev.data); } catch { continue; }
      const choice = json.choices && json.choices[0];
      const delta = choice && choice.delta && choice.delta.content;
      if (delta) yield { type: 'delta', text: delta };
      if (json.usage) usageEvt = json.usage;
    }
  } catch (err) {
    if (err?.name !== 'AbortError') {
      yield { type: 'error', message: err?.message || String(err) };
      return;
    }
  }
  if (usageEvt) {
    yield {
      type: 'usage',
      input: usageEvt.prompt_tokens || 0,
      output: usageEvt.completion_tokens || 0,
      cached: usageEvt.prompt_tokens_details?.cached_tokens || 0,
    };
  }
  yield { type: 'done' };
}

// OpenAI Responses API — used when web search is enabled. Different SSE shape
// than chat.completions; emits typed events like response.output_text.delta.
async function* streamOpenAIResponses({ key, model, messages, system, webSearch, signal }) {
  const body = {
    model,
    input: messages.map((m) => ({ role: m.role, content: m.content })),
    ...(system ? { instructions: system } : {}),
    ...(webSearch ? { tools: [{ type: 'web_search_preview' }] } : {}),
    stream: true,
  };
  let res;
  try {
    res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    yield { type: 'error', message: err?.message || String(err) };
    return;
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    yield { type: 'error', message: `OpenAI ${res.status}: ${txt.slice(0, 300)}` };
    return;
  }
  let usageEvt = null;
  let citations = [];
  try {
    for await (const ev of sseEvents(res)) {
      if (!ev.data || ev.data === '[DONE]') continue;
      let json;
      try { json = JSON.parse(ev.data); } catch { continue; }
      const t = json.type || ev.event;
      if (t === 'response.output_text.delta' && typeof json.delta === 'string') {
        yield { type: 'delta', text: json.delta };
      } else if (t === 'response.completed' && json.response) {
        usageEvt = json.response.usage;
        // Pull URL citations from any finished web_search annotation set.
        const out = Array.isArray(json.response.output) ? json.response.output : [];
        for (const item of out) {
          const parts = Array.isArray(item.content) ? item.content : [];
          for (const p of parts) {
            const anns = Array.isArray(p.annotations) ? p.annotations : [];
            for (const a of anns) {
              if (a.type === 'url_citation' && a.url) {
                citations.push({ url: a.url, title: a.title || a.url });
              }
            }
          }
        }
      } else if (t === 'response.failed' || t === 'response.incomplete' || t === 'error') {
        const m = json.response?.error?.message || json.error?.message || 'response failed';
        yield { type: 'error', message: `OpenAI: ${m}` };
        return;
      }
    }
  } catch (err) {
    if (err?.name !== 'AbortError') {
      yield { type: 'error', message: err?.message || String(err) };
      return;
    }
  }
  if (citations.length) yield { type: 'citations', items: citations };
  if (usageEvt) {
    yield {
      type: 'usage',
      input: usageEvt.input_tokens || 0,
      output: usageEvt.output_tokens || 0,
      cached: usageEvt.input_tokens_details?.cached_tokens || 0,
    };
  }
  yield { type: 'done' };
}

async function* streamAnthropic({ key, model, messages, system, webSearch, signal }) {
  const body = {
    model,
    max_tokens: 4096,
    stream: true,
    messages,
    ...(system ? { system } : {}),
    ...(webSearch ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }] } : {}),
  };
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    yield { type: 'error', message: err?.message || String(err) };
    return;
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    yield { type: 'error', message: `Anthropic ${res.status}: ${txt.slice(0, 300)}` };
    return;
  }
  let inputTokens = 0, outputTokens = 0, cachedRead = 0, cacheCreate = 0;
  const citations = [];
  try {
    for await (const ev of sseEvents(res)) {
      let json;
      try { json = JSON.parse(ev.data); } catch { continue; }
      if (ev.event === 'message_start' && json.message?.usage) {
        inputTokens = json.message.usage.input_tokens || 0;
        cachedRead = json.message.usage.cache_read_input_tokens || 0;
        cacheCreate = json.message.usage.cache_creation_input_tokens || 0;
      }
      if (ev.event === 'content_block_delta' && json.delta?.type === 'text_delta') {
        yield { type: 'delta', text: json.delta.text || '' };
      }
      // Capture web_search citations from completed search-result blocks.
      if (ev.event === 'content_block_start' && json.content_block?.type === 'web_search_tool_result') {
        const results = json.content_block.content;
        if (Array.isArray(results)) {
          for (const r of results) {
            if (r.url) citations.push({ url: r.url, title: r.title || r.url });
          }
        }
      }
      if (ev.event === 'message_delta' && json.usage) {
        outputTokens = json.usage.output_tokens || outputTokens;
      }
    }
  } catch (err) {
    if (err?.name !== 'AbortError') {
      yield { type: 'error', message: err?.message || String(err) };
      return;
    }
  }
  if (citations.length) yield { type: 'citations', items: citations };
  yield { type: 'usage', input: inputTokens, output: outputTokens, cached: cachedRead, cache_creation: cacheCreate };
  yield { type: 'done' };
}

async function* streamGoogle({ key, model, messages, system, webSearch, signal }) {
  // Gemini API uses contents[] with role 'user' | 'model'; system goes as systemInstruction.
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const body = {
    contents,
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    ...(webSearch ? { tools: [{ google_search: {} }] } : {}),
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    yield { type: 'error', message: err?.message || String(err) };
    return;
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    yield { type: 'error', message: `Google ${res.status}: ${txt.slice(0, 300)}` };
    return;
  }
  let lastUsage = null;
  let lastFinishReason = '';
  let anyText = false;
  const citations = [];
  try {
    for await (const ev of sseEvents(res)) {
      let json;
      try { json = JSON.parse(ev.data); } catch { continue; }
      // Promote a top-level error so the user sees why the stream is dead
      // instead of a silent empty bubble.
      if (json.error?.message) {
        yield { type: 'error', message: `Google: ${json.error.message}` };
        return;
      }
      const cand = json.candidates?.[0];
      const parts = cand?.content?.parts;
      if (parts) {
        for (const p of parts) {
          if (p.text) { yield { type: 'delta', text: p.text }; anyText = true; }
        }
      }
      if (cand?.finishReason) lastFinishReason = cand.finishReason;
      const grounding = json.candidates?.[0]?.groundingMetadata;
      if (grounding && Array.isArray(grounding.groundingChunks)) {
        for (const g of grounding.groundingChunks) {
          const w = g.web;
          if (w?.uri) citations.push({ url: w.uri, title: w.title || w.uri });
        }
      }
      if (json.usageMetadata) lastUsage = json.usageMetadata;
    }
  } catch (err) {
    if (err?.name !== 'AbortError') {
      yield { type: 'error', message: err?.message || String(err) };
      return;
    }
  }
  if (citations.length) yield { type: 'citations', items: citations };
  if (lastUsage) {
    yield {
      type: 'usage',
      input: lastUsage.promptTokenCount || 0,
      output: (lastUsage.candidatesTokenCount || 0) + (lastUsage.thoughtsTokenCount || 0),
      cached: lastUsage.cachedContentTokenCount || 0,
    };
  }
  // No text came back at all — surface the finishReason so the user knows
  // why (SAFETY, RECITATION, MAX_TOKENS, etc.) instead of an empty bubble.
  if (!anyText && lastFinishReason && lastFinishReason !== 'STOP') {
    yield { type: 'error', message: `Google returned no text (finishReason: ${lastFinishReason}).` };
    return;
  }
  yield { type: 'done' };
}

const STREAMERS = { openai: streamOpenAI, anthropic: streamAnthropic, google: streamGoogle };
// When web search is on for OpenAI, route through the Responses API instead.
const STREAMERS_WEBSEARCH = {
  openai: streamOpenAIResponses, anthropic: streamAnthropic, google: streamGoogle,
};

// --- Cost computation -------------------------------------------------------
// Mirrors the existing fetcher logic: regex-match model id against pricing
// table, fall back to provider default. Returns USD.
function pricingForChat(provider, modelId) {
  const tables = getPricingTablesForRenderer();
  // Tokenly's pricing table uses 'claude' as the key for anthropic models.
  const key = provider === 'anthropic' ? 'claude' : provider === 'google' ? 'gemini' : 'openai';
  const block = tables.providers[key];
  if (!block) return null;
  // Single source of truth for the cache-read multiplier — same helper
  // used by costFromUsage and costFromGeminiTokens in the poll path. Stops
  // the H1/H3 drift where chat path could pick up a remote multiplier
  // update while the poll path stayed on a hardcoded value.
  const cacheReadMul = getCacheReadMul(key);
  const lc = String(modelId).toLowerCase();
  for (const m of block.models) {
    try {
      const re = new RegExp(m.match || '', 'i');
      if (re.test(lc)) return { input: m.input, output: m.output, cache_read: cacheReadMul };
    } catch {}
  }
  // Defensive fallback when the remote payload omits a `default` block.
  // Without this, an otherwise-valid payload missing default crashed
  // pricingForChat → costUSD inside the chat:stream IPC. Returning {0, 0}
  // silently undercounts cost for unknown models — better than killing the
  // stream. validatePricingPayload should be tightened to reject this in a
  // future PR.
  const d = block.default || { input: 0, output: 0 };
  return { input: d.input, output: d.output, cache_read: cacheReadMul };
}

// Per-provider semantics for `usage.input` (set at the streamer boundary):
//   anthropic  → NEW input only. cached and cache_creation are SEPARATE
//                buckets — see streamAnthropic line ~3668: input_tokens is
//                guaranteed to exclude cache_read_input_tokens AND
//                cache_creation_input_tokens. Subtracting cached again would
//                under-bill input by up to 50% on cache-heavy turns.
//   openai     → TOTAL prompt tokens — cached is a SUBSET. Must subtract
//                to avoid double-billing cached at the input rate. See
//                streamOpenAI ~3624 reading prompt_tokens + cached_tokens.
//   google     → Same as openai. promptTokenCount is total, cached is subset.
//                See streamGoogle ~3769.
//
// Anthropic also emits `usage.cache_creation` (write-through to prompt cache)
// which OpenAI / Google don't. Billed at 1.25× input as a conservative
// 5-minute-cache rate; matches the poll-path fallback in costFromUsage when
// the 5m/1h split isn't reported. Adding the 5m/1h split would require
// capturing them as separate fields at the streamer boundary; deferred.
function costUSD(provider, modelId, usage) {
  const p = pricingForChat(provider, modelId);
  if (!p) return 0;
  const cached      = usage.cached || 0;
  const cacheCreate = usage.cache_creation || 0;
  const isAnthropic = provider === 'anthropic';
  const billedInput = isAnthropic
    ? (usage.input || 0)
    : Math.max(0, (usage.input || 0) - cached);
  return (
    (billedInput  / 1e6) * p.input +
    (cached       / 1e6) * p.input * (p.cache_read || 0.1) +
    (cacheCreate  / 1e6) * p.input * 1.25 +
    ((usage.output || 0) / 1e6) * p.output
  );
}

// --- Stream router (IPC) ----------------------------------------------------
const activeStreams = new Map(); // streamId -> AbortController

// Defense-in-depth: chat + voice IPCs check the license tier directly so
// even a UI bypass can't reach the streamers without an active Max + AI sub.
function requireMaxAi() {
  const lic = loadLicense();
  return !!(lic && lic.tier === 'max-ai');
}

ipcMain.handle('chat:stream', async (e, opts) => {
  const { streamId, provider, model, messages, system, webSearch } = opts || {};
  const wc = e.sender;
  const send = (payload) => { try { wc.send('chat:stream-event', { streamId, ...payload }); } catch {} };

  if (!requireMaxAi()) { send({ type: 'error', message: 'Tokenly Chat requires the Max + AI subscription.' }); return; }
  const map = webSearch ? STREAMERS_WEBSEARCH : STREAMERS;
  if (!map[provider]) { send({ type: 'error', message: 'unknown provider' }); return; }
  const keys = loadKeys();
  const key = keys[chatKeyId(provider)];
  if (!key) { send({ type: 'error', message: 'no_key' }); return; }
  if (!Array.isArray(messages) || messages.length === 0) { send({ type: 'error', message: 'no messages' }); return; }

  const ctrl = new AbortController();
  activeStreams.set(streamId, ctrl);

  try {
    let totalText = '';
    let usage = null;
    let citations = null;
    for await (const evt of map[provider]({ key, model, messages, system, webSearch, signal: ctrl.signal })) {
      if (evt.type === 'delta') {
        totalText += evt.text;
        send({ type: 'delta', text: evt.text });
      } else if (evt.type === 'usage') {
        usage = evt;
      } else if (evt.type === 'citations') {
        citations = evt.items;
        send({ type: 'citations', items: evt.items });
      } else if (evt.type === 'error') {
        send({ type: 'error', message: evt.message });
        return;
      }
    }
    const cost = usage ? costUSD(provider, model, usage) : 0;
    send({ type: 'done', text: totalText, usage: usage || null, cost, citations });
  } catch (err) {
    if (err?.name === 'AbortError') send({ type: 'aborted' });
    else send({ type: 'error', message: err?.message || String(err) });
  } finally {
    activeStreams.delete(streamId);
  }
});

ipcMain.handle('chat:cancel', (_e, streamId) => {
  const ctrl = activeStreams.get(streamId);
  if (ctrl) { try { ctrl.abort(); } catch {} }
  activeStreams.delete(streamId);
  return true;
});

// --- Conversation persistence -----------------------------------------------
// One JSON file per conversation under userData/conversations/.
// Sidecar: an index.json with lightweight metadata for fast list rendering.
function chatDir() {
  const dir = path.join(app.getPath('userData'), 'conversations');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}
function safeId(id) {
  return /^[A-Za-z0-9_-]{6,40}$/.test(String(id || '')) ? id : null;
}
ipcMain.handle('chat:list-conversations', () => {
  const dir = chatDir();
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json'); } catch {}
  const out = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const c = JSON.parse(raw);
      out.push({
        id: c.id, title: c.title || 'Untitled',
        provider: c.provider, model: c.model,
        createdAt: c.createdAt, updatedAt: c.updatedAt,
        messageCount: (c.messages || []).length,
        totals: c.totals || { input: 0, output: 0, cost: 0 },
        voiceMode: !!c.voiceMode,
        source: 'tokenly',
      });
    } catch {}
  }
  out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return out;
});
ipcMain.handle('chat:load-conversation', (_e, id) => {
  const safe = safeId(id);
  if (!safe) return null;
  try {
    const raw = fs.readFileSync(path.join(chatDir(), safe + '.json'), 'utf8');
    return JSON.parse(raw);
  } catch { return null; }
});
ipcMain.handle('chat:save-conversation', (_e, conv) => {
  if (!conv || typeof conv !== 'object') return { ok: false, error: 'bad payload' };
  const safe = safeId(conv.id);
  if (!safe) return { ok: false, error: 'bad id' };
  try {
    const file = path.join(chatDir(), safe + '.json');
    fs.writeFileSync(file, JSON.stringify(conv, null, 2));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});
ipcMain.handle('chat:delete-conversation', (_e, id) => {
  const safe = safeId(id);
  if (!safe) return { ok: false };
  try { fs.unlinkSync(path.join(chatDir(), safe + '.json')); return { ok: true }; }
  catch (err) { return { ok: false, error: err?.message || String(err) }; }
});
ipcMain.handle('chat:reveal-folder', () => {
  const dir = chatDir();
  shell.openPath(dir);
  return dir;
});

// --- Voice: transcribe (Whisper) and TTS (OpenAI) ---------------------------
// Both use the user's own chat-openai key — voice usage bills directly to
// the user's OpenAI account, same as text chat. Tokenly never proxies the
// audio; bytes go from the renderer (base64) → main → OpenAI directly.
ipcMain.handle('chat:transcribe', async (_e, { audioB64, mime, filename }) => {
  if (!requireMaxAi()) return { ok: false, error: 'Tokenly Chat requires the Max + AI subscription.' };
  const keys = loadKeys();
  const key = keys[chatKeyId('openai')];
  if (!key) return { ok: false, error: 'no_openai_key' };
  if (!audioB64) return { ok: false, error: 'no audio' };
  try {
    const buf = Buffer.from(audioB64, 'base64');
    // gpt-4o-mini-transcribe is materially faster than whisper-1 (and
    // cheaper) — but it's a newer model and not every OpenAI account has
    // access. Try it first; on a 403/404 fall back to whisper-1, which has
    // been universally available since the beginning of the audio API.
    const callTranscribe = async (modelId) => {
      const blob = new Blob([buf], { type: mime || 'audio/webm' });
      const form = new FormData();
      form.append('file', blob, filename || 'speech.webm');
      form.append('model', modelId);
      form.append('language', 'en');
      return fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}` },
        body: form,
      });
    };
    let res = await callTranscribe('gpt-4o-mini-transcribe');
    if (res.status === 403 || res.status === 404 || res.status === 400) {
      res = await callTranscribe('whisper-1');
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, error: `Transcribe ${res.status}: ${txt.slice(0, 300)}` };
    }
    const json = await res.json();
    return { ok: true, text: (json.text || '').trim() };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('chat:tts', async (_e, { text, voice = 'alloy', model = 'gpt-4o-mini-tts', format = 'mp3', instructions } = {}) => {
  if (!requireMaxAi()) return { ok: false, error: 'Tokenly Chat requires the Max + AI subscription.' };
  const keys = loadKeys();
  const key = keys[chatKeyId('openai')];
  if (!key) return { ok: false, error: 'no_openai_key' };
  if (!text) return { ok: false, error: 'no_text' };
  try {
    // 30s timeout — a hung TTS call would otherwise freeze the voice loop
    // since the play loop awaits each chunk's promise before moving on.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    // gpt-4o-mini-tts is the newer audio model — significantly more natural
    // pronunciation than tts-1 (correct unit symbols, decimal numbers,
    // abbreviations) and ~25x cheaper. The `instructions` field lets us
    // bias prosody for conversational delivery instead of newscast.
    const body = { model, voice, input: text.slice(0, 4000), response_format: format };
    if (instructions && /tts$/.test(model)) body.instructions = instructions;
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, error: `TTS ${res.status}: ${txt.slice(0, 300)}` };
    }
    const ab = await res.arrayBuffer();
    return { ok: true, audioB64: Buffer.from(ab).toString('base64'), mime: format === 'mp3' ? 'audio/mpeg' : 'audio/' + format };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

// --- Voice-plugin helpers ---------------------------------------------------
// Yahoo Finance's chart endpoint returns current-quote data without auth but
// expects a real User-Agent (browser fetch from a file:// origin gets blocked
// or returns CORS errors). Proxy through main so the renderer never has to
// deal with it.
ipcMain.handle('voice:fetch-stock', async (_e, symbol) => {
  if (!symbol || !/^[A-Z]{1,5}(\.[A-Z]{1,3})?$/i.test(String(symbol))) {
    return { ok: false, error: 'bad_symbol' };
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Tokenly)' },
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return { ok: false, error: `yahoo_${res.status}` };
    const j = await res.json();
    const r = j?.chart?.result?.[0];
    const meta = r?.meta;
    if (!meta || meta.regularMarketPrice == null) return { ok: false, error: 'no_quote' };
    const price = meta.regularMarketPrice;
    const prev  = meta.chartPreviousClose ?? meta.previousClose ?? price;
    return {
      ok: true,
      symbol: meta.symbol,
      price,
      previousClose: prev,
      changePercent: prev ? ((price - prev) / prev) * 100 : 0,
      currency: meta.currency,
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

// --- Voice prefs (primary AI, voice, hotkeys) -------------------------------
function loadVoicePrefs() {
  try {
    const p = path.join(app.getPath('userData'), 'voice-prefs.json');
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return {}; }
}
function saveVoicePrefs(obj) {
  try {
    const p = path.join(app.getPath('userData'), 'voice-prefs.json');
    fs.writeFileSync(p, JSON.stringify(obj, null, 2));
  } catch {}
}
ipcMain.handle('chat:get-prefs', () => {
  const cur = loadVoicePrefs();
  return {
    primary: cur.primary || { provider: 'openai', model: 'gpt-4o-mini' },
    voice: cur.voice || 'alloy',
    pttHotkey: cur.pttHotkey || 'CommandOrControl+Shift+Space',
    voiceModeHotkey: cur.voiceModeHotkey || 'CommandOrControl+Shift+V',
    hotkeysEnabled: cur.hotkeysEnabled !== false,
    // Favorite models per provider — pinned to the top of every model picker
    // (chat sheet + voice mate). Empty = no favorites set yet, picker shows
    // the full curated list as before.
    favoriteModels: cur.favoriteModels || { openai: [], anthropic: [], google: [] },
  };
});

// Returns a compact snapshot of the user's current usage data so VoiceMate
// can answer questions like "what's my Claude spend this week" or "how
// close am I to my Max 5h limit?". Mirrors what the popover cards display
// but flattened into a JSON shape the model can scan in ~3KB. We pull from
// the same in-flight cache the popover uses so this is essentially free.
ipcMain.handle('chat:usage-snapshot', async (_e, { days = 30 } = {}) => {
  const keys = loadKeys();
  const out = {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    providers: {},
    totals: { input: 0, output: 0, cost: 0 },
  };
  // We re-use the existing `fetchUsage` per-provider with its 8s cache so a
  // VoiceMate refresh during an active session doesn't double-hit the wire.
  const providers = ['claude-code', 'codex', 'gemini-cli', 'openai', 'anthropic', 'openrouter'];
  for (const provider of providers) {
    const keyless = provider === 'claude-code' || provider === 'codex' || provider === 'gemini-cli';
    const key = keys[provider];
    if (!keyless && !key) continue;
    let data;
    try {
      data = await fetchUsage(provider, key, days);
    } catch { continue; }
    if (!data) continue;

    const t = data.totals || {};
    const trend = Array.isArray(data.trend) ? data.trend : [];
    const costTrend = Array.isArray(data.costTrend) ? data.costTrend : [];
    const todayTokens = trend.length ? (trend[trend.length - 1] || 0) : 0;
    const todayCost   = costTrend.length ? (costTrend[costTrend.length - 1] || 0) : 0;

    // Top 5 models, ordered by cost. Trim to keep snapshot under 6KB.
    const topModels = (Array.isArray(data.models) ? data.models : [])
      .slice(0, 5)
      .map((m) => ({
        name: m.name || m.model || m.label || '?',
        input: m.input || 0,
        output: m.output || 0,
        cost: m.cost || 0,
        requests: m.requests || 0,
      }));

    // Quota — strip stale flags from the report; the model only needs the
    // numbers, not the cache metadata.
    let quota = null;
    if (data.quota && !data.quota._unavailable) {
      const q = data.quota;
      quota = {
        planTier: q.planTier || null,
        windows: {},
      };
      if (q.fiveHour)     quota.windows.fiveHour    = { usedPercent: q.fiveHour.usedPercent, resetsAt: q.fiveHour.resetsAt };
      if (q.sevenDay)     quota.windows.sevenDay    = { usedPercent: q.sevenDay.usedPercent, resetsAt: q.sevenDay.resetsAt };
      if (q.sevenDayOpus) quota.windows.sevenDayOpus = { usedPercent: q.sevenDayOpus.usedPercent, resetsAt: q.sevenDayOpus.resetsAt };
      if (Array.isArray(q.rows)) quota.windows.rows = q.rows.map((r) => ({ label: r.label, usedPercent: r.win?.usedPercent, resetsAt: r.win?.resetsAt }));
      if (q.extraUsage)   quota.extraUsage = q.extraUsage;
      if (q.credits)      quota.credits    = q.credits;
    }

    // Precomputed totals — the voice AI consistently undercounted "total
    // tokens" by ignoring cache reads (which can be 100x bigger than input
    // for prompt-cached workloads). Surface the right number explicitly.
    const cacheWrite = (t.cached || 0);
    const cacheRead  = (t.cache_read || 0);
    const total      = (t.input || 0) + (t.output || 0) + cacheRead + cacheWrite;
    out.providers[provider] = {
      tokens: {
        input: t.input || 0,
        output: t.output || 0,
        cache_write: cacheWrite,
        cache_read:  cacheRead,
        reasoning: t.reasoning || 0,
        // `total` is the canonical "total token use" figure — sum of every
        // billable / consumed token type. Always use this when answering
        // total-token questions.
        total,
      },
      cost: t.cost || 0,
      requests: t.requests || 0,
      todayTokens,
      todayCost,
      topModels,
      quota,
    };
    out.totals.input  += t.input  || 0;
    out.totals.output += t.output || 0;
    out.totals.cache_write = (out.totals.cache_write || 0) + cacheWrite;
    out.totals.cache_read  = (out.totals.cache_read  || 0) + cacheRead;
    out.totals.total       = (out.totals.total       || 0) + total;
    out.totals.cost   += t.cost   || 0;
  }

  // Today across all providers (sum of last day's bucket).
  let todayTotalCost = 0;
  for (const p of Object.values(out.providers)) todayTotalCost += p.todayCost || 0;
  out.totals.todayCost = todayTotalCost;

  return out;
});

// Toggle a single model into / out of the favorites list for a provider.
// Renderer calls this from the star icon in either model picker; we coalesce
// the change here so both pickers can stay in sync via chatGetPrefs.
ipcMain.handle('chat:toggle-favorite-model', (_e, { provider, model }) => {
  if (!['openai', 'anthropic', 'google'].includes(provider)) return null;
  if (!model || typeof model !== 'string') return null;
  const cur = loadVoicePrefs();
  const fav = cur.favoriteModels || { openai: [], anthropic: [], google: [] };
  const list = Array.isArray(fav[provider]) ? fav[provider].slice() : [];
  const idx = list.indexOf(model);
  if (idx >= 0) list.splice(idx, 1); else list.push(model);
  fav[provider] = list;
  saveVoicePrefs({ ...cur, favoriteModels: fav });
  return fav;
});
ipcMain.handle('chat:set-prefs', (_e, prefs) => {
  const cur = loadVoicePrefs();
  const next = { ...cur, ...(prefs || {}) };
  saveVoicePrefs(next);
  // Re-register hotkeys whenever they may have changed.
  registerChatHotkeys();
  return next;
});

// --- Global hotkeys ---------------------------------------------------------
// Two shortcuts:
//   pttHotkey       — press to record, release to send (push-to-talk)
//   voiceModeHotkey — toggles full voice conversation mode
// We register on app ready + whenever prefs change. Renderer handles the
// actual recording / playback; main just relays the hotkey events.
const { globalShortcut } = require('electron');
let chatHotkeysRegistered = [];

// Standalone voice mate window — frameless rounded panel for hands-free
// brainstorming. Single instance: re-pressing the hotkey focuses it.
let voiceMateWin = null;
function openVoiceMateWindow() {
  if (voiceMateWin && !voiceMateWin.isDestroyed()) {
    voiceMateWin.show(); voiceMateWin.focus();
    return voiceMateWin;
  }
  voiceMateWin = new BrowserWindow({
    width: 360, height: 460,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    skipTaskbar: false,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: commonWebPrefs,
  });
  voiceMateWin.loadFile('index.html', { hash: 'voicemate' });
  // Position: center over the Tokenly popover when it's visible (the user
  // is engaging with the app — voice should feel like an overlay layered
  // *over* it, not a separate destination off in a corner). When the
  // popover isn't visible (⌘⇧V from another app), default to top-right of
  // the active display so it doesn't crowd whatever's focused.
  try {
    const wb = voiceMateWin.getBounds();
    const popoverVisible = popoverWin && !popoverWin.isDestroyed() && popoverWin.isVisible();
    if (popoverVisible) {
      const pb = popoverWin.getBounds();
      const display = screen.getDisplayMatching(pb);
      const work = display.workArea;
      let x = Math.round(pb.x + pb.width / 2 - wb.width / 2);
      // Sit a little below the top of the popover so the floating card
      // doesn't blot out the popover's header (refresh / hamburger / etc.
      // stay reachable underneath).
      let y = Math.round(pb.y + 60);
      // Clamp to the active display's work area.
      x = Math.max(work.x + 8, Math.min(x, work.x + work.width  - wb.width  - 8));
      y = Math.max(work.y + 8, Math.min(y, work.y + work.height - wb.height - 8));
      voiceMateWin.setPosition(x, y, false);
    } else {
      const cursor = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursor);
      voiceMateWin.setPosition(
        Math.round(display.workArea.x + display.workArea.width - wb.width - 24),
        Math.round(display.workArea.y + 80),
        false
      );
    }
  } catch {}
  voiceMateWin.once('ready-to-show', () => { voiceMateWin.show(); voiceMateWin.focus(); });
  voiceMateWin.on('closed', () => { voiceMateWin = null; });
  return voiceMateWin;
}

ipcMain.handle('voicemate:close', () => {
  if (voiceMateWin && !voiceMateWin.isDestroyed()) voiceMateWin.close();
  return true;
});

// Renderer-side trigger for opening the voice window (used by the in-chat
// CTA button + the main-popover Voice AI shortcut). Equivalent to pressing
// ⌘⇧V — gated to Max + AI in the renderer so we don't open a useless window.
ipcMain.handle('voicemate:open', () => {
  const lic = loadLicense();
  if (!lic || lic.tier !== 'max-ai') return { ok: false, reason: 'not_max_ai' };
  openVoiceMateWindow();
  return { ok: true };
});

function registerChatHotkeys() {
  for (const acc of chatHotkeysRegistered) {
    try { globalShortcut.unregister(acc); } catch {}
  }
  chatHotkeysRegistered = [];
  const prefs = loadVoicePrefs();
  if (prefs.hotkeysEnabled === false) return;

  const ptt = prefs.pttHotkey || 'CommandOrControl+Shift+Space';
  const vm  = prefs.voiceModeHotkey || 'CommandOrControl+Shift+V';

  const surfaceChat = () => {
    // Surface the popover (creating it if needed) so the chat sheet is visible
    // when the user fires PTT from another app.
    try {
      if (popoverWin && !popoverWin.isDestroyed()) {
        if (!popoverWin.isVisible()) { popoverJustToggled = Date.now(); positionPopoverUnderTray(); popoverWin.show(); popoverWin.focus(); }
      } else if (desktopWin && !desktopWin.isDestroyed()) {
        desktopWin.show(); desktopWin.focus();
      } else {
        createPopoverWindow();
        popoverJustToggled = Date.now(); positionPopoverUnderTray(); popoverWin.show(); popoverWin.focus();
      }
    } catch {}
  };

  try {
    if (globalShortcut.register(ptt, () => {
      surfaceChat();
      // Relay to renderer to toggle live transcription in the chat composer.
      for (const w of BrowserWindow.getAllWindows()) {
        try { w.webContents.send('chat:hotkey', { kind: 'ptt' }); } catch {}
      }
    })) chatHotkeysRegistered.push(ptt);
  } catch (err) { console.warn('[hotkey] PTT register failed:', err?.message || err); }
  try {
    if (globalShortcut.register(vm, () => {
      // Voice AI is gated on Max + AI. If the user lacks that tier, surface
      // the chat window in upsell mode rather than opening a useless voice UI.
      const lic = loadLicense();
      if (lic && lic.tier === 'max-ai') {
        openVoiceMateWindow();
      } else {
        surfaceChat();
        for (const w of BrowserWindow.getAllWindows()) {
          try { w.webContents.send('license-upsell', { feature: 'voice' }); } catch {}
        }
      }
    })) chatHotkeysRegistered.push(vm);
  } catch (err) { console.warn('[hotkey] VoiceMate register failed:', err?.message || err); }
}
app.whenReady().then(() => { try { registerChatHotkeys(); } catch (err) { console.warn('[hotkey] init failed:', err?.message || err); } });
app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch {} });

// --- Unified history (chat conversations + parsed Claude Code sessions) -----
// Reads ~/.claude/projects/*/*.jsonl headers to surface session-level metadata
// without loading whole transcripts up front. The full transcript is loaded
// on demand via chat:load-claude-session.
ipcMain.handle('chat:list-claude-sessions', async (_e, { limit = 100 } = {}) => {
  const root = CLAUDE_PROJECTS_DIR;
  if (!fs.existsSync(root)) return [];
  const out = [];
  let projects;
  try { projects = fs.readdirSync(root); } catch { return []; }
  for (const proj of projects) {
    const projDir = path.join(root, proj);
    let entries = [];
    try { entries = fs.readdirSync(projDir).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of entries) {
      const full = path.join(projDir, f);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      // Read the first ~32KB to grab a title hint without parsing everything.
      let head = '';
      try {
        const fd = fs.openSync(full, 'r');
        const buf = Buffer.alloc(Math.min(32 * 1024, stat.size));
        fs.readSync(fd, buf, 0, buf.length, 0);
        fs.closeSync(fd);
        head = buf.toString('utf8');
      } catch {}
      let title = '';
      let model = '';
      let messageCount = 0;
      const lines = head.split('\n');
      for (const ln of lines) {
        if (!ln.trim()) continue;
        try {
          const j = JSON.parse(ln);
          // The first user message often carries the prompt text.
          if (!title && j.message?.role === 'user') {
            const c = j.message.content;
            if (typeof c === 'string') title = c.trim().slice(0, 120);
            else if (Array.isArray(c)) {
              const txt = c.find((p) => p.type === 'text');
              if (txt?.text) title = String(txt.text).trim().slice(0, 120);
            }
          }
          if (!model && j.message?.model) model = j.message.model;
          if (j.type === 'user' || j.type === 'assistant') messageCount++;
        } catch {}
      }
      out.push({
        id: `claude:${proj}/${f}`,
        title: title || f.replace(/\.jsonl$/, ''),
        provider: 'anthropic',
        model: model || 'claude',
        project: decodeClaudeProject(proj),
        createdAt: stat.birthtimeMs || stat.mtimeMs,
        updatedAt: stat.mtimeMs,
        messageCount, // approximate from head only
        sizeBytes: stat.size,
        source: 'claude-code',
      });
    }
  }
  out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return out.slice(0, limit);
});

function decodeClaudeProject(slug) {
  // Claude Code encodes project paths as -Users-foo-bar; reverse to /Users/foo/bar
  // and return just the basename for compactness.
  const decoded = String(slug).replace(/^-/, '/').replace(/-/g, '/');
  return path.basename(decoded);
}

// Strip slash-command markup, system-reminders, and command-output blocks
// that Claude Code injects into user messages — they're machinery, not what
// the user typed. Plus: image placeholders we can't render.
function cleanClaudeText(s) {
  if (!s) return '';
  return String(s)
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, '')
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
    .replace(/<command-args>[\s\S]*?<\/command-args>/g, '')
    .replace(/<command-stdout>[\s\S]*?<\/command-stdout>/g, '')
    .replace(/<command-stderr>[\s\S]*?<\/command-stderr>/g, '')
    .replace(/<command-output>[\s\S]*?<\/command-output>/g, '')
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '')
    .replace(/<local-command-stderr>[\s\S]*?<\/local-command-stderr>/g, '')
    .replace(/<bash-input>[\s\S]*?<\/bash-input>/g, '')
    .replace(/<bash-stdout>[\s\S]*?<\/bash-stdout>/g, '')
    .replace(/<bash-stderr>[\s\S]*?<\/bash-stderr>/g, '')
    .replace(/<user-prompt-submit-hook>[\s\S]*?<\/user-prompt-submit-hook>/g, '')
    .replace(/\[Image #\d+\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

ipcMain.handle('chat:load-claude-session', async (_e, id) => {
  if (!String(id || '').startsWith('claude:')) return null;
  const rel = id.slice(7);
  const slash = rel.indexOf('/');
  if (slash < 0) return null;
  const proj = rel.slice(0, slash);
  const file = rel.slice(slash + 1);
  if (proj.includes('..') || file.includes('..')) return null;
  const full = path.join(CLAUDE_PROJECTS_DIR, proj, file);
  if (!full.startsWith(CLAUDE_PROJECTS_DIR)) return null;
  let raw;
  try { raw = fs.readFileSync(full, 'utf8'); } catch { return null; }
  const rawMessages = [];
  for (const ln of raw.split('\n')) {
    if (!ln.trim()) continue;
    try {
      const j = JSON.parse(ln);
      if (j.type !== 'user' && j.type !== 'assistant') continue;
      // Skip subagent chatter and system meta-events — neither belongs in
      // the readable transcript.
      if (j.isSidechain) continue;
      if (j.isMeta) continue;

      const role = j.type;
      const c = j.message?.content;
      let text = '';
      if (typeof c === 'string') {
        text = c;
      } else if (Array.isArray(c)) {
        // Show only the conversation surface — drop tool_use, tool_result, and
        // thinking blocks. The user wants the readable transcript, not the
        // agent's scratchpad.
        text = c
          .filter((p) => p.type === 'text' && p.text)
          .map((p) => p.text)
          .join('\n');
      }
      text = cleanClaudeText(text);
      // Skip turns that are pure tool plumbing / markup (nothing left after cleanup).
      if (!text) continue;
      rawMessages.push({ role, content: text, timestamp: j.timestamp ? Date.parse(j.timestamp) : null });
    } catch {}
  }

  // Collapse consecutive same-role runs — Claude Code emits an assistant
  // message for each step in a tool-using sequence ("let me check…", "now
  // I'll try…", "here's the answer"). The user wants the final response per
  // turn, not the running narration. For each run, keep the last message
  // (the closing reply) and discard the intermediate thinking-aloud noise.
  const messages = [];
  for (let i = 0; i < rawMessages.length; i++) {
    const cur = rawMessages[i];
    const next = rawMessages[i + 1];
    if (next && next.role === cur.role) continue; // not the last in this run
    messages.push(cur);
  }

  return {
    id, source: 'claude-code',
    title: path.basename(file, '.jsonl'),
    provider: 'anthropic',
    model: 'claude',
    project: decodeClaudeProject(proj),
    messages,
  };
});

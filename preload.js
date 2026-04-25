const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getKeyMeta: () => ipcRenderer.invoke('keys:get-meta'),
  setKey: (provider, value) => ipcRenderer.invoke('keys:set', provider, value),
  fetchUsage: (provider, days) => ipcRenderer.invoke('usage:fetch', provider, days),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  detachWindow: () => ipcRenderer.invoke('window:detach'),
  minimizeToTray: () => ipcRenderer.invoke('window:minimize-to-tray'),
  onRefreshNow: (cb) => ipcRenderer.on('refresh-now', cb),
  mode: () => {
    if (typeof location === 'undefined') return 'popover';
    if (location.hash === '#desktop') return 'desktop';
    if (location.hash === '#voicemate') return 'voicemate';
    return 'popover';
  },
  voiceMateClose: () => ipcRenderer.invoke('voicemate:close'),
  voiceMateOpen: () => ipcRenderer.invoke('voicemate:open'),
  revealDiagnostic: () => ipcRenderer.invoke('diagnostic:reveal'),
  setTrayTitle: (title) => ipcRenderer.invoke('tray:set-title', title),
  getPricingTables: () => ipcRenderer.invoke('pricing:get-tables'),
  refreshPricing: () => ipcRenderer.invoke('pricing:refresh'),
  onOpenPricing: (cb) => ipcRenderer.on('open-pricing', cb),
  getBudgets: () => ipcRenderer.invoke('budgets:get'),
  setBudgets: (budgets) => ipcRenderer.invoke('budgets:set', budgets),
  maybeFireAlerts: (alerts) => ipcRenderer.invoke('alerts:maybe-fire', alerts),
  maybeFireDailySummary: (payload) => ipcRenderer.invoke('alerts:maybe-fire-summary', payload),
  getLicense: () => ipcRenderer.invoke('license:get'),
  activateLicense: (code) => ipcRenderer.invoke('license:activate', code),
  deactivateLicense: () => ipcRenderer.invoke('license:deactivate'),
  onLicenseChanged: (cb) => ipcRenderer.on('license-changed', (_e, state) => cb(state)),
  onLicenseUpsell: (cb) => ipcRenderer.on('license-upsell', (_e, payload) => cb(payload)),
  saveExportFile: (payload) => ipcRenderer.invoke('export:save-file', payload),
  exportChartsPdf: (payload) => ipcRenderer.invoke('export:charts-pdf', payload),
  saveBinaryFile: (payload) => ipcRenderer.invoke('export:save-binary', payload),
  saveBundle: (payload) => ipcRenderer.invoke('export:save-bundle', payload),
  captureRegion: (rect) => ipcRenderer.invoke('export:capture-region', rect),
  captureHtml: (payload) => ipcRenderer.invoke('export:capture-html', payload),
  getLaunchAtLogin: () => ipcRenderer.invoke('prefs:launch-at-login:get'),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke('prefs:launch-at-login:set', enabled),
  getChangelog: () => ipcRenderer.invoke('changelog:get'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  onUpdateInstalled: (cb) => ipcRenderer.on('update-installed', (_e, payload) => cb(payload)),

  // --- Tokenly Chat (text + voice) ---
  chatKeysMeta: () => ipcRenderer.invoke('chat:keys-meta'),
  chatSetKey: (provider, value) => ipcRenderer.invoke('chat:set-key', provider, value),
  chatListModels: () => ipcRenderer.invoke('chat:list-models'),
  chatStream: (opts) => ipcRenderer.invoke('chat:stream', opts),
  chatCancel: (streamId) => ipcRenderer.invoke('chat:cancel', streamId),
  onChatStreamEvent: (cb) => ipcRenderer.on('chat:stream-event', (_e, payload) => cb(payload)),

  chatListConversations: () => ipcRenderer.invoke('chat:list-conversations'),
  chatLoadConversation: (id) => ipcRenderer.invoke('chat:load-conversation', id),
  chatSaveConversation: (conv) => ipcRenderer.invoke('chat:save-conversation', conv),
  chatDeleteConversation: (id) => ipcRenderer.invoke('chat:delete-conversation', id),
  chatRevealFolder: () => ipcRenderer.invoke('chat:reveal-folder'),

  chatTranscribe: (payload) => ipcRenderer.invoke('chat:transcribe', payload),
  chatTts: (payload) => ipcRenderer.invoke('chat:tts', payload),

  chatGetPrefs: () => ipcRenderer.invoke('chat:get-prefs'),
  chatSetPrefs: (prefs) => ipcRenderer.invoke('chat:set-prefs', prefs),
  chatToggleFavoriteModel: (payload) => ipcRenderer.invoke('chat:toggle-favorite-model', payload),
  chatUsageSnapshot: (opts) => ipcRenderer.invoke('chat:usage-snapshot', opts || {}),
  onChatHotkey: (cb) => ipcRenderer.on('chat:hotkey', (_e, payload) => cb(payload)),

  chatListClaudeSessions: (opts) => ipcRenderer.invoke('chat:list-claude-sessions', opts || {}),
  chatLoadClaudeSession: (id) => ipcRenderer.invoke('chat:load-claude-session', id),
});

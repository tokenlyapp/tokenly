const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getKeyMeta: () => ipcRenderer.invoke('keys:get-meta'),
  setKey: (provider, value) => ipcRenderer.invoke('keys:set', provider, value),
  fetchUsage: (provider, days) => ipcRenderer.invoke('usage:fetch', provider, days),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  detachWindow: () => ipcRenderer.invoke('window:detach'),
  minimizeToTray: () => ipcRenderer.invoke('window:minimize-to-tray'),
  onRefreshNow: (cb) => ipcRenderer.on('refresh-now', cb),
  mode: () => (typeof location !== 'undefined' && location.hash === '#desktop' ? 'desktop' : 'popover'),
  revealDiagnostic: () => ipcRenderer.invoke('diagnostic:reveal'),
  setTrayTitle: (title) => ipcRenderer.invoke('tray:set-title', title),
  getPricingTables: () => ipcRenderer.invoke('pricing:get-tables'),
  refreshPricing: () => ipcRenderer.invoke('pricing:refresh'),
  onOpenPricing: (cb) => ipcRenderer.on('open-pricing', cb),
  getBudgets: () => ipcRenderer.invoke('budgets:get'),
  setBudgets: (budgets) => ipcRenderer.invoke('budgets:set', budgets),
  maybeFireAlerts: (alerts) => ipcRenderer.invoke('alerts:maybe-fire', alerts),
  maybeFireDailySummary: (payload) => ipcRenderer.invoke('alerts:maybe-fire-summary', payload),
});

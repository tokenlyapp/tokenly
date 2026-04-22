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
});

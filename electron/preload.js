const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('musicAPI', {
  selectFolder: () => ipcRenderer.invoke('app:selectFolder'),
  scanFolder: (dir) => ipcRenderer.invoke('app:scanFolder', dir),
  storeGet: (key) => ipcRenderer.invoke('store:get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value),

  // ---- 下载 ----
  download: (payload) => ipcRenderer.invoke('app:download', payload),
  showInFolder: (p) => ipcRenderer.invoke('app:showInFolder', p),
  openPath: (p) => ipcRenderer.invoke('app:openPath', p),
  trashFile: (p) => ipcRenderer.invoke('app:trashFile', p),
  getDownloadDir: () => ipcRenderer.invoke('app:getDownloadDir'),
  chooseDownloadDir: () => ipcRenderer.invoke('app:chooseDownloadDir'),
  onDownloadProgress: (cb) => {
    const fn = (_e, data) => cb(data);
    ipcRenderer.on('download:progress', fn);
    return () => ipcRenderer.off('download:progress', fn);
  },

  // ---- 托盘 ----
  trayUpdateState: (state) => ipcRenderer.invoke('tray:updateState', state),
  onTrayCommand: (cb) => {
    const fn = (_e, cmd) => cb(cmd);
    ipcRenderer.on('tray:cmd', fn);
    return () => ipcRenderer.off('tray:cmd', fn);
  },

  // ---- 自定义源 ----
  customSourceList: () => ipcRenderer.invoke('customSource:list'),
  customSourceImportFile: () => ipcRenderer.invoke('customSource:importFile'),
  customSourceImportUrl: (url) => ipcRenderer.invoke('customSource:importUrl', url),
  customSourceRemove: (id) => ipcRenderer.invoke('customSource:remove', id),
  customSourceReload: (id) => ipcRenderer.invoke('customSource:reload', id),
  customSourceSetEnabled: (id, enabled) => ipcRenderer.invoke('customSource:setEnabled', id, enabled),
  customSourceResolveMusicUrl: (payload) => ipcRenderer.invoke('customSource:resolveMusicUrl', payload),
  customSourceDispatch: (payload) => ipcRenderer.invoke('customSource:dispatch', payload),

  // ---- 通用 HTTP（绕过浏览器 CORS / 混合内容） ----
  httpRequest: (opts) => ipcRenderer.invoke('app:httpRequest', opts),

  platform: process.platform
});

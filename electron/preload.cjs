// 렌더러에 노출하는 안전한 API (contextIsolation)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hanApi', {
  isElectron: true,
  platform: process.platform,
  openFile: () => ipcRenderer.invoke('file:open'),
  readFile: (path) => ipcRenderer.invoke('file:read', path),
  saveFile: (opts) => ipcRenderer.invoke('file:save', opts),
  pickImage: () => ipcRenderer.invoke('file:pickImage'),
  printToPDF: (opts) => ipcRenderer.invoke('print:pdf', opts),
  print: () => ipcRenderer.invoke('print:print'),
  setTitle: (title) => ipcRenderer.send('window:title', title),
  setDirty: (dirty) => ipcRenderer.send('window:dirty', dirty),
  confirmClose: () => ipcRenderer.send('window:close-confirmed'),
  newWindow: () => ipcRenderer.send('window:new'),
  edit: (action) => ipcRenderer.send('edit', action),
  onMenu: (cb) => {
    const h = (_e, cmd) => cb(cmd);
    ipcRenderer.on('menu', h);
    return () => ipcRenderer.removeListener('menu', h);
  },
  onOpenPath: (cb) => {
    const h = (_e, file) => cb(file);
    ipcRenderer.on('open-path', h);
    return () => ipcRenderer.removeListener('open-path', h);
  },
  onCloseRequest: (cb) => {
    const h = () => cb();
    ipcRenderer.on('close-request', h);
    return () => ipcRenderer.removeListener('close-request', h);
  },
});

// Electron(데스크톱) / 브라우저 공용 플랫폼 계층
const api = typeof window !== 'undefined' ? window.hanApi : null;
export const isElectron = !!api?.isElectron;
export const isMac = isElectron ? api.platform === 'darwin' : /Mac/i.test(navigator.platform);

function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      resolve({ path: null, name: f.name, data: new Uint8Array(await f.arrayBuffer()) });
    };
    input.click();
  });
}

function download(name, data, mime) {
  const blob = new Blob([data], { type: mime || 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return { path: null, name };
}

export const platform = {
  openFile: () => (isElectron ? api.openFile() : pickFile('.hwp,.hwpx,.html,.htm,.txt')),
  pickImage: () => (isElectron ? api.pickImage() : pickFile('image/*')),
  async saveFile({ path, defaultName, filters, data, mime }) {
    if (isElectron) return api.saveFile({ path, defaultName, filters, data });
    return download(defaultName, data, mime);
  },
  printToPDF: (defaultName) => (isElectron ? api.printToPDF({ defaultName }) : Promise.resolve(window.print())),
  print: () => (isElectron ? api.print() : Promise.resolve(window.print())),
  setTitle: (t) => {
    document.title = t;
    if (isElectron) api.setTitle(t);
  },
  setDirty: (d) => isElectron && api.setDirty(d),
  confirmClose: () => isElectron && api.confirmClose(),
  // 오려 두기/복사/붙이기는 Electron 에서 webContents 로 처리 (브라우저는 execCommand)
  edit(action) {
    if (isElectron) api.edit(action);
    else document.execCommand(action === 'pasteAndMatchStyle' ? 'paste' : action);
  },
  onMenu: (cb) => (isElectron ? api.onMenu(cb) : () => {}),
  onOpenPath: (cb) => (isElectron ? api.onOpenPath(cb) : () => {}),
  onCloseRequest: (cb) => (isElectron ? api.onCloseRequest(cb) : () => {}),
};

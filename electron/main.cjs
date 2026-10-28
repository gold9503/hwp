// Electron 메인 프로세스: 창, 메뉴, 파일 입출력, 인쇄
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs/promises');

const isMac = process.platform === 'darwin';
const DOC_EXT = ['hwp', 'hwpx', 'html', 'htm', 'txt'];
const windows = new Set();
let pendingOpen = []; // 앱 준비 전 요청된 파일

function sendMenu(cmd) {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.webContents.send('menu', cmd);
}

async function readDoc(filePath) {
  const data = await fs.readFile(filePath);
  return { path: filePath, name: path.basename(filePath), data: new Uint8Array(data) };
}

function createWindow(filePath) {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'HanEditor',
    backgroundColor: '#e9ecef',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  windows.add(win);
  if (!isMac) win.setMenuBarVisibility(false);
  win.__dirty = false;
  win.__closeConfirmed = false;

  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  win.webContents.once('did-finish-load', async () => {
    if (filePath) {
      try {
        win.webContents.send('open-path', await readDoc(filePath));
      } catch (e) {
        dialog.showErrorBox('파일 열기 실패', String(e.message || e));
      }
    }
  });

  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // 저장하지 않은 변경 사항 확인
  win.on('close', (e) => {
    if (win.__dirty && !win.__closeConfirmed) {
      e.preventDefault();
      win.webContents.send('close-request');
    }
  });
  win.on('closed', () => windows.delete(win));
  return win;
}

function buildMenu() {
  const item = (label, cmd, accelerator) => ({ label, accelerator, registerAccelerator: false, click: () => sendMenu(cmd) });
  const template = [
    ...(isMac ? [{ role: 'appMenu', label: 'HanEditor' }] : []),
    {
      label: '파일(&F)',
      submenu: [
        { label: '새 창', accelerator: 'CmdOrCtrl+Shift+N', click: () => createWindow() },
        item('새 문서', 'new', 'CmdOrCtrl+N'),
        item('불러오기...', 'open', 'CmdOrCtrl+O'),
        { type: 'separator' },
        item('저장하기', 'save', 'CmdOrCtrl+S'),
        item('다른 이름으로 저장하기...', 'saveAs', 'CmdOrCtrl+Shift+S'),
        { type: 'separator' },
        item('PDF로 내보내기...', 'exportPdf'),
        item('HTML로 내보내기...', 'exportHtml'),
        item('텍스트로 내보내기...', 'exportTxt'),
        { type: 'separator' },
        item('편집 용지...', 'pageSetup', 'F7'),
        item('인쇄...', 'print', 'CmdOrCtrl+P'),
        { type: 'separator' },
        isMac ? { role: 'close', label: '닫기' } : { role: 'quit', label: '끝' },
      ],
    },
    {
      label: '편집(&E)',
      submenu: [
        item('되돌리기', 'undo', 'CmdOrCtrl+Z'),
        item('다시 실행', 'redo', 'CmdOrCtrl+Shift+Z'),
        { type: 'separator' },
        { role: 'cut', label: '오려 두기' },
        { role: 'copy', label: '복사하기' },
        { role: 'paste', label: '붙이기' },
        { role: 'pasteAndMatchStyle', label: '골라 붙이기 (서식 없이)' },
        { role: 'selectAll', label: '모두 선택' },
        { type: 'separator' },
        item('찾기...', 'find', 'CmdOrCtrl+F'),
        item('찾아 바꾸기...', 'replace', 'CmdOrCtrl+H'),
      ],
    },
    {
      label: '보기(&V)',
      submenu: [
        item('확대', 'zoomIn', 'CmdOrCtrl+='),
        item('축소', 'zoomOut', 'CmdOrCtrl+-'),
        item('100%', 'zoomReset', 'CmdOrCtrl+0'),
        { type: 'separator' },
        item('문단 부호 보이기/숨기기', 'toggleMarks'),
        item('눈금자 보이기/숨기기', 'toggleRuler'),
        { type: 'separator' },
        { role: 'togglefullscreen', label: '전체 화면' },
        { role: 'toggleDevTools', label: '개발자 도구' },
      ],
    },
    {
      label: '입력(&I)',
      submenu: [
        item('표 만들기...', 'insertTable', 'CmdOrCtrl+Alt+T'),
        item('그림 넣기...', 'insertImage', 'CmdOrCtrl+Alt+I'),
        item('문자표...', 'insertSymbol', 'CmdOrCtrl+F10'),
        item('날짜/시간 넣기', 'insertDate'),
        item('하이퍼링크...', 'insertLink', 'CmdOrCtrl+K'),
        item('가로줄 넣기', 'insertHr'),
        { type: 'separator' },
        item('쪽 나누기', 'pageBreak', 'CmdOrCtrl+Enter'),
      ],
    },
    {
      label: '서식(&J)',
      submenu: [
        item('글자 모양...', 'charShape', 'Alt+L'),
        item('문단 모양...', 'paraShape', 'Alt+T'),
        { type: 'separator' },
        item('진하게', 'bold', 'CmdOrCtrl+B'),
        item('기울임', 'italic', 'CmdOrCtrl+I'),
        item('밑줄', 'underline', 'CmdOrCtrl+U'),
        item('취소선', 'strike'),
        item('위 첨자', 'superscript'),
        item('아래 첨자', 'subscript'),
        { type: 'separator' },
        item('양쪽 정렬', 'alignJustify', 'CmdOrCtrl+Shift+M'),
        item('왼쪽 정렬', 'alignLeft', 'CmdOrCtrl+Shift+L'),
        item('가운데 정렬', 'alignCenter', 'CmdOrCtrl+Shift+C'),
        item('오른쪽 정렬', 'alignRight', 'CmdOrCtrl+Shift+R'),
        { type: 'separator' },
        item('글머리표', 'bulletList'),
        item('문단 번호', 'numberList'),
        item('서식 지우기', 'clearFormat'),
      ],
    },
    {
      label: '쪽(&W)',
      submenu: [item('편집 용지...', 'pageSetup'), item('쪽 번호 매기기', 'togglePageNumber'), item('쪽 나누기', 'pageBreak')],
    },
    {
      label: '표(&B)',
      submenu: [
        item('표 만들기...', 'insertTable'),
        { type: 'separator' },
        item('위에 줄 추가하기', 'rowAbove'),
        item('아래에 줄 추가하기', 'rowBelow'),
        item('왼쪽에 칸 추가하기', 'colLeft'),
        item('오른쪽에 칸 추가하기', 'colRight'),
        { type: 'separator' },
        item('줄 지우기', 'deleteRow'),
        item('칸 지우기', 'deleteCol'),
        item('오른쪽 셀과 합치기', 'mergeRight'),
        item('아래 셀과 합치기', 'mergeDown'),
        item('셀 나누기', 'splitCell'),
        { type: 'separator' },
        item('셀 배경색...', 'cellColor'),
        item('표 지우기', 'deleteTable'),
      ],
    },
    {
      label: '도구(&K)',
      submenu: [item('글자 수 세기', 'wordCount'), item('문서 정보', 'docInfo')],
    },
    {
      label: '도움말(&H)',
      submenu: [item('단축키 안내', 'shortcuts', 'F1'), item('HanEditor 정보', 'about')],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------- IPC ----------------
const winOf = (e) => BrowserWindow.fromWebContents(e.sender);

ipcMain.handle('file:open', async (e) => {
  const r = await dialog.showOpenDialog(winOf(e), {
    title: '불러오기',
    properties: ['openFile'],
    filters: [
      { name: '한글 문서', extensions: ['hwp', 'hwpx'] },
      { name: '모든 지원 문서', extensions: DOC_EXT },
      { name: '모든 파일', extensions: ['*'] },
    ],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return readDoc(r.filePaths[0]);
});

ipcMain.handle('file:read', (_e, p) => readDoc(p));

ipcMain.handle('file:pickImage', async (e) => {
  const r = await dialog.showOpenDialog(winOf(e), {
    title: '그림 넣기',
    properties: ['openFile'],
    filters: [{ name: '그림', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return readDoc(r.filePaths[0]);
});

ipcMain.handle('file:save', async (e, { path: filePath, defaultName, filters, data }) => {
  let target = filePath;
  if (!target) {
    const r = await dialog.showSaveDialog(winOf(e), { title: '저장하기', defaultPath: defaultName, filters });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath;
  }
  await fs.writeFile(target, typeof data === 'string' ? data : Buffer.from(data));
  app.addRecentDocument(target);
  return { path: target, name: path.basename(target) };
});

ipcMain.handle('print:pdf', async (e, { defaultName }) => {
  const win = winOf(e);
  const r = await dialog.showSaveDialog(win, { title: 'PDF로 내보내기', defaultPath: defaultName, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return null;
  const pdf = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
  await fs.writeFile(r.filePath, pdf);
  shell.openPath(r.filePath);
  return { path: r.filePath };
});

ipcMain.handle('print:print', (e) => new Promise((resolve) => {
  winOf(e).webContents.print({ printBackground: true }, (ok, reason) => resolve({ ok, reason }));
}));

ipcMain.on('window:title', (e, title) => winOf(e)?.setTitle(title));
ipcMain.on('window:dirty', (e, dirty) => {
  const w = winOf(e);
  if (!w) return;
  w.__dirty = dirty;
  if (isMac) w.setDocumentEdited(dirty);
});
ipcMain.on('window:close-confirmed', (e) => {
  const w = winOf(e);
  if (!w) return;
  w.__closeConfirmed = true;
  w.close();
});
ipcMain.on('window:new', () => createWindow());
// 편집 메뉴(오려 두기/복사/붙이기)를 창 내부 메뉴에서도 쓸 수 있도록
ipcMain.on('edit', (e, action) => {
  const wc = e.sender;
  if (['cut', 'copy', 'paste', 'pasteAndMatchStyle', 'selectAll'].includes(action)) wc[action]();
});

// ---------------- 앱 수명주기 ----------------
const fileArg = (argv) => argv.slice(1).find((a) => DOC_EXT.some((x) => a.toLowerCase().endsWith('.' + x)));

// macOS: Finder 에서 파일 열기
app.on('open-file', (e, filePath) => {
  e.preventDefault();
  if (app.isReady()) createWindow(filePath);
  else pendingOpen.push(filePath);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const f = fileArg(argv);
    if (f) createWindow(f);
    else {
      const w = [...windows][0];
      if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
    }
  });

  app.whenReady().then(() => {
    // 설치된 글꼴 목록 조회(Local Font Access)와 클립보드 읽기 허용
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(['local-fonts', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission)));
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => ['local-fonts', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission));
    buildMenu();
    const f = fileArg(process.argv);
    if (pendingOpen.length) pendingOpen.forEach((p) => createWindow(p));
    else createWindow(f);
    pendingOpen = [];
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
}

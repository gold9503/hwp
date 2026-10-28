import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import MenuBar from './components/MenuBar.jsx';
import Toolbar from './components/Toolbar.jsx';
import {
  TableDialog, CharShapeDialog, ParaShapeDialog, PageSetupDialog, SymbolDialog, PromptDialog, MessageDialog, FindPanel,
} from './components/Dialogs.jsx';
import { parseDocument } from './hwp/index.js';
import { documentToHtml } from './hwp/render.js';
import { documentToHwpx, documentToText } from './hwp/hwpx-writer.js';
import { escapeHtml, uint8ToBase64, mimeFromExt } from './hwp/util.js';
import { History } from './editor/history.js';
import {
  exec, getRange, setFontSize, setFontName, setColor, setParaStyle, getParaStyle, currentFormat,
  insertBlock, createTable, placeCaret, tableOps, findNext, replaceRange, replaceAll, countStats,
} from './editor/commands.js';
import { editorToDocument } from './editor/domToModel.js';
import { platform, isElectron, isMac } from './platform.js';

const MM = 96 / 25.4;
// 한글 기본 편집 용지: A4, 위 20mm + 머리말 15mm, 아래 15mm + 꼬리말 15mm, 좌우 30mm
const DEFAULT_PAGE = {
  width: 210 * MM, height: 297 * MM,
  marginTop: 35 * MM, marginBottom: 30 * MM, marginLeft: 30 * MM, marginRight: 30 * MM,
};
const BASE_FONTS = [
  '함초롬바탕', '함초롬돋움', '맑은 고딕', '바탕', '바탕체', '돋움', '돋움체', '굴림', '굴림체', '궁서',
  '나눔고딕', '나눔명조', '나눔바른고딕', 'Noto Sans KR', 'Noto Serif KR', 'Apple SD Gothic Neo', 'AppleMyungjo',
  'Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana',
];
const EMPTY_HTML = '<p><br></p>';

function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, link, meta, iframe, object, embed').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const a of Array.from(el.attributes)) {
      if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
    }
  });
  const root = doc.querySelector('.editor') || doc.body;
  return root.innerHTML || EMPTY_HTML;
}

const extOf = (name) => (name || '').split('.').pop().toLowerCase();
const baseName = (name) => (name || '새 문서').replace(/\.[^.]+$/, '');

export default function App() {
  const editorRef = useRef(null);
  const historyRef = useRef(null);
  const rangeRef = useRef(null);
  const layoutTimer = useRef(null);
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [file, setFile] = useState({ name: '새 문서 1', path: null, format: 'new' });
  const [dirty, setDirtyState] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showMarks, setShowMarks] = useState(false);
  const [showRuler, setShowRuler] = useState(true);
  const [pageNumbers, setPageNumbers] = useState(false);
  const [fmt, setFmt] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [findMode, setFindMode] = useState(null);
  const [stats, setStats] = useState({ pages: 1, page: 1, chars: 0 });
  const [toast, setToast] = useState(null);
  const [fonts, setFonts] = useState(BASE_FONTS);
  const [busy, setBusy] = useState(null);

  const pageRef = useRef(page);
  pageRef.current = page;
  const fileRef = useRef(file);
  fileRef.current = file;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const setDirty = useCallback((d) => {
    setDirtyState(d);
    platform.setDirty(d);
  }, []);

  const notify = useCallback((msg, ms = 3500) => {
    setToast(msg);
    clearTimeout(notify.t);
    notify.t = setTimeout(() => setToast(null), ms);
  }, []);

  // ---------- 쪽 배치 (쪽 경계 표시, 쪽 나누기 간격) ----------
  const updateLayout = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const p = pageRef.current;
    const contentH = Math.max(50, p.height - p.marginTop - p.marginBottom);
    ed.style.minHeight = '';
    for (const hr of ed.querySelectorAll('hr.page-break')) {
      hr.style.marginBottom = '0px';
    }
    for (const hr of ed.querySelectorAll(':scope > hr.page-break')) {
      const end = hr.offsetTop + hr.offsetHeight;
      const next = Math.ceil(end / contentH) * contentH;
      hr.style.marginBottom = `${Math.max(0, next - end)}px`;
    }
    const pages = Math.max(1, Math.ceil((ed.scrollHeight - 1) / contentH));
    ed.style.minHeight = `${pages * contentH}px`;
    ed.dataset.pages = pages;
    // 현재 커서가 있는 쪽
    let cur = 1;
    const r = getRange(ed);
    if (r) {
      const rects = r.getClientRects();
      const rect = rects[0] || r.startContainer.parentElement?.getBoundingClientRect?.();
      if (rect) {
        const top = (rect.top - ed.getBoundingClientRect().top) / zoomRef.current;
        cur = Math.min(pages, Math.max(1, Math.floor(top / contentH) + 1));
      }
    }
    const text = ed.innerText || '';
    setStats({ pages, page: cur, chars: text.replace(/\s/g, '').length });
  }, []);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const scheduleLayout = useCallback(() => {
    clearTimeout(layoutTimer.current);
    layoutTimer.current = setTimeout(updateLayout, 120);
  }, [updateLayout]);

  // ---------- 문서 불러오기 ----------
  const loadHtml = useCallback((html, newPage, info) => {
    const ed = editorRef.current;
    ed.innerHTML = html || EMPTY_HTML;
    setPage(newPage || DEFAULT_PAGE);
    pageRef.current = newPage || DEFAULT_PAGE;
    setFile(info);
    historyRef.current.reset();
    setDirty(false);
    ed.focus();
    const r = document.createRange();
    r.setStart(ed, 0);
    r.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    document.querySelector('.workspace')?.scrollTo(0, 0);
    requestAnimationFrame(updateLayout);
    // 이미지 로드 후 다시 배치
    ed.querySelectorAll('img').forEach((img) => img.complete || img.addEventListener('load', scheduleLayout, { once: true }));
  }, [setDirty, updateLayout, scheduleLayout]);

  const openData = useCallback(async ({ name, path, data }) => {
    const ext = extOf(name);
    setBusy('문서를 여는 중...');
    await new Promise((r) => setTimeout(r, 30));
    try {
      if (ext === 'html' || ext === 'htm') {
        loadHtml(sanitizeHtml(new TextDecoder().decode(data)), null, { name, path, format: 'html' });
      } else if (ext === 'txt') {
        let text = new TextDecoder('utf-8').decode(data);
        if (text.includes('�')) text = new TextDecoder('euc-kr').decode(data);
        const html = text.split(/\r?\n/).map((l) => `<p>${l ? escapeHtml(l) : '<br>'}</p>`).join('');
        loadHtml(html, null, { name, path, format: 'txt' });
      } else {
        const doc = await parseDocument(data, name);
        loadHtml(documentToHtml(doc), doc.page || null, { name, path, format: doc.format, version: doc.version, title: doc.title });
        if (doc.warnings?.length) notify(doc.warnings.join(' '), 6000);
      }
    } catch (e) {
      console.error(e);
      setDialog({ type: 'message', title: '문서를 열 수 없습니다', body: `${name}\n\n${e.message || e}` });
    } finally {
      setBusy(null);
    }
  }, [loadHtml, notify]);

  // 저장하지 않은 변경 확인: true → 계속 진행
  const confirmDiscard = useCallback(() => new Promise((resolve) => {
    if (!dirtyRef.current) return resolve(true);
    setDialog({ type: 'confirmSave', resolve });
  }), []);

  // ---------- 저장 ----------
  const currentDoc = useCallback(() => editorToDocument(editorRef.current, pageRef.current, baseName(fileRef.current.name)), []);

  const saveHwpx = useCallback(async (saveAs) => {
    historyRef.current.flush();
    const f = fileRef.current;
    const canOverwrite = !saveAs && f.path && extOf(f.path) === 'hwpx';
    setBusy('저장하는 중...');
    try {
      const data = await documentToHwpx(currentDoc());
      const res = await platform.saveFile({
        path: canOverwrite ? f.path : null,
        defaultName: `${baseName(f.name)}.hwpx`,
        filters: [{ name: '한글 문서 (HWPX)', extensions: ['hwpx'] }],
        data,
        mime: 'application/hwp+zip',
      });
      if (!res) return false;
      setFile({ ...f, name: res.name, path: res.path, format: 'hwpx' });
      setDirty(false);
      if (f.format === 'hwp' && !canOverwrite) notify('HWP 원본은 그대로 두고 HWPX 형식으로 저장했습니다.');
      else notify('저장했습니다.');
      return true;
    } catch (e) {
      setDialog({ type: 'message', title: '저장 실패', body: String(e.message || e) });
      return false;
    } finally {
      setBusy(null);
    }
  }, [currentDoc, notify, setDirty]);

  const exportHtml = useCallback(async () => {
    const p = pageRef.current;
    const css = document.getElementById('editor-content-css')?.textContent || '';
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(baseName(fileRef.current.name))}</title>` +
      `<style>${css}\nbody{background:#fff;margin:0}.editor{width:${p.width - p.marginLeft - p.marginRight}px;margin:${p.marginTop}px auto ${p.marginBottom}px}</style></head>` +
      `<body><div class="editor">${editorRef.current.innerHTML}</div></body></html>`;
    const res = await platform.saveFile({ defaultName: `${baseName(fileRef.current.name)}.html`, filters: [{ name: 'HTML', extensions: ['html'] }], data: html, mime: 'text/html' });
    if (res) notify('HTML로 내보냈습니다.');
  }, [notify]);

  const exportTxt = useCallback(async () => {
    const text = documentToText(currentDoc());
    const res = await platform.saveFile({ defaultName: `${baseName(fileRef.current.name)}.txt`, filters: [{ name: '텍스트', extensions: ['txt'] }], data: text, mime: 'text/plain' });
    if (res) notify('텍스트로 내보냈습니다.');
  }, [currentDoc, notify]);

  // ---------- 편집 명령 ----------
  const focusEditor = useCallback(() => {
    const ed = editorRef.current;
    const sel = window.getSelection();
    const inside = sel.rangeCount && ed.contains(sel.getRangeAt(0).commonAncestorContainer);
    const focused = document.activeElement === ed || ed.contains(document.activeElement);
    if (!focused) ed.focus({ preventScroll: true });
    // 포커스를 다시 얻으면 커서가 문서 처음으로 가므로 마지막 선택 영역을 복원
    if (rangeRef.current && (!focused || !inside)) {
      sel.removeAllRanges();
      sel.addRange(rangeRef.current);
    }
  }, []);

  // 현재 편집기 선택 영역 저장 (selectionchange 는 비동기라 포커스 이동 직전에 직접 저장)
  const captureRange = useCallback(() => {
    const ed = editorRef.current;
    const sel = window.getSelection();
    if (ed && sel.rangeCount && ed.contains(sel.getRangeAt(0).commonAncestorContainer)) rangeRef.current = sel.getRangeAt(0).cloneRange();
  }, []);

  // 편집 후 기록/배치
  const changed = useCallback(() => {
    historyRef.current.record();
    setDirty(true);
    scheduleLayout();
    const ed = editorRef.current;
    setFmt(currentFormat(ed));
  }, [setDirty, scheduleLayout]);

  const edit = useCallback((fn) => {
    focusEditor();
    historyRef.current.flush();
    const result = fn(editorRef.current);
    changed();
    return result;
  }, [focusEditor, changed]);

  const insertHtml = useCallback((html) => edit(() => exec('insertHTML', html)), [edit]);

  const insertImageFile = useCallback(async (f) => {
    if (!f) return;
    const mime = mimeFromExt(extOf(f.name)) || 'image/png';
    const src = `data:${mime};base64,${uint8ToBase64(f.data)}`;
    const img = new Image();
    img.src = src;
    await img.decode().catch(() => {});
    const p = pageRef.current;
    const maxW = p.width - p.marginLeft - p.marginRight;
    let w = img.naturalWidth || 300, h = img.naturalHeight || 200;
    if (w > maxW) { h = (h * maxW) / w; w = maxW; }
    insertHtml(`<img src="${src}" style="width: ${Math.round(w)}px; height: ${Math.round(h)}px">`);
  }, [insertHtml]);

  const run = useCallback(async (cmd) => {
    const ed = editorRef.current;
    captureRange();
    const tableCmd = (name, ...args) => edit((root) => tableOps[name](root, ...args) || notify('표 안에 커서를 두고 실행하세요.'));
    switch (cmd) {
      case 'new':
        if (!(await confirmDiscard())) return;
        loadHtml(EMPTY_HTML, DEFAULT_PAGE, { name: '새 문서 1', path: null, format: 'new' });
        break;
      case 'open': {
        if (!(await confirmDiscard())) return;
        const f = await platform.openFile();
        if (f) await openData(f);
        break;
      }
      case 'save': await saveHwpx(false); break;
      case 'saveAs': await saveHwpx(true); break;
      case 'exportHtml': await exportHtml(); break;
      case 'exportTxt': await exportTxt(); break;
      case 'exportPdf': {
        setBusy('PDF를 만드는 중...');
        try { await platform.printToPDF(`${baseName(fileRef.current.name)}.pdf`); } finally { setBusy(null); }
        break;
      }
      case 'print': await platform.print(); break;
      case 'pageSetup': setDialog({ type: 'page' }); break;
      case 'undo':
        historyRef.current.undo() && (setDirty(true), scheduleLayout());
        break;
      case 'redo':
        historyRef.current.redo() && (setDirty(true), scheduleLayout());
        break;
      case 'cut': case 'copy': case 'paste': case 'selectAll':
        focusEditor();
        platform.edit(cmd);
        break;
      case 'find': setFindMode('find'); break;
      case 'replace': setFindMode('replace'); break;
      case 'zoomIn': setZoom((z) => Math.min(4, Math.round((z + 0.1) * 10) / 10)); break;
      case 'zoomOut': setZoom((z) => Math.max(0.3, Math.round((z - 0.1) * 10) / 10)); break;
      case 'zoomReset': setZoom(1); break;
      case 'toggleMarks': setShowMarks((v) => !v); break;
      case 'toggleRuler': setShowRuler((v) => !v); break;
      case 'togglePageNumber':
        setPageNumbers((v) => { notify(v ? '쪽 번호를 지웠습니다.' : '인쇄/PDF 아래쪽 가운데에 쪽 번호를 넣습니다.'); return !v; });
        break;
      case 'insertTable': setDialog({ type: 'table' }); break;
      case 'insertImage': { const f = await platform.pickImage(); if (f) await insertImageFile(f); break; }
      case 'insertSymbol': setDialog({ type: 'symbol' }); break;
      case 'insertDate': {
        const d = new Date();
        insertHtml(escapeHtml(`${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일`));
        break;
      }
      case 'insertLink': setDialog({ type: 'link' }); break;
      case 'insertHr': insertHtml('<hr><p><br></p>'); break;
      case 'pageBreak': insertHtml('<hr class="page-break"><p><br></p>'); break;
      case 'charShape': focusEditor(); setDialog({ type: 'char', initial: currentFormat(ed) }); break;
      case 'paraShape': focusEditor(); setDialog({ type: 'para', initial: getParaStyle(ed) }); break;
      case 'bold': edit(() => exec('bold')); break;
      case 'italic': edit(() => exec('italic')); break;
      case 'underline': edit(() => exec('underline')); break;
      case 'strike': edit(() => exec('strikeThrough')); break;
      case 'superscript': edit(() => exec('superscript')); break;
      case 'subscript': edit(() => exec('subscript')); break;
      case 'alignJustify': edit(() => exec('justifyFull')); break;
      case 'alignLeft': edit(() => exec('justifyLeft')); break;
      case 'alignCenter': edit(() => exec('justifyCenter')); break;
      case 'alignRight': edit(() => exec('justifyRight')); break;
      case 'bulletList': edit(() => exec('insertUnorderedList')); break;
      case 'numberList': edit(() => exec('insertOrderedList')); break;
      case 'indent':
        edit((root) => setParaStyleRel(root, 10 * MM));
        break;
      case 'outdent':
        edit((root) => setParaStyleRel(root, -10 * MM));
        break;
      case 'clearFormat': edit(() => exec('removeFormat')); break;
      case 'rowAbove': case 'rowBelow': case 'colLeft': case 'colRight': case 'deleteRow': case 'deleteCol':
      case 'mergeRight': case 'mergeDown': case 'splitCell': case 'deleteTable':
        tableCmd(cmd);
        break;
      case 'cellColor': setDialog({ type: 'cellColor' }); break;
      case 'wordCount': case 'docInfo': {
        const s = countStats(ed);
        setDialog({
          type: 'message',
          title: cmd === 'wordCount' ? '글자 수 세기' : '문서 정보',
          body: [
            `파일: ${fileRef.current.name}`,
            fileRef.current.path ? `위치: ${fileRef.current.path}` : null,
            `형식: ${fileRef.current.format.toUpperCase()}${fileRef.current.version ? ` (버전 ${fileRef.current.version})` : ''}`,
            `쪽 수: ${stats.pages}`,
            `글자(공백 포함): ${s.chars.toLocaleString()}`,
            `글자(공백 제외): ${s.charsNoSpace.toLocaleString()}`,
            `낱말: ${s.words.toLocaleString()}`,
            `문단: ${s.paras.toLocaleString()}`,
          ].filter(Boolean).join('\n'),
        });
        break;
      }
      case 'shortcuts':
        setDialog({ type: 'message', title: '단축키 안내', body: SHORTCUT_HELP });
        break;
      case 'about':
        setDialog({ type: 'message', title: 'HanEditor 정보', body: ABOUT });
        break;
      default:
        break;
    }
  }, [captureRange, edit, notify, confirmDiscard, loadHtml, openData, saveHwpx, exportHtml, exportTxt, focusEditor, insertHtml, insertImageFile, setDirty, scheduleLayout, stats.pages]);

  const runRef = useRef(run);
  runRef.current = run;

  // ---------- 초기화 ----------
  useLayoutEffect(() => {
    const ed = editorRef.current;
    ed.innerHTML = EMPTY_HTML;
    historyRef.current = new History(ed);
    historyRef.current.reset();
    updateLayout();
  }, [updateLayout]);

  useEffect(() => {
    const offMenu = platform.onMenu((cmd) => runRef.current(cmd));
    const offOpen = platform.onOpenPath(async (f) => {
      if (await confirmDiscard()) openData(f);
    });
    const offClose = platform.onCloseRequest(async () => {
      if (await confirmDiscard()) platform.confirmClose();
    });
    const beforeUnload = (e) => {
      if (!isElectron && dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      offMenu();
      offOpen();
      offClose();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [confirmDiscard, openData]);

  // 창 제목
  useEffect(() => {
    platform.setTitle(`${dirty ? '* ' : ''}${file.name} - HanEditor`);
  }, [file.name, dirty]);

  // 쪽 설정/확대 변경 시 재배치
  useEffect(() => {
    updateLayout();
  }, [page, zoom, updateLayout]);

  // 선택 영역 추적 (툴바 상태, 서식 적용 대상)
  useEffect(() => {
    let raf = 0;
    const onSel = () => {
      const ed = editorRef.current;
      const sel = window.getSelection();
      if (!sel.rangeCount || !ed.contains(sel.getRangeAt(0).commonAncestorContainer)) return;
      rangeRef.current = sel.getRangeAt(0).cloneRange();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setFmt(currentFormat(ed));
        scheduleLayout();
      });
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [scheduleLayout]);

  // 단축키
  useEffect(() => {
    const onKey = (e) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const k = e.key.toLowerCase();
      let cmd = null;
      if (mod && !e.altKey) {
        if (e.shiftKey) {
          cmd = { s: 'saveAs', z: 'redo', l: 'alignLeft', c: 'alignCenter', r: 'alignRight', m: 'alignJustify' }[k];
        } else {
          cmd = {
            n: 'new', o: 'open', s: 'save', p: 'print', z: 'undo', y: 'redo', f: 'find', h: 'replace',
            b: 'bold', i: 'italic', u: 'underline', k: 'insertLink', '=': 'zoomIn', '+': 'zoomIn', '-': 'zoomOut', '0': 'zoomReset',
            enter: 'pageBreak', f10: 'insertSymbol',
          }[k];
        }
      } else if (mod && e.altKey) {
        cmd = { t: 'insertTable', i: 'insertImage' }[e.code === 'KeyT' ? 't' : e.code === 'KeyI' ? 'i' : k];
      } else if (e.altKey && !mod && !e.shiftKey) {
        cmd = { KeyL: 'charShape', KeyT: 'paraShape' }[e.code];
      } else if (!mod && !e.altKey) {
        cmd = { F7: 'pageSetup', F1: 'shortcuts' }[e.key];
      }
      if (cmd) {
        // 대화상자 입력 중에는 편집 단축키를 가로채지 않음
        const inField = e.target.closest?.('input, textarea, select');
        if (inField && ['undo', 'redo', 'bold', 'italic', 'underline'].includes(cmd)) return;
        e.preventDefault();
        runRef.current(cmd);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 사용 가능한 글꼴 목록 (Local Font Access API)
  const loadLocalFonts = useCallback(async () => {
    if (loadLocalFonts.done || !window.queryLocalFonts) return;
    loadLocalFonts.done = true;
    try {
      const list = await window.queryLocalFonts();
      const fams = [...new Set(list.map((f) => f.family))];
      const korean = fams.filter((f) => /[가-힣]/.test(f));
      setFonts([...new Set([...BASE_FONTS, ...korean.sort(), ...fams.filter((f) => !korean.includes(f)).sort()])]);
    } catch {
      /* 권한이 없으면 기본 목록 사용 */
    }
  }, []);

  // ---------- 편집기 이벤트 ----------
  const onInput = () => {
    captureRange();
    historyRef.current.recordLater();
    if (!dirtyRef.current) setDirty(true);
    scheduleLayout();
  };

  const onEditorKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ed = editorRef.current;
      const r = getRange(ed);
      const cell = r && (r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer).closest('td, th');
      if (cell) {
        // 표 안에서는 다음/이전 셀로 이동
        const cells = Array.from(cell.closest('table').querySelectorAll('td, th'));
        const next = cells[cells.indexOf(cell) + (e.shiftKey ? -1 : 1)];
        if (next) {
          const nr = document.createRange();
          nr.selectNodeContents(next);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(nr);
        }
        return;
      }
      historyRef.current.flush();
      exec('insertText', '\t');
    }
  };

  const onPaste = (e) => {
    const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      files.forEach(async (f) => insertImageFile({ name: f.name || `image.${f.type.split('/')[1]}`, data: new Uint8Array(await f.arrayBuffer()) }));
      return;
    }
    historyRef.current.flush();
  };

  const onDrop = async (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    e.preventDefault();
    const data = new Uint8Array(await f.arrayBuffer());
    const ext = extOf(f.name);
    if (['hwp', 'hwpx', 'html', 'htm', 'txt'].includes(ext)) {
      if (await confirmDiscard()) openData({ name: f.name, path: f.path || null, data });
    } else if (f.type.startsWith('image/')) {
      insertImageFile({ name: f.name, data });
    }
  };

  // ---------- 찾기 (찾은 곳은 CSS Highlight 로 표시해 찾기 창에 입력 포커스를 유지) ----------
  const foundRef = useRef(null);
  const clearFound = () => {
    foundRef.current = null;
    if (window.CSS?.highlights) CSS.highlights.delete('find');
  };
  const doFind = (q, o) => {
    const ed = editorRef.current;
    const r = findNext(ed, q, o, foundRef.current || rangeRef.current);
    if (!r) {
      clearFound();
      return false;
    }
    foundRef.current = r;
    rangeRef.current = r.cloneRange();
    if (window.CSS?.highlights && window.Highlight) CSS.highlights.set('find', new Highlight(r));
    const rect = r.getBoundingClientRect();
    const ws = document.querySelector('.workspace');
    const wr = ws.getBoundingClientRect();
    if (rect.top < wr.top + 40 || rect.bottom > wr.bottom - 40) ws.scrollBy({ top: rect.top - wr.top - wr.height / 2, behavior: 'smooth' });
    return true;
  };

  // ---------- 대화상자 ----------
  const closeDialog = () => {
    setDialog(null);
    setTimeout(focusEditor, 0);
  };

  const renderDialog = () => {
    if (!dialog) return null;
    switch (dialog.type) {
      case 'table':
        return (
          <TableDialog
            onClose={closeDialog}
            onOk={(rows, cols) => {
              setDialog(null);
              const p = pageRef.current;
              edit((root) => {
                const t = insertBlock(root, createTable(rows, cols, Math.floor(p.width - p.marginLeft - p.marginRight - 2)));
                placeCaret(t.querySelector('td p'));
              });
            }}
          />
        );
      case 'char':
        return (
          <CharShapeDialog
            initial={dialog.initial}
            fonts={fonts}
            onClose={closeDialog}
            onOk={(v) => {
              setDialog(null);
              edit((root) => {
                const r = getRange(root);
                if (!r || r.collapsed) return;
                setFontName(root, v.fontFamily);
                setFontSize(root, Number(v.fontSize));
                const st = currentFormat(root);
                if (!!st.bold !== v.bold) exec('bold');
                if (!!st.italic !== v.italic) exec('italic');
                if (!!st.underline !== v.underline) exec('underline');
                if (!!st.strike !== v.strike) exec('strikeThrough');
                if (v.color !== v.initialColor) setColor(v.color);
                if (Number(v.letterSpacing)) {
                  exec('styleWithCSS', true);
                  const html = `<span style="letter-spacing: ${Number(v.letterSpacing) / 100}em">${escapeHtml(getRange(root).toString())}</span>`;
                  if (!getRange(root).toString().includes('\n')) exec('insertHTML', html);
                  exec('styleWithCSS', false);
                }
              });
            }}
          />
        );
      case 'para':
        return (
          <ParaShapeDialog
            initial={dialog.initial}
            onClose={closeDialog}
            onOk={(v) => {
              setDialog(null);
              edit((root) => {
                const ind = Number(v.indent) * MM;
                const ml = Number(v.marginLeft) * MM;
                setParaStyle(root, {
                  textAlign: v.align,
                  marginLeft: `${ml + (ind < 0 ? -ind : 0)}px`,
                  marginRight: `${Number(v.marginRight) * MM}px`,
                  textIndent: `${ind}px`,
                  marginTop: `${Number(v.spaceBefore) * MM}px`,
                  marginBottom: `${Number(v.spaceAfter) * MM}px`,
                  lineHeight: String(Number(v.lineHeight) / 100),
                });
              });
            }}
          />
        );
      case 'page':
        return (
          <PageSetupDialog
            page={page}
            onClose={closeDialog}
            onOk={(p) => {
              setDialog(null);
              setPage(p);
              setDirty(true);
            }}
          />
        );
      case 'symbol':
        return <SymbolDialog onClose={closeDialog} onInsert={(ch) => edit(() => exec('insertText', ch))} />;
      case 'link':
        return (
          <PromptDialog
            title="하이퍼링크"
            label="주소"
            initial="https://"
            onClose={closeDialog}
            onOk={(url) => {
              setDialog(null);
              if (!/^(https?:|mailto:)/i.test(url)) return;
              edit((root) => {
                const r = getRange(root);
                if (r && !r.collapsed) exec('createLink', url);
                else exec('insertHTML', `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);
              });
            }}
          />
        );
      case 'cellColor':
        return (
          <PromptDialog
            title="셀 배경색"
            label="색"
            type="color"
            initial="#dce6f2"
            onClose={closeDialog}
            onOk={(c) => {
              setDialog(null);
              edit((root) => tableOps.cellColor(root, c) || notify('표 안에 커서를 두고 실행하세요.'));
            }}
          />
        );
      case 'confirmSave': {
        const answer = async (choice) => {
          setDialog(null);
          if (choice === 'save') dialog.resolve(await saveHwpx(false));
          else dialog.resolve(choice === 'discard');
        };
        return (
          <MessageDialog
            title="HanEditor"
            onClose={() => answer('cancel')}
            buttons={<>
              <button className="primary" onClick={() => answer('save')}>저장</button>
              <button onClick={() => answer('discard')}>저장 안 함</button>
              <button onClick={() => answer('cancel')}>취소</button>
            </>}
          >
            <p className="msg">'{file.name}' 문서가 변경되었습니다. 저장하시겠습니까?</p>
          </MessageDialog>
        );
      }
      case 'message':
      default:
        return (
          <MessageDialog title={dialog.title} onClose={closeDialog}>
            <pre className="msg">{dialog.body}</pre>
          </MessageDialog>
        );
    }
  };

  function setParaStyleRel(root, deltaPx) {
    const p = getParaStyle(root);
    setParaStyle(root, { marginLeft: `${Math.max(0, (p.marginLeft || 0) + deltaPx)}px` });
  }

  // ---------- 화면 ----------
  const pagesCount = stats.pages;
  const contentH = page.height - page.marginTop - page.marginBottom;
  const pageCss = `@page { size: ${page.width}px ${page.height}px; margin: ${page.marginTop}px ${page.marginRight}px ${page.marginBottom}px ${page.marginLeft}px;` +
    `${pageNumbers ? ' @bottom-center { content: "- " counter(page) " -"; font-size: 9pt; }' : ''} }`;

  return (
    <div className={`app ${isMac ? 'mac' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <style>{pageCss}</style>
      {!(isElectron && isMac) && <MenuBar onCommand={run} extra={<span className="brand">HanEditor</span>} />}
      <div onFocus={loadLocalFonts}>
        <Toolbar
          fmt={fmt}
          fonts={fonts}
          zoom={zoom}
          onZoom={setZoom}
          onCommand={run}
          onFont={(name) => edit((root) => setFontName(root, name))}
          onFontSize={(pt) => edit((root) => setFontSize(root, pt))}
          onColor={(c) => edit(() => setColor(c))}
          onHighlight={(c) => edit(() => setColor(c, true))}
          onLineHeight={(v) => edit((root) => setParaStyle(root, { lineHeight: String(v / 100) }))}
        />
      </div>
      {findMode && (
        <FindPanel
          mode={findMode}
          onClose={() => { setFindMode(null); clearFound(); focusEditor(); }}
          onFind={(q, o) => doFind(q, o)}
          onReplace={(q, r, o) => {
            const f = foundRef.current;
            const same = f && (o.caseSensitive ? f.toString() === q : f.toString().toLowerCase() === q.toLowerCase());
            if (same) {
              historyRef.current.flush();
              rangeRef.current = replaceRange(f, r);
              foundRef.current = rangeRef.current;
              changed();
            }
            return doFind(q, o);
          }}
          onReplaceAll={(q, r, o) => {
            historyRef.current.flush();
            const n = replaceAll(editorRef.current, q, r, o);
            clearFound();
            if (n) changed();
            return n;
          }}
        />
      )}
      <div className="workspace" onMouseDown={(e) => { if (e.target === e.currentTarget) focusEditor(); }}>
        <div className="zoomer" style={{ zoom }}>
          {showRuler && <Ruler page={page} />}
          <div
            className="paper"
            style={{ width: page.width, padding: `${page.marginTop}px ${page.marginRight}px ${page.marginBottom}px ${page.marginLeft}px` }}
          >
            <div className="page-markers" aria-hidden="true">
              {Array.from({ length: pagesCount - 1 }, (_, i) => (
                <div key={i} className="page-marker" style={{ top: page.marginTop + (i + 1) * contentH }}>
                  <span>{i + 2}쪽</span>
                </div>
              ))}
            </div>
            <div
              ref={editorRef}
              className={`editor ${showMarks ? 'show-marks' : ''}`}
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              onInput={onInput}
              onKeyDown={onEditorKeyDown}
              onPaste={onPaste}
              onDrop={(e) => { if (e.dataTransfer?.files?.length) onDrop(e); }}
              onBlur={() => { captureRange(); historyRef.current?.flush(); }}
              onKeyUp={captureRange}
              onMouseUp={captureRange}
            />
          </div>
        </div>
      </div>
      <div className="statusbar">
        <span>{stats.page} / {stats.pages} 쪽</span>
        <span>글자 {stats.chars.toLocaleString()}</span>
        <span>{(file.format === 'new' ? '새 문서' : file.format.toUpperCase())}{file.version ? ` ${file.version}` : ''}</span>
        <span className="sb-file" title={file.path || ''}>{file.name}{dirty ? ' (수정됨)' : ''}</span>
        <span className="sb-spacer" />
        <span>{Math.round(page.width / MM)} × {Math.round(page.height / MM)} mm</span>
        <span>{Math.round(zoom * 100)}%</span>
      </div>
      {renderDialog()}
      {toast && <div className="toast" role="status">{toast}</div>}
      {busy && <div className="busy"><div className="busy-box">{busy}</div></div>}
    </div>
  );
}

function Ruler({ page }) {
  const cm = 96 / 2.54;
  const ticks = [];
  const n = Math.floor(page.width / (cm / 2));
  for (let i = 0; i <= n; i++) {
    const x = i * (cm / 2);
    const major = i % 2 === 0;
    ticks.push(<div key={i} className={`tick ${major ? 'major' : ''}`} style={{ left: x }}>{major && i > 0 ? i / 2 : ''}</div>);
  }
  return (
    <div className="ruler" style={{ width: page.width }} aria-hidden="true">
      <div className="ruler-margin" style={{ left: 0, width: page.marginLeft }} />
      <div className="ruler-margin" style={{ right: 0, width: page.marginRight }} />
      {ticks}
    </div>
  );
}

const SHORTCUT_HELP = `새 문서\tCtrl+N
불러오기\tCtrl+O
저장하기\tCtrl+S (HWPX)
다른 이름으로 저장\tCtrl+Shift+S
인쇄\tCtrl+P
되돌리기 / 다시 실행\tCtrl+Z / Ctrl+Y
찾기 / 찾아 바꾸기\tCtrl+F / Ctrl+H
진하게 / 기울임 / 밑줄\tCtrl+B / Ctrl+I / Ctrl+U
글자 모양 / 문단 모양\tAlt+L / Alt+T
왼쪽·가운데·오른쪽·양쪽 정렬\tCtrl+Shift+L / C / R / M
표 만들기\tCtrl+Alt+T
그림 넣기\tCtrl+Alt+I
쪽 나누기\tCtrl+Enter
편집 용지\tF7
확대 / 축소\tCtrl+= / Ctrl+-
표 안에서 다음 셀\tTab (이전 셀: Shift+Tab)

macOS 에서는 Ctrl 대신 ⌘(Command) 키를 사용합니다.`;

const ABOUT = `HanEditor 1.0.0
HWP / HWPX 문서를 열고 편집하는 워드프로세서

• HWP 5.0 (바이너리) / HWPX 문서 읽기
• HWPX 형식으로 저장, PDF·HTML·텍스트로 내보내기
• 글자/문단 모양, 표, 그림, 문자표, 찾아 바꾸기, 편집 용지

React + Electron 으로 만들었습니다.
'한글', 'HWP' 는 한글과컴퓨터의 상표입니다. 이 프로그램은 한글과컴퓨터와 관련이 없습니다.`;

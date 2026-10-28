import { useEffect, useRef, useState } from 'react';
import { FONT_SIZES } from './Toolbar.jsx';

export function Modal({ title, onClose, children, footer, width = 420 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current?.querySelector('input, select, button.primary');
    el?.focus();
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width }} ref={ref} role="dialog" aria-label={title}>
        <div className="modal-title">
          <span>{title}</span>
          <button className="modal-x" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

const Row = ({ label, children }) => (
  <label className="form-row">
    <span className="form-label">{label}</span>
    <span className="form-field">{children}</span>
  </label>
);

export function TableDialog({ onClose, onOk }) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(4);
  const ok = () => onOk(Math.max(1, Math.min(200, rows)), Math.max(1, Math.min(50, cols)));
  return (
    <Modal title="표 만들기" onClose={onClose} footer={<><button className="primary" onClick={ok}>만들기</button><button onClick={onClose}>취소</button></>}>
      <Row label="줄 개수"><input type="number" min="1" max="200" value={rows} onChange={(e) => setRows(+e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} /></Row>
      <Row label="칸 개수"><input type="number" min="1" max="50" value={cols} onChange={(e) => setCols(+e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} /></Row>
      <div className="table-preview">
        {Array.from({ length: Math.min(rows, 8) }, (_, r) => (
          <div key={r} className="tp-row">
            {Array.from({ length: Math.min(cols, 10) }, (_, c) => <div key={c} className="tp-cell" />)}
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function CharShapeDialog({ initial, fonts, onClose, onOk }) {
  const [v, setV] = useState({
    fontFamily: initial?.fontFamily || '함초롬바탕',
    fontSize: initial?.fontSize || 10,
    bold: !!initial?.bold,
    italic: !!initial?.italic,
    underline: !!initial?.underline,
    strike: !!initial?.strike,
    color: '#000000',
    letterSpacing: 0,
  });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const previewStyle = {
    fontFamily: `'${v.fontFamily}'`,
    fontSize: `${v.fontSize}pt`,
    fontWeight: v.bold ? 'bold' : 'normal',
    fontStyle: v.italic ? 'italic' : 'normal',
    textDecoration: [v.underline && 'underline', v.strike && 'line-through'].filter(Boolean).join(' ') || 'none',
    color: v.color,
    letterSpacing: `${v.letterSpacing / 100}em`,
  };
  return (
    <Modal title="글자 모양" width={460} onClose={onClose} footer={<><button className="primary" onClick={() => onOk(v)}>설정</button><button onClick={onClose}>취소</button></>}>
      <Row label="글꼴">
        <select value={v.fontFamily} onChange={set('fontFamily')}>
          {[...new Set([v.fontFamily, ...fonts])].map((f) => <option key={f}>{f}</option>)}
        </select>
      </Row>
      <Row label="기준 크기(pt)">
        <input type="number" min="1" max="999" step="0.5" list="font-sizes-dlg" value={v.fontSize} onChange={set('fontSize')} />
        <datalist id="font-sizes-dlg">{FONT_SIZES.map((s) => <option key={s} value={s} />)}</datalist>
      </Row>
      <Row label="자간(%)"><input type="number" min="-50" max="50" value={v.letterSpacing} onChange={set('letterSpacing')} /></Row>
      <Row label="글자 색"><input type="color" value={v.color} onChange={set('color')} /></Row>
      <div className="check-row">
        <label><input type="checkbox" checked={v.bold} onChange={set('bold')} /> 진하게</label>
        <label><input type="checkbox" checked={v.italic} onChange={set('italic')} /> 기울임</label>
        <label><input type="checkbox" checked={v.underline} onChange={set('underline')} /> 밑줄</label>
        <label><input type="checkbox" checked={v.strike} onChange={set('strike')} /> 취소선</label>
      </div>
      <div className="preview-box"><span style={previewStyle}>한글 Hangul 가나다 ABC 123</span></div>
    </Modal>
  );
}

export function ParaShapeDialog({ initial, onClose, onOk }) {
  const mm = (px) => Math.round(((px || 0) * 25.4 / 96) * 10) / 10;
  const [v, setV] = useState({
    align: initial?.align || 'justify',
    marginLeft: mm(initial?.marginLeft),
    marginRight: mm(initial?.marginRight),
    indent: mm(initial?.indent),
    spaceBefore: mm(initial?.spaceBefore),
    spaceAfter: mm(initial?.spaceAfter),
    lineHeight: initial?.lineHeight || 160,
  });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  return (
    <Modal title="문단 모양" width={440} onClose={onClose} footer={<><button className="primary" onClick={() => onOk(v)}>설정</button><button onClick={onClose}>취소</button></>}>
      <Row label="정렬 방식">
        <select value={v.align} onChange={set('align')}>
          <option value="justify">양쪽 정렬</option>
          <option value="left">왼쪽 정렬</option>
          <option value="center">가운데 정렬</option>
          <option value="right">오른쪽 정렬</option>
        </select>
      </Row>
      <Row label="왼쪽 여백(mm)"><input type="number" step="0.5" value={v.marginLeft} onChange={set('marginLeft')} /></Row>
      <Row label="오른쪽 여백(mm)"><input type="number" step="0.5" value={v.marginRight} onChange={set('marginRight')} /></Row>
      <Row label="첫 줄(mm)"><input type="number" step="0.5" value={v.indent} onChange={set('indent')} /><small> 양수: 들여 쓰기, 음수: 내어 쓰기</small></Row>
      <Row label="문단 위(mm)"><input type="number" step="0.5" min="0" value={v.spaceBefore} onChange={set('spaceBefore')} /></Row>
      <Row label="문단 아래(mm)"><input type="number" step="0.5" min="0" value={v.spaceAfter} onChange={set('spaceAfter')} /></Row>
      <Row label="줄 간격(%)"><input type="number" min="50" max="500" step="5" value={v.lineHeight} onChange={set('lineHeight')} /></Row>
    </Modal>
  );
}

export const PAPER = {
  A4: [210, 297],
  A3: [297, 420],
  A5: [148, 210],
  B4: [257, 364],
  B5: [182, 257],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};
const toMm = (px) => Math.round((px * 25.4) / 96 * 10) / 10;
const toPx = (mm) => (mm * 96) / 25.4;

export function PageSetupDialog({ page, onClose, onOk }) {
  const landscape0 = page.width > page.height;
  const wmm = toMm(Math.min(page.width, page.height)), hmm = toMm(Math.max(page.width, page.height));
  const found = Object.entries(PAPER).find(([, [w, h]]) => Math.abs(w - wmm) < 1 && Math.abs(h - hmm) < 1);
  const [v, setV] = useState({
    paper: found ? found[0] : 'custom',
    w: wmm, h: hmm,
    landscape: landscape0,
    top: toMm(page.marginTop), bottom: toMm(page.marginBottom), left: toMm(page.marginLeft), right: toMm(page.marginRight),
  });
  const set = (k) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    const nv = { ...v, [k]: val };
    if (k === 'paper' && PAPER[val]) [nv.w, nv.h] = PAPER[val];
    setV(nv);
  };
  const ok = () => {
    const w = toPx(+v.w), h = toPx(+v.h);
    onOk({
      width: v.landscape ? h : w,
      height: v.landscape ? w : h,
      marginTop: toPx(+v.top), marginBottom: toPx(+v.bottom), marginLeft: toPx(+v.left), marginRight: toPx(+v.right),
    });
  };
  return (
    <Modal title="편집 용지" width={460} onClose={onClose} footer={<><button className="primary" onClick={ok}>설정</button><button onClick={onClose}>취소</button></>}>
      <Row label="용지 종류">
        <select value={v.paper} onChange={set('paper')}>
          {Object.keys(PAPER).map((k) => <option key={k} value={k}>{k} ({PAPER[k][0]} × {PAPER[k][1]} mm)</option>)}
          <option value="custom">사용자 정의</option>
        </select>
      </Row>
      <Row label="폭 × 길이(mm)">
        <input type="number" className="short" value={v.w} disabled={v.paper !== 'custom'} onChange={set('w')} /> ×{' '}
        <input type="number" className="short" value={v.h} disabled={v.paper !== 'custom'} onChange={set('h')} />
      </Row>
      <div className="check-row">
        <label><input type="radio" name="orient" checked={!v.landscape} onChange={() => setV({ ...v, landscape: false })} /> 세로</label>
        <label><input type="radio" name="orient" checked={v.landscape} onChange={() => setV({ ...v, landscape: true })} /> 가로</label>
      </div>
      <fieldset className="fieldset">
        <legend>용지 여백 (mm)</legend>
        <div className="grid2">
          <Row label="위쪽"><input type="number" step="0.5" className="short" value={v.top} onChange={set('top')} /></Row>
          <Row label="아래쪽"><input type="number" step="0.5" className="short" value={v.bottom} onChange={set('bottom')} /></Row>
          <Row label="왼쪽"><input type="number" step="0.5" className="short" value={v.left} onChange={set('left')} /></Row>
          <Row label="오른쪽"><input type="number" step="0.5" className="short" value={v.right} onChange={set('right')} /></Row>
        </div>
      </fieldset>
    </Modal>
  );
}

const SYMBOLS = {
  '기호': '※★☆○●◎◇◆□■△▲▽▼→←↑↓↔〓◁◀▷▶♤♠♡♥♧♣⊙◈▣◐◑▒▤▥▨▧▦▩♨☏☎☜☞¶†‡↕↗↙↖↘♭♩♪♬㉿㈜№㏇™㏂㏘℡',
  '괄호/문장': '「」『』【】〔〕《》〈〉()[]{}‘’“”·‥…§¨〃―∥＼∼´～ˇ˘˝˚˙¸˛¡¿ː',
  '원/괄호 숫자': '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑴⑵⑶⑷⑸⑹⑺⑻⑼⑽㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉪㉫㉬㉭㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷㉸㉹㉺㉻ⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ',
  '수학': '±×÷≠≤≥∞∴♂♀∠⊥⌒∂∇≡≒≪≫√∽∝∵∫∬∈∋⊆⊇⊂⊃∪∩∧∨￢⇒⇔∀∃∮∑∏℃℉°′″Å￠￡￥¤‰αβγδεζηθικλμνξοπρστυφχψω',
  '단위': '㎕㎖㎗ℓ㎘㏄㎣㎤㎥㎦㎙㎚㎛㎜㎝㎞㎟㎠㎡㎢㏊㎍㎎㎏㏏㎈㎉㏈㎧㎨㎰㎱㎲㎳㎴㎵㎶㎷㎸㎹㎀㎁㎂㎃㎄㎺㎻㎼㎽㎾㎿㎐㎑㎒㎓㎔Ω㏀㏁㎊㎋㎌㏖㏅㎭㎮㎯㏛㎩㎪㎫㎬㏝㏐㏓㏃㏉㏜㏆',
};

export function SymbolDialog({ onClose, onInsert }) {
  const [tab, setTab] = useState(Object.keys(SYMBOLS)[0]);
  return (
    <Modal title="문자표" width={520} onClose={onClose} footer={<button onClick={onClose}>닫기</button>}>
      <div className="tabs">
        {Object.keys(SYMBOLS).map((k) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{k}</button>
        ))}
      </div>
      <div className="symbol-grid">
        {Array.from(SYMBOLS[tab]).map((ch, i) => (
          <button key={i} className="symbol" onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(ch)}>{ch}</button>
        ))}
      </div>
    </Modal>
  );
}

export function PromptDialog({ title, label, initial = '', onClose, onOk, type = 'text' }) {
  const [v, setV] = useState(initial);
  return (
    <Modal title={title} onClose={onClose} footer={<><button className="primary" onClick={() => onOk(v)}>확인</button><button onClick={onClose}>취소</button></>}>
      <Row label={label}><input type={type} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onOk(v)} /></Row>
    </Modal>
  );
}

export function MessageDialog({ title, children, onClose, buttons }) {
  return (
    <Modal title={title} width={440} onClose={onClose} footer={buttons || <button className="primary" onClick={onClose}>확인</button>}>
      {children}
    </Modal>
  );
}

export function FindPanel({ mode, onClose, onFind, onReplace, onReplaceAll }) {
  const [q, setQ] = useState('');
  const [r, setR] = useState('');
  const [cs, setCs] = useState(false);
  const [msg, setMsg] = useState('');
  const inputRef = useRef(null);
  useEffect(() => inputRef.current?.focus(), [mode]);
  const opts = { caseSensitive: cs };
  const find = (backwards) => setMsg(onFind(q, { ...opts, backwards }) ? '' : '찾는 내용이 없습니다.');
  return (
    <div className="find-panel" role="dialog" aria-label="찾기">
      <div className="find-row">
        <input ref={inputRef} placeholder="찾을 내용" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') find(e.shiftKey); if (e.key === 'Escape') onClose(); }} />
        <button onClick={() => find(true)} title="이전 찾기 (Shift+Enter)">▲</button>
        <button onClick={() => find(false)} title="다음 찾기 (Enter)">▼</button>
        <label className="find-cs"><input type="checkbox" checked={cs} onChange={(e) => setCs(e.target.checked)} /> 대소문자</label>
        <button className="find-x" onClick={onClose} aria-label="닫기">×</button>
      </div>
      {mode === 'replace' && (
        <div className="find-row">
          <input placeholder="바꿀 내용" value={r} onChange={(e) => setR(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onReplace(q, r, opts); if (e.key === 'Escape') onClose(); }} />
          <button onClick={() => setMsg(onReplace(q, r, opts) ? '' : '찾는 내용이 없습니다.')}>바꾸기</button>
          <button onClick={() => setMsg(`${onReplaceAll(q, r, opts)}개를 바꾸었습니다.`)}>모두 바꾸기</button>
        </div>
      )}
      {msg && <div className="find-msg">{msg}</div>}
    </div>
  );
}

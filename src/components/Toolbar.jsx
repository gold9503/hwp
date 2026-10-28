import Icon from './Icon.jsx';

export const FONT_SIZES = [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 54, 60, 72];
const LINE_HEIGHTS = [100, 115, 130, 160, 180, 200, 250, 300];

function Btn({ icon, label, cmd, onCommand, active, text, className = '' }) {
  return (
    <button
      className={`tb-btn ${active ? 'active' : ''} ${className}`}
      title={label}
      aria-label={label}
      aria-pressed={active ?? undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onCommand(cmd)}
    >
      {icon ? <Icon name={icon} /> : <span className="tb-text">{text}</span>}
    </button>
  );
}

function BigBtn({ icon, label, cmd, onCommand }) {
  return (
    <button className="tb-big" title={label} onMouseDown={(e) => e.preventDefault()} onClick={() => onCommand(cmd)}>
      <Icon name={icon} size={22} />
      <span>{label}</span>
    </button>
  );
}

export default function Toolbar({ fmt, fonts, onCommand, onFont, onFontSize, onColor, onHighlight, onLineHeight, zoom, onZoom }) {
  const f = fmt || {};
  const sizeValue = f.fontSize ? String(f.fontSize) : '10';
  return (
    <div className="toolbars">
      <div className="toolbar toolbar-main">
        <BigBtn icon="new" label="새 문서" cmd="new" onCommand={onCommand} />
        <BigBtn icon="open" label="불러오기" cmd="open" onCommand={onCommand} />
        <BigBtn icon="save" label="저장하기" cmd="save" onCommand={onCommand} />
        <BigBtn icon="print" label="인쇄" cmd="print" onCommand={onCommand} />
        <BigBtn icon="pdf" label="PDF" cmd="exportPdf" onCommand={onCommand} />
        <div className="tb-sep" />
        <BigBtn icon="undo" label="되돌리기" cmd="undo" onCommand={onCommand} />
        <BigBtn icon="redo" label="다시 실행" cmd="redo" onCommand={onCommand} />
        <div className="tb-sep" />
        <BigBtn icon="cut" label="오려 두기" cmd="cut" onCommand={onCommand} />
        <BigBtn icon="copy" label="복사하기" cmd="copy" onCommand={onCommand} />
        <BigBtn icon="paste" label="붙이기" cmd="paste" onCommand={onCommand} />
        <div className="tb-sep" />
        <BigBtn icon="charShape" label="글자 모양" cmd="charShape" onCommand={onCommand} />
        <BigBtn icon="paraShape" label="문단 모양" cmd="paraShape" onCommand={onCommand} />
        <div className="tb-sep" />
        <BigBtn icon="table" label="표" cmd="insertTable" onCommand={onCommand} />
        <BigBtn icon="image" label="그림" cmd="insertImage" onCommand={onCommand} />
        <BigBtn icon="symbol" label="문자표" cmd="insertSymbol" onCommand={onCommand} />
        <BigBtn icon="pageBreak" label="쪽 나누기" cmd="pageBreak" onCommand={onCommand} />
        <BigBtn icon="page" label="편집 용지" cmd="pageSetup" onCommand={onCommand} />
        <div className="tb-sep" />
        <BigBtn icon="find" label="찾기" cmd="find" onCommand={onCommand} />
        <BigBtn icon="replace" label="바꾸기" cmd="replace" onCommand={onCommand} />
      </div>
      <div className="toolbar toolbar-format">
        <select
          className="tb-font"
          title="글꼴"
          value={fonts.includes(f.fontFamily) ? f.fontFamily : '__current'}
          onChange={(e) => e.target.value !== '__current' && onFont(e.target.value)}
        >
          {!fonts.includes(f.fontFamily) && <option value="__current">{f.fontFamily || '함초롬바탕'}</option>}
          {fonts.map((name) => (
            <option key={name} value={name} style={{ fontFamily: `'${name}'` }}>
              {name}
            </option>
          ))}
        </select>
        <input
          className="tb-size"
          title="글자 크기 (pt)"
          list="font-sizes"
          key={sizeValue}
          defaultValue={sizeValue}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const v = parseFloat(e.currentTarget.value);
              if (v > 0 && v < 1000) onFontSize(v);
            }
          }}
          onInput={(e) => {
            // 목록에서 고른 경우(insertReplacementText)에만 바로 적용, 직접 입력은 Enter 로 적용
            if (e.nativeEvent.inputType === 'insertReplacementText' || !e.nativeEvent.inputType) {
              const v = parseFloat(e.currentTarget.value);
              if (FONT_SIZES.includes(v)) onFontSize(v);
            }
          }}
        />
        <datalist id="font-sizes">
          {FONT_SIZES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <span className="tb-unit">pt</span>
        <div className="tb-sep" />
        <Btn text={<b>가</b>} label="진하게 (Ctrl+B)" cmd="bold" onCommand={onCommand} active={f.bold} />
        <Btn text={<i>가</i>} label="기울임 (Ctrl+I)" cmd="italic" onCommand={onCommand} active={f.italic} />
        <Btn text={<u>가</u>} label="밑줄 (Ctrl+U)" cmd="underline" onCommand={onCommand} active={f.underline} />
        <Btn text={<s>가</s>} label="취소선" cmd="strike" onCommand={onCommand} active={f.strike} />
        <Btn text={<span>가<sup>2</sup></span>} label="위 첨자" cmd="superscript" onCommand={onCommand} active={f.sup} />
        <Btn text={<span>가<sub>2</sub></span>} label="아래 첨자" cmd="subscript" onCommand={onCommand} active={f.sub} />
        <label className="tb-color" title="글자 색">
          <span className="tb-text" style={{ borderBottom: '3px solid #d0021b' }}>가</span>
          <input type="color" defaultValue="#d0021b" onChange={(e) => onColor(e.target.value)} />
        </label>
        <label className="tb-color" title="형광펜 (음영 색)">
          <span className="tb-text" style={{ background: '#fff176', padding: '0 2px' }}>가</span>
          <input type="color" defaultValue="#fff176" onChange={(e) => onHighlight(e.target.value)} />
        </label>
        <Btn icon="clear" label="서식 지우기" cmd="clearFormat" onCommand={onCommand} />
        <div className="tb-sep" />
        <Btn icon="alignJustify" label="양쪽 정렬" cmd="alignJustify" onCommand={onCommand} active={f.align === 'justify'} />
        <Btn icon="alignLeft" label="왼쪽 정렬" cmd="alignLeft" onCommand={onCommand} active={f.align === 'left'} />
        <Btn icon="alignCenter" label="가운데 정렬" cmd="alignCenter" onCommand={onCommand} active={f.align === 'center'} />
        <Btn icon="alignRight" label="오른쪽 정렬" cmd="alignRight" onCommand={onCommand} active={f.align === 'right'} />
        <div className="tb-sep" />
        <select className="tb-line" title="줄 간격" value="" onChange={(e) => e.target.value && onLineHeight(Number(e.target.value))}>
          <option value="">줄 간격</option>
          {LINE_HEIGHTS.map((v) => (
            <option key={v} value={v}>
              {v}%
            </option>
          ))}
        </select>
        <Btn icon="bulletList" label="글머리표" cmd="bulletList" onCommand={onCommand} />
        <Btn icon="numberList" label="문단 번호" cmd="numberList" onCommand={onCommand} />
        <Btn icon="outdent" label="내어 쓰기" cmd="outdent" onCommand={onCommand} />
        <Btn icon="indent" label="들여 쓰기" cmd="indent" onCommand={onCommand} />
        <div className="tb-sep" />
        <Btn icon="marks" label="문단 부호" cmd="toggleMarks" onCommand={onCommand} />
        <div className="tb-spacer" />
        <Btn icon="zoomOut" label="축소" cmd="zoomOut" onCommand={onCommand} />
        <select className="tb-zoom" title="확대/축소" value={Math.round(zoom * 100)} onChange={(e) => onZoom(Number(e.target.value) / 100)}>
          {[50, 75, 90, 100, 110, 125, 150, 175, 200, 300].concat([Math.round(zoom * 100)]).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).map((v) => (
            <option key={v} value={v}>
              {v}%
            </option>
          ))}
        </select>
        <Btn icon="zoomIn" label="확대" cmd="zoomIn" onCommand={onCommand} />
      </div>
    </div>
  );
}

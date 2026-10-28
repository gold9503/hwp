import { useEffect, useRef, useState } from 'react';

// 창 안의 메뉴 표시줄 (Windows/브라우저용, macOS 는 시스템 메뉴 사용)
export const MENUS = [
  {
    label: '파일',
    items: [
      ['새 문서', 'new', 'Ctrl+N'],
      ['불러오기...', 'open', 'Ctrl+O'],
      '-',
      ['저장하기', 'save', 'Ctrl+S'],
      ['다른 이름으로 저장하기...', 'saveAs', 'Ctrl+Shift+S'],
      '-',
      ['PDF로 내보내기...', 'exportPdf'],
      ['HTML로 내보내기...', 'exportHtml'],
      ['텍스트로 내보내기...', 'exportTxt'],
      '-',
      ['편집 용지...', 'pageSetup', 'F7'],
      ['인쇄...', 'print', 'Ctrl+P'],
    ],
  },
  {
    label: '편집',
    items: [
      ['되돌리기', 'undo', 'Ctrl+Z'],
      ['다시 실행', 'redo', 'Ctrl+Y'],
      '-',
      ['오려 두기', 'cut', 'Ctrl+X'],
      ['복사하기', 'copy', 'Ctrl+C'],
      ['붙이기', 'paste', 'Ctrl+V'],
      ['모두 선택', 'selectAll', 'Ctrl+A'],
      '-',
      ['찾기...', 'find', 'Ctrl+F'],
      ['찾아 바꾸기...', 'replace', 'Ctrl+H'],
    ],
  },
  {
    label: '보기',
    items: [
      ['확대', 'zoomIn', 'Ctrl+='],
      ['축소', 'zoomOut', 'Ctrl+-'],
      ['100%', 'zoomReset', 'Ctrl+0'],
      '-',
      ['문단 부호 보이기/숨기기', 'toggleMarks'],
      ['눈금자 보이기/숨기기', 'toggleRuler'],
    ],
  },
  {
    label: '입력',
    items: [
      ['표 만들기...', 'insertTable', 'Ctrl+Alt+T'],
      ['그림 넣기...', 'insertImage', 'Ctrl+Alt+I'],
      ['문자표...', 'insertSymbol', 'Ctrl+F10'],
      ['날짜/시간 넣기', 'insertDate'],
      ['하이퍼링크...', 'insertLink', 'Ctrl+K'],
      ['가로줄 넣기', 'insertHr'],
      '-',
      ['쪽 나누기', 'pageBreak', 'Ctrl+Enter'],
    ],
  },
  {
    label: '서식',
    items: [
      ['글자 모양...', 'charShape', 'Alt+L'],
      ['문단 모양...', 'paraShape', 'Alt+T'],
      '-',
      ['진하게', 'bold', 'Ctrl+B'],
      ['기울임', 'italic', 'Ctrl+I'],
      ['밑줄', 'underline', 'Ctrl+U'],
      ['취소선', 'strike'],
      ['위 첨자', 'superscript'],
      ['아래 첨자', 'subscript'],
      '-',
      ['양쪽 정렬', 'alignJustify', 'Ctrl+Shift+M'],
      ['왼쪽 정렬', 'alignLeft', 'Ctrl+Shift+L'],
      ['가운데 정렬', 'alignCenter', 'Ctrl+Shift+C'],
      ['오른쪽 정렬', 'alignRight', 'Ctrl+Shift+R'],
      '-',
      ['글머리표', 'bulletList'],
      ['문단 번호', 'numberList'],
      ['서식 지우기', 'clearFormat'],
    ],
  },
  {
    label: '쪽',
    items: [
      ['편집 용지...', 'pageSetup', 'F7'],
      ['쪽 번호 매기기', 'togglePageNumber'],
      ['쪽 나누기', 'pageBreak', 'Ctrl+Enter'],
    ],
  },
  {
    label: '표',
    items: [
      ['표 만들기...', 'insertTable', 'Ctrl+Alt+T'],
      '-',
      ['위에 줄 추가하기', 'rowAbove'],
      ['아래에 줄 추가하기', 'rowBelow'],
      ['왼쪽에 칸 추가하기', 'colLeft'],
      ['오른쪽에 칸 추가하기', 'colRight'],
      '-',
      ['줄 지우기', 'deleteRow'],
      ['칸 지우기', 'deleteCol'],
      ['오른쪽 셀과 합치기', 'mergeRight'],
      ['아래 셀과 합치기', 'mergeDown'],
      ['셀 나누기', 'splitCell'],
      '-',
      ['셀 배경색...', 'cellColor'],
      ['표 지우기', 'deleteTable'],
    ],
  },
  {
    label: '도구',
    items: [
      ['글자 수 세기', 'wordCount'],
      ['문서 정보', 'docInfo'],
    ],
  },
  {
    label: '도움말',
    items: [
      ['단축키 안내', 'shortcuts', 'F1'],
      ['HanEditor 정보', 'about'],
    ],
  },
];

export default function MenuBar({ onCommand, extra }) {
  const [open, setOpen] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(null);
    };
    const esc = (e) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  return (
    <div className="menubar" ref={ref}>
      {MENUS.map((m, i) => (
        <div key={m.label} className={`menu ${open === i ? 'open' : ''}`}>
          <button
            className="menu-title"
            onMouseDown={(e) => {
              e.preventDefault();
              setOpen(open === i ? null : i);
            }}
            onMouseEnter={() => open !== null && setOpen(i)}
          >
            {m.label}
          </button>
          {open === i && (
            <div className="menu-pop" role="menu">
              {m.items.map((it, k) =>
                it === '-' ? (
                  <div key={k} className="menu-sep" />
                ) : (
                  <button
                    key={it[1] + k}
                    className="menu-item"
                    role="menuitem"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setOpen(null);
                      onCommand(it[1]);
                    }}
                  >
                    <span>{it[0]}</span>
                    {it[2] && <span className="menu-key">{it[2]}</span>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
      <div className="menubar-extra">{extra}</div>
    </div>
  );
}

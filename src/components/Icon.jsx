// 도구 상자 아이콘 (24x24 선 아이콘)
const P = {
  new: 'M6 2h8l5 5v15H6z M14 2v5h5 M12 11v6 M9 14h6',
  open: 'M3 6h6l2 2h10v11H3z M3 10h18',
  save: 'M4 3h13l3 3v15H4z M8 3v5h8V3 M7 21v-7h10v7',
  print: 'M6 9V3h12v6 M6 18H3v-8h18v8h-3 M6 14h12v7H6z',
  pdf: 'M6 2h8l5 5v15H6z M14 2v5h5 M8.5 17v-5h1.6a1.4 1.4 0 0 1 0 2.8H8.5 M13 12v5h1a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2z',
  undo: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3',
  cut: 'M6 6m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M6 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M20 4L8.1 15.9 M14.5 14.5L20 20 M8.1 8.1L12 12',
  copy: 'M9 9h11v12H9z M5 15H4V3h12v1',
  paste: 'M9 2h6v3H9z M7 4H5v18h14V4h-2 M9 12h6 M9 16h6',
  find: 'M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M21 21l-5-5',
  replace: 'M4 7h12l-3-3 M20 17H8l3 3',
  table: 'M3 4h18v16H3z M3 10h18 M3 15h18 M9 4v16 M15 4v16',
  image: 'M3 4h18v16H3z M8.5 9.5m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0 M21 15l-5-5L5 20',
  pageBreak: 'M5 2v6h14V2 M5 22v-6h14v6 M2 12h3 M8 12h3 M13 12h3 M19 12h3',
  symbol: 'M5 20h4v-2.5A7 7 0 1 1 15 17.5V20h4',
  alignJustify: 'M3 5h18 M3 10h18 M3 15h18 M3 20h18',
  alignLeft: 'M3 5h18 M3 10h12 M3 15h18 M3 20h12',
  alignCenter: 'M3 5h18 M6 10h12 M3 15h18 M6 20h12',
  alignRight: 'M3 5h18 M9 10h12 M3 15h18 M9 20h12',
  bulletList: 'M9 6h12 M9 12h12 M9 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  numberList: 'M10 6h11 M10 12h11 M10 18h11 M4 4v4 M3 8h2 M3 11h2v2H3v2h2 M3 17h2v4H3 M3 19h2',
  indent: 'M3 4h18 M9 9h12 M9 14h12 M3 19h18 M3 9l3 2.5L3 14',
  outdent: 'M3 4h18 M9 9h12 M9 14h12 M3 19h18 M6 9l-3 2.5L6 14',
  zoomIn: 'M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M21 21l-5-5 M11 8v6 M8 11h6',
  zoomOut: 'M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M21 21l-5-5 M8 11h6',
  clear: 'M4 7V4h16v3 M9 20h6 M12 4v16 M3 21L21 3',
  marks: 'M10 4v16 M15 4v16 M18 4H9.5a4.5 4.5 0 0 0 0 9H10',
  charShape: 'M4 20L10 4h1l6 16 M6.5 14h9 M17 20h4',
  paraShape: 'M3 5h18 M7 10h14 M3 15h18 M7 20h14 M3 8v4',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7 M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  page: 'M5 2h14v20H5z M8 6h8 M8 10h8 M8 14h5',
};

export default function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] || ''} />
    </svg>
  );
}

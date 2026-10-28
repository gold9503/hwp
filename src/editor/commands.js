// 편집기 서식/표/찾기 명령
const BLOCK_SEL = 'p, div.hwp-p, h1, h2, h3, h4, h5, h6, li, blockquote, pre';

export function getRange(root) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  return root.contains(r.commonAncestorContainer) ? r : null;
}

export function exec(cmd, value = null) {
  document.execCommand(cmd, false, value);
}

const elOf = (n) => (n && n.nodeType === 3 ? n.parentElement : n);

// 선택 영역 글자 크기(pt) 적용: execCommand('fontSize') 로 표시 후 span 으로 교체
export function setFontSize(root, pt) {
  const r = getRange(root);
  if (!r) return;
  exec('styleWithCSS', false);
  if (r.collapsed) {
    insertStyledCaret(`font-size: ${pt}pt`);
    return;
  }
  exec('fontSize', '7');
  replaceFontTags(root, 'font[size="7"]', (span) => {
    span.style.fontSize = `${pt}pt`;
    for (const inner of span.querySelectorAll('[style]')) inner.style.fontSize = '';
  });
}

// execCommand 가 만든 <font> 를 span 으로 바꾸고 선택 영역을 유지
function replaceFontTags(root, selector, decorate) {
  const spans = [];
  for (const f of root.querySelectorAll(selector)) {
    const span = document.createElement('span');
    span.append(...f.childNodes);
    decorate(span, f);
    f.replaceWith(span);
    spans.push(span);
  }
  if (!spans.length) return;
  const r = document.createRange();
  r.setStartBefore(spans[0]);
  r.setEndAfter(spans[spans.length - 1]);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
}

export function setFontName(root, name) {
  const r = getRange(root);
  if (!r) return;
  if (r.collapsed) {
    insertStyledCaret(`font-family: '${name}'`);
    return;
  }
  exec('styleWithCSS', false);
  exec('fontName', name);
  replaceFontTags(root, 'font[face]', (span, f) => {
    span.style.fontFamily = `'${f.getAttribute('face')}'`;
    for (const inner of span.querySelectorAll('[style]')) inner.style.fontFamily = '';
  });
}

export function setColor(color, background = false) {
  exec('styleWithCSS', true);
  exec(background ? 'hiliteColor' : 'foreColor', color);
  exec('styleWithCSS', false);
}

// 커서 위치에 스타일이 적용된 빈 span 을 넣어 이어서 입력되도록 함
function insertStyledCaret(css) {
  const sel = window.getSelection();
  const r = sel.getRangeAt(0);
  const span = document.createElement('span');
  span.setAttribute('style', css);
  span.textContent = '​';
  r.insertNode(span);
  const nr = document.createRange();
  nr.setStart(span.firstChild, 1);
  nr.collapse(true);
  sel.removeAllRanges();
  sel.addRange(nr);
}

// 선택 영역에 걸친 문단 요소들
export function selectedBlocks(root) {
  const r = getRange(root);
  if (!r) return [];
  const startBlock = elOf(r.startContainer).closest(BLOCK_SEL);
  const endBlock = elOf(r.endContainer).closest(BLOCK_SEL);
  const all = Array.from(root.querySelectorAll(BLOCK_SEL));
  const blocks = all.filter((b) => r.intersectsNode(b) && !b.querySelector(BLOCK_SEL));
  if (!blocks.length) {
    if (startBlock && root.contains(startBlock)) return [startBlock];
    // 문단 요소 밖에 있는 텍스트는 p 로 감싸기
    exec('formatBlock', 'p');
    const b = elOf(getRange(root)?.startContainer)?.closest(BLOCK_SEL);
    return b ? [b] : [];
  }
  if (startBlock && !blocks.includes(startBlock) && root.contains(startBlock)) blocks.unshift(startBlock);
  if (endBlock && !blocks.includes(endBlock) && root.contains(endBlock)) blocks.push(endBlock);
  return blocks;
}

export function setParaStyle(root, styles) {
  for (const b of selectedBlocks(root)) Object.assign(b.style, styles);
}

export function getParaStyle(root) {
  const b = selectedBlocks(root)[0];
  if (!b) return {};
  const cs = getComputedStyle(b);
  const fs = parseFloat(cs.fontSize) || 16;
  const lh = cs.lineHeight === 'normal' ? 1.6 : parseFloat(cs.lineHeight) / fs;
  return {
    align: cs.textAlign === 'start' ? 'left' : cs.textAlign,
    marginLeft: parseFloat(cs.marginLeft) || 0,
    marginRight: parseFloat(cs.marginRight) || 0,
    indent: parseFloat(cs.textIndent) || 0,
    spaceBefore: parseFloat(cs.marginTop) || 0,
    spaceAfter: parseFloat(cs.marginBottom) || 0,
    lineHeight: Math.round(lh * 100),
  };
}

// 현재 커서 위치의 글자 서식(툴바 표시용)
export function currentFormat(root) {
  const r = getRange(root);
  if (!r) return null;
  const el = elOf(r.startContainer);
  if (!el || !root.contains(el)) return null;
  const cs = getComputedStyle(el);
  const block = el.closest(BLOCK_SEL);
  const bcs = block ? getComputedStyle(block) : cs;
  const q = (c) => {
    try {
      return document.queryCommandState(c);
    } catch {
      return false;
    }
  };
  return {
    fontFamily: cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim(),
    fontSize: Math.round((parseFloat(cs.fontSize) * 72) / 96 * 2) / 2,
    bold: q('bold'),
    italic: q('italic'),
    underline: q('underline'),
    strike: q('strikeThrough'),
    sup: q('superscript'),
    sub: q('subscript'),
    color: cs.color,
    align: bcs.textAlign === 'start' ? 'left' : bcs.textAlign,
    inTable: !!el.closest('td, th'),
  };
}

// ---------------- 표 ----------------

// 커서가 있는 문단 뒤(빈 문단이면 그 자리)에 블록 요소를 넣는다
export function insertBlock(root, el) {
  const r = getRange(root);
  let block = r && elOf(r.startContainer)?.closest(BLOCK_SEL);
  if (block && !root.contains(block)) block = null;
  if (r && !r.collapsed) r.deleteContents();
  if (!block) root.appendChild(el);
  else if (!block.textContent.replace(/\u200b/g, '') && !block.querySelector('img')) block.replaceWith(el);
  else block.after(el);
  // 표 뒤에 빈 문단 보장
  if (!el.nextElementSibling || el.nextElementSibling.tagName === 'TABLE') {
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    el.after(p);
  }
  return el;
}

export function createTable(rows, cols, widthPx) {
  const t = document.createElement('table');
  t.className = 'hwp-table';
  t.style.width = `${widthPx}px`;
  const tbody = t.createTBody();
  const w = Math.floor(widthPx / cols);
  for (let i = 0; i < rows; i++) {
    const tr = tbody.insertRow();
    for (let j = 0; j < cols; j++) {
      const td = tr.insertCell();
      td.setAttribute('style', `width: ${w}px; border: 1px solid #000000; padding: 2px 6px; vertical-align: middle;`);
      td.innerHTML = '<p><br></p>';
    }
  }
  return t;
}

export function placeCaret(node, atEnd = false) {
  const r = document.createRange();
  r.selectNodeContents(node);
  r.collapse(!atEnd);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
}

function currentCell(root) {
  const r = getRange(root);
  const el = r && elOf(r.startContainer);
  const td = el && el.closest('td, th');
  return td && root.contains(td) ? td : null;
}

// 병합을 고려한 표 격자: grid[row][col] = cell
function tableGrid(table) {
  const grid = [];
  Array.from(table.rows).forEach((tr, ri) => {
    grid[ri] = grid[ri] || [];
    let ci = 0;
    for (const cell of tr.cells) {
      while (grid[ri][ci]) ci++;
      for (let r = 0; r < cell.rowSpan; r++)
        for (let c = 0; c < cell.colSpan; c++) {
          grid[ri + r] = grid[ri + r] || [];
          grid[ri + r][ci + c] = cell;
        }
      ci += cell.colSpan;
    }
  });
  return grid;
}

function cellPos(grid, cell) {
  for (let r = 0; r < grid.length; r++) {
    const c = grid[r].indexOf(cell);
    if (c >= 0) return { r, c };
  }
  return null;
}

function newCellLike(cell) {
  const td = document.createElement('td');
  td.setAttribute('style', cell.getAttribute('style') || '');
  td.innerHTML = '<p><br></p>';
  return td;
}

function moveCaretInto(cell) {
  const p = cell.querySelector('p, div') || cell;
  const r = document.createRange();
  r.selectNodeContents(p);
  r.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
}

export const tableOps = {
  rowAbove: (root) => insertRow(root, false),
  rowBelow: (root) => insertRow(root, true),
  colLeft: (root) => insertCol(root, false),
  colRight: (root) => insertCol(root, true),
  deleteRow(root) {
    const cell = currentCell(root);
    if (!cell) return false;
    const table = cell.closest('table');
    const grid = tableGrid(table);
    const { r } = cellPos(grid, cell);
    const tr = table.rows[r];
    // 이 줄을 지나는 병합 셀은 rowSpan 축소
    for (const c of new Set(grid[r])) {
      if (c.parentElement !== tr && c.rowSpan > 1) c.rowSpan -= 1;
    }
    // 이 줄에서 시작하는 병합 셀은 다음 줄로 이동
    const next = table.rows[r + 1];
    if (next) {
      for (const c of Array.from(tr.cells)) {
        if (c.rowSpan > 1) {
          const pos = cellPos(grid, c).c;
          const nc = newCellLike(c);
          nc.colSpan = c.colSpan;
          nc.rowSpan = c.rowSpan - 1;
          nc.innerHTML = c.innerHTML;
          const after = Array.from(next.cells).find((x) => cellPos(grid, x).c > pos);
          next.insertBefore(nc, after || null);
        }
      }
    }
    tr.remove();
    if (!table.rows.length) table.remove();
    return true;
  },
  deleteCol(root) {
    const cell = currentCell(root);
    if (!cell) return false;
    const table = cell.closest('table');
    const grid = tableGrid(table);
    const { c } = cellPos(grid, cell);
    for (const x of new Set(grid.map((row) => row[c]).filter(Boolean))) {
      if (x.colSpan > 1) x.colSpan -= 1;
      else x.remove();
    }
    for (const tr of Array.from(table.rows)) if (!tr.cells.length) tr.remove();
    if (!table.rows.length) table.remove();
    return true;
  },
  mergeRight(root) {
    const cell = currentCell(root);
    if (!cell) return false;
    const grid = tableGrid(cell.closest('table'));
    const { r, c } = cellPos(grid, cell);
    const right = grid[r][c + cell.colSpan];
    if (!right || right.rowSpan !== cell.rowSpan || cellPos(grid, right).r !== r) return false;
    if (right.textContent.trim()) cell.append(...right.childNodes);
    cell.colSpan += right.colSpan;
    right.remove();
    return true;
  },
  mergeDown(root) {
    const cell = currentCell(root);
    if (!cell) return false;
    const grid = tableGrid(cell.closest('table'));
    const { r, c } = cellPos(grid, cell);
    const below = grid[r + cell.rowSpan]?.[c];
    if (!below || below.colSpan !== cell.colSpan || cellPos(grid, below).c !== c) return false;
    if (below.textContent.trim()) cell.append(...below.childNodes);
    cell.rowSpan += below.rowSpan;
    below.remove();
    return true;
  },
  splitCell(root) {
    const cell = currentCell(root);
    if (!cell || (cell.colSpan === 1 && cell.rowSpan === 1)) return false;
    const table = cell.closest('table');
    const grid = tableGrid(table);
    const { r, c } = cellPos(grid, cell);
    const { colSpan, rowSpan } = cell;
    cell.colSpan = 1;
    cell.rowSpan = 1;
    for (let i = 1; i < colSpan; i++) cell.after(newCellLike(cell));
    for (let k = 1; k < rowSpan; k++) {
      const tr = table.rows[r + k];
      const after = Array.from(tr.cells).find((x) => cellPos(grid, x).c > c);
      for (let i = 0; i < colSpan; i++) tr.insertBefore(newCellLike(cell), after || null);
    }
    return true;
  },
  deleteTable(root) {
    const cell = currentCell(root);
    if (!cell) return false;
    cell.closest('table').remove();
    return true;
  },
  cellColor(root, color) {
    const cell = currentCell(root);
    if (!cell) return false;
    cell.style.backgroundColor = color;
    return true;
  },
};

function insertRow(root, below) {
  const cell = currentCell(root);
  if (!cell) return false;
  const table = cell.closest('table');
  const grid = tableGrid(table);
  const { r } = cellPos(grid, cell);
  const target = below ? r + cell.rowSpan - 1 : r;
  const tr = document.createElement('tr');
  const seen = new Set();
  for (let c = 0; c < grid[target].length; c++) {
    const x = grid[target][c];
    if (!x || seen.has(x)) continue;
    seen.add(x);
    const pos = cellPos(grid, x);
    const spans = below ? pos.r + x.rowSpan - 1 > target : pos.r < target;
    if (spans) x.rowSpan += 1;
    else {
      for (let k = 0; k < x.colSpan; k++) tr.appendChild(newCellLike(x));
    }
  }
  const ref = table.rows[target];
  ref.parentNode.insertBefore(tr, below ? ref.nextSibling : ref);
  if (tr.cells[0]) moveCaretInto(tr.cells[0]);
  return true;
}

function insertCol(root, right) {
  const cell = currentCell(root);
  if (!cell) return false;
  const table = cell.closest('table');
  const grid = tableGrid(table);
  const { c } = cellPos(grid, cell);
  const target = right ? c + cell.colSpan - 1 : c;
  const handled = new Set();
  grid.forEach((row, ri) => {
    const x = row[target];
    if (!x || handled.has(x)) return;
    handled.add(x);
    const pos = cellPos(grid, x);
    const spans = right ? pos.c + x.colSpan - 1 > target : pos.c < target;
    if (spans) x.colSpan += 1;
    else {
      const nc = newCellLike(x);
      nc.rowSpan = x.rowSpan;
      if (right) x.after(nc);
      else x.before(nc);
    }
  });
  return true;
}

// ---------------- 찾기/바꾸기 ----------------

function textNodes(root) {
  const out = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) out.push(w.currentNode);
  return out;
}

// 문서 전체 텍스트에서 query 를 찾아 from(Range) 다음 위치의 Range 를 돌려줌
export function findNext(root, query, { caseSensitive = false, backwards = false } = {}, from = null) {
  if (!query) return null;
  const nodes = textNodes(root);
  if (!nodes.length) return null;
  let full = '';
  const starts = nodes.map((n) => {
    const s = full.length;
    full += n.nodeValue;
    return s;
  });
  const hay = caseSensitive ? full : full.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();

  // 기준 위치(전역 오프셋)
  let cur = backwards ? full.length : 0;
  if (from && root.contains(from.startContainer)) {
    const node = backwards ? from.startContainer : from.endContainer;
    const off = backwards ? from.startOffset : from.endOffset;
    const idx = nodes.indexOf(node);
    if (idx >= 0) cur = starts[idx] + off;
    else {
      const pre = document.createRange();
      pre.selectNodeContents(root);
      pre.setEnd(node, off);
      cur = pre.toString().length;
    }
  }
  let at = backwards ? (cur > 0 ? hay.lastIndexOf(needle, cur - needle.length) : -1) : hay.indexOf(needle, cur);
  if (at < 0) at = backwards ? hay.lastIndexOf(needle) : hay.indexOf(needle); // 끝에서 처음으로 이어서 찾기
  if (at < 0) return null;

  const locate = (pos, isEnd) => {
    for (let i = 0; i < nodes.length; i++) {
      const len = nodes[i].nodeValue.length;
      if (pos < starts[i] + len || (isEnd && pos === starts[i] + len)) return [nodes[i], pos - starts[i]];
    }
    const last = nodes[nodes.length - 1];
    return [last, last.nodeValue.length];
  };
  const [sn, so] = locate(at, false);
  const [en, eo] = locate(at + needle.length, true);
  const range = document.createRange();
  range.setStart(sn, so);
  range.setEnd(en, eo);
  return range;
}

// 찾은 범위(range)를 바꿀 내용으로 교체
export function replaceRange(range, replacement) {
  range.deleteContents();
  const t = document.createTextNode(replacement);
  range.insertNode(t);
  const r = document.createRange();
  r.setStartAfter(t);
  r.collapse(true);
  return r;
}

export function replaceAll(root, query, replacement, { caseSensitive = false } = {}) {
  if (!query) return 0;
  let count = 0;
  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
  // 텍스트 노드 단위로 교체(노드 경계를 넘는 일치는 제외)
  for (const n of textNodes(root)) {
    const v = n.nodeValue;
    const nv = v.replace(re, () => {
      count++;
      return replacement;
    });
    if (nv !== v) n.nodeValue = nv;
  }
  return count;
}

// ---------------- 기타 ----------------

export function countStats(root) {
  const text = root.innerText || '';
  const noSpace = text.replace(/\s/g, '');
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const paras = root.querySelectorAll('p, div.hwp-p, li').length;
  return { chars: text.replace(/\n/g, '').length, charsNoSpace: noSpace.length, words, paras };
}

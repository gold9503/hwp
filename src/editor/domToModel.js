// 편집기 DOM → 공통 문서 모델 (HWPX/텍스트 저장용)
import { FALLBACK_FONTS } from '../hwp/util.js';

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', '-apple-system', 'blinkmacsystemfont']);
const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'LI', 'SECTION', 'ARTICLE']);

export function cssColorToHex(c) {
  const m = /rgba?\(([^)]+)\)/.exec(c || '');
  if (!m) return c && c.startsWith('#') ? c.toUpperCase() : null;
  const [r, g, b, a] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (a === 0) return null;
  return '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function runStyle(el, block) {
  const cs = getComputedStyle(el);
  const s = {};
  let fonts = cs.fontFamily.split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, '')).filter((f) => f && !GENERIC.has(f.toLowerCase()));
  // 대체 글꼴 목록은 원래 글꼴 뒤에만 의미가 있으므로 제외 (단, 첫 글꼴이면 유지)
  fonts = fonts.filter((f, i) => i === 0 || !FALLBACK_FONTS.has(f.toLowerCase()));
  if (fonts.length) s.fontFamily = fonts.length > 1 ? [fonts[0], fonts[1]] : [fonts[0]];
  s.fontSize = Math.round(((parseFloat(cs.fontSize) * 72) / 96) * 2) / 2;
  if (parseInt(cs.fontWeight, 10) >= 600) s.bold = true;
  if (cs.fontStyle === 'italic' || cs.fontStyle === 'oblique') s.italic = true;
  const color = cssColorToHex(cs.color);
  if (color && color !== '#000000') s.color = color;
  // 밑줄/취소선/배경/첨자는 상속되지 않으므로 조상까지 확인
  for (let e = el; e && e !== block.parentElement; e = e.parentElement) {
    const ecs = getComputedStyle(e);
    const deco = ecs.textDecorationLine || '';
    if (deco.includes('underline')) s.underline = true;
    if (deco.includes('line-through')) s.strike = true;
    if (!s.background) {
      const bg = cssColorToHex(ecs.backgroundColor);
      if (bg && e.tagName !== 'TD' && e.tagName !== 'TH' && !BLOCK_TAGS.has(e.tagName)) s.background = bg;
    }
    if (e.tagName === 'SUP' || ecs.verticalAlign === 'super') s.sup = true;
    if (e.tagName === 'SUB' || ecs.verticalAlign === 'sub') s.sub = true;
    if (e === block) break;
  }
  return s;
}

function paraStyle(el) {
  const cs = getComputedStyle(el);
  const fs = parseFloat(cs.fontSize) || 13.33;
  const s = {};
  const align = cs.textAlign === 'start' || cs.textAlign === '-webkit-auto' ? 'left' : cs.textAlign;
  s.align = ['left', 'right', 'center', 'justify'].includes(align) ? align : 'justify';
  let ml = parseFloat(cs.marginLeft) + parseFloat(cs.paddingLeft) || 0;
  const indent = parseFloat(cs.textIndent) || 0;
  if (indent < 0) ml += indent;
  if (ml) s.marginLeft = ml;
  const mr = parseFloat(cs.marginRight) || 0;
  if (mr) s.marginRight = mr;
  if (indent) s.indent = indent;
  const mt = parseFloat(cs.marginTop) || 0;
  const mb = parseFloat(cs.marginBottom) || 0;
  if (mt) s.spaceBefore = mt;
  if (mb) s.spaceAfter = mb;
  if (cs.lineHeight !== 'normal') {
    const lh = parseFloat(cs.lineHeight);
    if (lh) s.lineHeight = Math.round((lh / fs) * 100) / 100;
  }
  return s;
}

function inlineRuns(node, block, runs) {
  for (const n of node.childNodes) {
    if (n.nodeType === 3) {
      const text = n.nodeValue.replace(/​/g, '');
      if (!text) continue;
      const style = runStyle(n.parentElement, block);
      const parts = text.split('\t');
      parts.forEach((t, i) => {
        if (i > 0) runs.push({ type: 'tab' });
        if (t) runs.push({ type: 'text', text: t.replace(/\n/g, ' '), style });
      });
    } else if (n.nodeType === 1) {
      const tag = n.tagName;
      if (tag === 'BR') runs.push({ type: 'br' });
      else if (tag === 'IMG') runs.push({ type: 'image', src: n.src, width: n.width || n.naturalWidth, height: n.height || n.naturalHeight });
      else if (n.classList.contains('hwp-textbox')) runs.push({ type: 'textbox', width: n.offsetWidth, blocks: domToBlocks(n) });
      else if (tag === 'TABLE') continue; // 문단 안의 표는 블록 단계에서 처리
      else inlineRuns(n, block, runs);
    }
  }
  // 문단 끝의 의미 없는 <br> 제거
  if (runs.length && runs[runs.length - 1].type === 'br') runs.pop();
  return runs;
}

function cellBorder(cs, side) {
  const style = cs[`border${side}Style`];
  const width = parseFloat(cs[`border${side}Width`]);
  if (style === 'none' || style === 'hidden' || !width) return 'none';
  return `${width}px ${style} ${cssColorToHex(cs[`border${side}Color`]) || '#000000'}`;
}

function tableBlock(table) {
  const rows = Array.from(table.rows).map((tr) =>
    Array.from(tr.cells).map((td) => {
      const cs = getComputedStyle(td);
      const bg = cssColorToHex(cs.backgroundColor);
      return {
        colSpan: td.colSpan,
        rowSpan: td.rowSpan,
        width: td.offsetWidth,
        height: td.offsetHeight,
        style: {
          borderLeft: cellBorder(cs, 'Left'),
          borderRight: cellBorder(cs, 'Right'),
          borderTop: cellBorder(cs, 'Top'),
          borderBottom: cellBorder(cs, 'Bottom'),
          background: bg && bg !== '#FFFFFF' ? bg : null,
        },
        blocks: domToBlocks(td),
      };
    }),
  );
  return { type: 'table', width: table.offsetWidth, rows };
}

export function domToBlocks(root) {
  const blocks = [];
  let pendingBreak = false;
  let loose = null; // 문단 밖에 놓인 인라인 노드 모음

  const push = (b) => {
    if (pendingBreak) {
      b.pageBreakBefore = true;
      pendingBreak = false;
    }
    blocks.push(b);
  };
  const flushLoose = () => {
    if (!loose) return;
    const runs = [];
    const holder = document.createElement('span');
    root.insertBefore(holder, loose[0]);
    for (const n of loose) holder.appendChild(n);
    inlineRuns(holder, root, runs);
    holder.replaceWith(...holder.childNodes);
    push({ type: 'para', style: paraStyle(root), runs });
    loose = null;
  };

  for (const n of Array.from(root.childNodes)) {
    if (n.nodeType === 1) {
      const tag = n.tagName;
      if (tag === 'HR') {
        flushLoose();
        if (n.classList.contains('page-break')) pendingBreak = true;
        continue;
      }
      if (tag === 'TABLE') {
        flushLoose();
        push(tableBlock(n));
        continue;
      }
      if (tag === 'UL' || tag === 'OL') {
        flushLoose();
        Array.from(n.children).forEach((li, i) => {
          const runs = inlineRuns(li, li, []);
          const prefix = tag === 'UL' ? '• ' : `${i + 1}. `;
          runs.unshift({ type: 'text', text: prefix, style: runStyle(li, li) });
          push({ type: 'para', style: paraStyle(li), runs });
        });
        continue;
      }
      if (BLOCK_TAGS.has(tag) && !n.classList.contains('hwp-textbox')) {
        flushLoose();
        const hasBlockChild = Array.from(n.children).some((c) => BLOCK_TAGS.has(c.tagName) || c.tagName === 'TABLE');
        const hasTextbox = !!n.querySelector('.hwp-textbox');
        if (hasBlockChild && !hasTextbox) {
          const inner = domToBlocks(n);
          if (inner.length && pendingBreak) inner[0].pageBreakBefore = true;
          pendingBreak = false;
          blocks.push(...inner);
        } else {
          push({ type: 'para', style: paraStyle(n), runs: inlineRuns(n, n, []) });
        }
        continue;
      }
    }
    if (n.nodeType === 3 && !n.nodeValue.trim() && !loose) continue;
    (loose = loose || []).push(n);
  }
  flushLoose();
  return blocks;
}

export function editorToDocument(root, page, title) {
  return { title, page, blocks: domToBlocks(root) };
}

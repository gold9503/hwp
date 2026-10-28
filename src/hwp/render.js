// 공통 문서 모델 → 편집기용 HTML
import { escapeHtml, SERIF_FALLBACK, SANS_FALLBACK, isSerifName } from './util.js';

const px = (v) => `${Math.round(v * 100) / 100}px`;
const quote = (f) => (/[\s,]/.test(f) || /[^\x00-\x7f]/.test(f) ? `'${f.replace(/'/g, '')}'` : f);
// 원래 글꼴이 없을 때를 대비해 비슷한 계열의 대체 글꼴을 덧붙인다
export const cssFont = (list) => {
  const serif = isSerifName(list[list.length - 1] || '');
  const fallback = serif ? [...SERIF_FALLBACK, 'serif'] : [...SANS_FALLBACK, 'sans-serif'];
  return [...new Set([...list, ...fallback])].map(quote).join(', ');
};

export function runStyleCss(s = {}) {
  const css = [];
  if (s.fontFamily?.length) css.push(`font-family: ${cssFont(s.fontFamily)}`);
  if (s.fontSize) css.push(`font-size: ${s.fontSize}pt`);
  if (s.bold) css.push('font-weight: bold');
  if (s.italic) css.push('font-style: italic');
  const deco = [s.underline && 'underline', s.strike && 'line-through'].filter(Boolean);
  if (deco.length) css.push(`text-decoration: ${deco.join(' ')}`);
  if (s.color) css.push(`color: ${s.color}`);
  if (s.background) css.push(`background-color: ${s.background}`);
  if (s.letterSpacing) css.push(`letter-spacing: ${s.letterSpacing / 100}em`);
  return css.join('; ');
}

export function paraStyleCss(s = {}) {
  const css = [];
  if (s.align && s.align !== 'justify') css.push(`text-align: ${s.align}`);
  else css.push('text-align: justify');
  let left = s.marginLeft || 0;
  if (s.indent < 0) {
    left += -s.indent;
    css.push(`text-indent: ${px(s.indent)}`);
  } else if (s.indent > 0) css.push(`text-indent: ${px(s.indent)}`);
  if (left) css.push(`margin-left: ${px(left)}`);
  if (s.marginRight) css.push(`margin-right: ${px(s.marginRight)}`);
  if (s.spaceBefore) css.push(`margin-top: ${px(s.spaceBefore)}`);
  if (s.spaceAfter) css.push(`margin-bottom: ${px(s.spaceAfter)}`);
  if (s.lineHeight) css.push(`line-height: ${s.lineHeight}`);
  else if (s.lineHeightPx) css.push(`line-height: ${px(s.lineHeightPx)}`);
  return css.join('; ');
}

function runToHtml(r) {
  switch (r.type) {
    case 'text': {
      let html = escapeHtml(r.text);
      if (r.style?.sup) html = `<sup>${html}</sup>`;
      if (r.style?.sub) html = `<sub>${html}</sub>`;
      const css = runStyleCss(r.style);
      return css ? `<span style="${css}">${html}</span>` : html;
    }
    case 'br':
      return '<br>';
    case 'tab':
      return '\t';
    case 'image': {
      const css = [r.width && `width: ${px(r.width)}`, r.height && `height: ${px(r.height)}`].filter(Boolean).join('; ');
      return `<img src="${r.src}"${css ? ` style="${css}"` : ''}>`;
    }
    case 'textbox': {
      const css = r.width ? `min-width: ${px(r.width)}` : '';
      return `<span class="hwp-textbox" style="${css}">${blocksToHtml(r.blocks, true)}</span>`;
    }
    default:
      return '';
  }
}

function paraToHtml(b, inline) {
  const body = b.runs.map(runToHtml).join('');
  // 끝 줄바꿈이 보이도록 <br> 보강
  const content = body === '' || /<br>$/.test(body) ? body + '<br>' : body;
  const css = paraStyleCss(b.style);
  const tag = inline || b.runs.some((r) => r.type === 'textbox') ? 'div' : 'p';
  const cls = inline ? ' class="hwp-p"' : '';
  return `<${tag}${cls} style="${css}">${content}</${tag}>`;
}

function tableToHtml(t) {
  const rows = t.rows
    .map((row) => {
      const cells = row
        .map((c) => {
          const st = c.style || {};
          const css = [
            c.width && `width: ${px(c.width)}`,
            c.height && `height: ${px(c.height)}`,
            c.padding && `padding: ${c.padding.map(px).join(' ')}`,
            st.borderLeft && `border-left: ${st.borderLeft}`,
            st.borderRight && `border-right: ${st.borderRight}`,
            st.borderTop && `border-top: ${st.borderTop}`,
            st.borderBottom && `border-bottom: ${st.borderBottom}`,
            st.background && `background-color: ${st.background}`,
            `vertical-align: ${c.vAlign === 'top' ? 'top' : c.vAlign === 'bottom' ? 'bottom' : 'middle'}`,
          ]
            .filter(Boolean)
            .join('; ');
          const span = `${c.colSpan > 1 ? ` colspan="${c.colSpan}"` : ''}${c.rowSpan > 1 ? ` rowspan="${c.rowSpan}"` : ''}`;
          const inner = c.blocks.length ? blocksToHtml(c.blocks) : '<p><br></p>';
          return `<td${span} style="${css}">${inner}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  const w = t.width ? ` style="width: ${px(t.width)}"` : '';
  return `<table class="hwp-table"${w}><tbody>${rows}</tbody></table>`;
}

export function blocksToHtml(blocks, inline = false) {
  let html = '';
  for (const b of blocks) {
    if (b.pageBreakBefore && !inline) html += '<hr class="page-break">';
    html += b.type === 'table' ? tableToHtml(b) : paraToHtml(b, inline);
  }
  return html;
}

export function documentToHtml(doc) {
  const html = blocksToHtml(doc.blocks);
  return html.replace(/^<hr class="page-break">/, '') || '<p><br></p>';
}

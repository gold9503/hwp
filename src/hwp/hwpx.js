// HWPX (OWPML, KS X 6101) 문서 파서
// 구조: ZIP 컨테이너 → Contents/content.hpf(목록) / Contents/header.xml(서식) / Contents/sectionN.xml(본문) / BinData/*
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { hwpUnitToPx, uint8ToBase64, mimeFromExt } from './util.js';

const ALIGN = { JUSTIFY: 'justify', LEFT: 'left', RIGHT: 'right', CENTER: 'center', DISTRIBUTE: 'justify', DISTRIBUTE_SPACE: 'justify' };
const BORDER_STYLE = { NONE: 'none', SOLID: 'solid', DASH: 'dashed', DOT: 'dotted', DASH_DOT: 'dashed', DASH_DOT_DOT: 'dotted', LONG_DASH: 'dashed', CIRCLE: 'dotted', DOUBLE_SLIM: 'double', SLIM_THICK: 'double', THICK_SLIM: 'double', SLIM_THICK_SLIM: 'double' };

const local = (n) => (n.localName || n.nodeName || '').replace(/^.*:/, '');
const kids = (n) => Array.from(n.childNodes || []).filter((c) => c.nodeType === 1);
const kid = (n, name) => kids(n).find((c) => local(c) === name);
const attr = (n, name, d = null) => (n && n.getAttribute && n.hasAttribute(name) ? n.getAttribute(name) : d);
const num = (n, name, d = 0) => {
  const v = attr(n, name);
  return v == null || v === '' ? d : Number(v);
};

function findAll(n, name, out = []) {
  for (const c of kids(n)) {
    if (local(c) === name) out.push(c);
    findAll(c, name, out);
  }
  return out;
}
function findFirst(n, name) {
  for (const c of kids(n)) {
    if (local(c) === name) return c;
    const f = findFirst(c, name);
    if (f) return f;
  }
  return null;
}

const parseXml = (text) => new DOMParser({ onError: () => {} }).parseFromString(text, 'text/xml').documentElement;

function parseHeader(root) {
  const fonts = {}; // lang → [face]
  for (const ff of findAll(root, 'fontface')) {
    const lang = attr(ff, 'lang');
    fonts[lang] = [];
    for (const f of kids(ff).filter((c) => local(c) === 'font')) fonts[lang][num(f, 'id')] = attr(f, 'face');
  }

  const borderFills = {};
  for (const bf of findAll(root, 'borderFill')) {
    const side = (name) => {
      const b = kid(bf, name);
      if (!b) return 'none';
      const type = attr(b, 'type', 'NONE');
      if (type === 'NONE') return 'none';
      const mm = parseFloat(attr(b, 'width', '0.12')) || 0.12;
      const px = Math.max(1, Math.round(((mm * 96) / 25.4) * 10) / 10);
      return `${px}px ${BORDER_STYLE[type] || 'solid'} ${attr(b, 'color', '#000000')}`;
    };
    const brush = findFirst(bf, 'winBrush');
    const face = brush ? attr(brush, 'faceColor') : null;
    borderFills[attr(bf, 'id')] = {
      borderLeft: side('leftBorder'),
      borderRight: side('rightBorder'),
      borderTop: side('topBorder'),
      borderBottom: side('bottomBorder'),
      background: face && face !== 'none' && face.toUpperCase() !== '#FFFFFF' ? face : null,
    };
  }

  const charPrs = {};
  for (const cp of findAll(root, 'charPr')) {
    const s = {};
    const fr = kid(cp, 'fontRef');
    if (fr) {
      const latin = fonts.LATIN?.[num(fr, 'latin')];
      const hangul = fonts.HANGUL?.[num(fr, 'hangul')];
      const list = [...new Set([latin, hangul].filter(Boolean))];
      if (list.length) s.fontFamily = list;
    }
    const rel = kid(cp, 'relSz');
    const size = (num(cp, 'height', 1000) / 100) * ((rel ? num(rel, 'hangul', 100) : 100) / 100);
    s.fontSize = Math.round(size * 10) / 10;
    const color = attr(cp, 'textColor');
    if (color && color.toUpperCase() !== '#000000') s.color = color;
    const shade = attr(cp, 'shadeColor');
    if (shade && shade !== 'none' && shade.toUpperCase() !== '#FFFFFF') s.background = shade;
    if (kid(cp, 'bold')) s.bold = true;
    if (kid(cp, 'italic')) s.italic = true;
    const ul = kid(cp, 'underline');
    if (ul && attr(ul, 'type', 'NONE') !== 'NONE') s.underline = true;
    const so = kid(cp, 'strikeout');
    if (so && !['NONE', '3D'].includes(attr(so, 'shape', 'NONE'))) s.strike = true;
    if (kid(cp, 'supscript')) s.sup = true;
    if (kid(cp, 'subscript')) s.sub = true;
    const sp = kid(cp, 'spacing');
    if (sp && num(sp, 'hangul')) s.letterSpacing = num(sp, 'hangul');
    const ra = kid(cp, 'ratio');
    if (ra && num(ra, 'hangul', 100) !== 100) s.scaleX = num(ra, 'hangul', 100);
    charPrs[attr(cp, 'id')] = s;
  }

  const paraPrs = {};
  for (const pp of findAll(root, 'paraPr')) {
    const s = {};
    const al = kid(pp, 'align');
    s.align = ALIGN[attr(al, 'horizontal', 'JUSTIFY')] || 'justify';
    const margin = findFirst(pp, 'margin');
    if (margin) {
      const v = (name) => {
        const m = kid(margin, name);
        return m ? num(m, 'value') : 0;
      };
      if (v('left')) s.marginLeft = hwpUnitToPx(v('left'));
      if (v('right')) s.marginRight = hwpUnitToPx(v('right'));
      if (v('intent')) s.indent = hwpUnitToPx(v('intent'));
      if (v('prev')) s.spaceBefore = hwpUnitToPx(v('prev'));
      if (v('next')) s.spaceAfter = hwpUnitToPx(v('next'));
    }
    const ls = findFirst(pp, 'lineSpacing');
    if (ls) {
      const type = attr(ls, 'type', 'PERCENT');
      if (type === 'PERCENT') s.lineHeight = num(ls, 'value', 160) / 100;
      else if (type === 'FIXED') s.lineHeightPx = hwpUnitToPx(num(ls, 'value'));
    }
    const br = kid(pp, 'breakSetting');
    if (br && attr(br, 'pageBreakBefore') === '1') s.pageBreakBefore = true;
    paraPrs[attr(pp, 'id')] = s;
  }
  return { fonts, borderFills, charPrs, paraPrs };
}

class SectionParser {
  constructor(head, images) {
    this.head = head;
    this.images = images;
    this.page = null;
  }

  parseParagraphs(parent) {
    const blocks = [];
    for (const p of kids(parent)) if (local(p) === 'p') blocks.push(...this.parseParagraph(p));
    return blocks;
  }

  parseParagraph(p) {
    const style = { ...(this.head.paraPrs[attr(p, 'paraPrIDRef')] || {}) };
    const para = { type: 'para', style, runs: [] };
    if (attr(p, 'pageBreak') === '1' || style.pageBreakBefore) para.pageBreakBefore = true;
    delete style.pageBreakBefore;
    const out = [];
    let cur = para;

    for (const run of kids(p)) {
      if (local(run) !== 'run') continue;
      const cs = this.head.charPrs[attr(run, 'charPrIDRef')] || {};
      for (const el of kids(run)) {
        const name = local(el);
        if (name === 't') this.parseText(el, cs, cur.runs);
        else if (name === 'secPr') this.parseSecPr(el);
        else if (name === 'tbl') {
          const table = this.parseTable(el);
          // 표만 담긴 문단은 빈 줄을 만들지 않도록 생략
          if (cur.runs.length) out.push(cur);
          else if (cur.pageBreakBefore) table.pageBreakBefore = true;
          out.push(table);
          cur = { type: 'para', style: { ...style, indent: 0 }, runs: [], continuation: true };
        } else if (name === 'pic') {
          const img = this.parsePic(el);
          if (img) cur.runs.push(img);
        } else if (name === 'equation') {
          const script = findFirst(el, 'script');
          if (script) cur.runs.push({ type: 'text', text: script.textContent, style: { italic: true, fontFamily: ['Times New Roman'] } });
        } else if (['rect', 'ellipse', 'polygon', 'container', 'curve', 'arc'].includes(name)) {
          const pics = findAll(el, 'pic').map((x) => this.parsePic(x)).filter(Boolean);
          const dt = findAll(el, 'subList');
          const blocks = [];
          for (const pic of pics) blocks.push({ type: 'para', style: {}, runs: [pic] });
          for (const sl of dt) blocks.push(...this.parseParagraphs(sl));
          if (blocks.length) {
            const sz = kid(el, 'sz') || kid(el, 'curSz');
            cur.runs.push({ type: 'textbox', blocks, width: sz ? hwpUnitToPx(num(sz, 'width')) : undefined });
          }
        }
      }
    }
    out.push(cur);
    return out.filter((b) => b.type !== 'para' || !b.continuation || b.runs.length);
  }

  parseText(t, cs, runs) {
    let buf = '';
    const flush = () => {
      if (buf) runs.push({ type: 'text', text: buf, style: cs });
      buf = '';
    };
    for (const n of Array.from(t.childNodes || [])) {
      if (n.nodeType === 3 || n.nodeType === 4) buf += n.nodeValue;
      else if (n.nodeType === 1) {
        const name = local(n);
        if (name === 'tab') { flush(); runs.push({ type: 'tab' }); }
        else if (name === 'lineBreak') { flush(); runs.push({ type: 'br' }); }
        else if (name === 'nbSpace' || name === 'fwSpace') buf += ' ';
        else if (name === 'hyphen') buf += '-';
        else buf += n.textContent || '';
      }
    }
    flush();
  }

  parseSecPr(sec) {
    const pp = kid(sec, 'pagePr');
    if (!pp || this.page) return;
    const m = kid(pp, 'margin');
    let w = num(pp, 'width', 59528), h = num(pp, 'height', 84186);
    // landscape="NARROWLY" 이면 가로 방향
    if (attr(pp, 'landscape') === 'NARROWLY') [w, h] = [h, w];
    this.page = {
      width: hwpUnitToPx(w),
      height: hwpUnitToPx(h),
      marginLeft: hwpUnitToPx(num(m, 'left', 8504)),
      marginRight: hwpUnitToPx(num(m, 'right', 8504)),
      marginTop: hwpUnitToPx(num(m, 'top', 5668) + num(m, 'header', 4252)),
      marginBottom: hwpUnitToPx(num(m, 'bottom', 4252) + num(m, 'footer', 4252)),
    };
  }

  parsePic(pic) {
    const img = findFirst(pic, 'img');
    if (!img) return null;
    const src = this.images.get(attr(img, 'binaryItemIDRef'));
    if (!src) return null;
    const sz = kid(pic, 'sz');
    const cur = kid(pic, 'curSz');
    let w = sz ? num(sz, 'width') : 0, h = sz ? num(sz, 'height') : 0;
    if ((!w || !h) && cur) { w = num(cur, 'width'); h = num(cur, 'height'); }
    return { type: 'image', src, width: w ? hwpUnitToPx(w) : undefined, height: h ? hwpUnitToPx(h) : undefined };
  }

  parseTable(tbl) {
    const sz = kid(tbl, 'sz');
    const rows = [];
    for (const tr of kids(tbl).filter((c) => local(c) === 'tr')) {
      const row = [];
      for (const tc of kids(tr).filter((c) => local(c) === 'tc')) {
        const addr = kid(tc, 'cellAddr');
        const span = kid(tc, 'cellSpan');
        const csz = kid(tc, 'cellSz');
        const cm = kid(tc, 'cellMargin');
        const sub = kid(tc, 'subList');
        row.push({
          row: num(addr, 'rowAddr'),
          col: num(addr, 'colAddr'),
          colSpan: num(span, 'colSpan', 1) || 1,
          rowSpan: num(span, 'rowSpan', 1) || 1,
          width: hwpUnitToPx(num(csz, 'width')),
          height: hwpUnitToPx(num(csz, 'height')),
          padding: ['top', 'right', 'bottom', 'left'].map((k) => hwpUnitToPx(num(cm, k, 141))),
          style: this.head.borderFills[attr(tc, 'borderFillIDRef')] || {},
          vAlign: sub ? (attr(sub, 'vertAlign', 'CENTER') || 'CENTER').toLowerCase() : 'middle',
          blocks: sub ? this.parseParagraphs(sub) : [],
        });
      }
      rows.push(row);
    }
    return { type: 'table', width: sz ? hwpUnitToPx(num(sz, 'width')) : undefined, cols: num(tbl, 'colCnt'), rows };
  }
}

export function isZip(u8) {
  return u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4b;
}

export async function parseHwpx(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const zip = await JSZip.loadAsync(u8);
  const read = async (path) => {
    const f = zip.file(path);
    return f ? f.async('string') : null;
  };

  // 목록(content.hpf)에서 섹션 순서와 이미지 경로 확인
  const hpfPath = Object.keys(zip.files).find((p) => /content\.hpf$/i.test(p)) || 'Contents/content.hpf';
  const hpfText = await read(hpfPath);
  const items = new Map();
  const sectionPaths = [];
  if (hpfText) {
    const hpf = parseXml(hpfText);
    for (const it of findAll(hpf, 'item')) items.set(attr(it, 'id'), { href: attr(it, 'href'), type: attr(it, 'media-type') });
    for (const ref of findAll(hpf, 'itemref')) {
      const it = items.get(attr(ref, 'idref'));
      if (it && /section\d+\.xml$/i.test(it.href)) sectionPaths.push(it.href);
    }
  }
  if (!sectionPaths.length) {
    sectionPaths.push(...Object.keys(zip.files).filter((p) => /Contents\/section\d+\.xml$/i.test(p)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/))));
  }
  if (!sectionPaths.length) throw new Error('HWPX 본문(section)을 찾을 수 없습니다.');

  const images = new Map();
  for (const [id, it] of items) {
    if (!it.href || !/^BinData\//i.test(it.href)) continue;
    const f = zip.file(it.href);
    if (!f) continue;
    const ext = it.href.split('.').pop();
    const mime = mimeFromExt(ext);
    if (!mime) continue;
    const data = await f.async('uint8array');
    images.set(id, `data:${mime};base64,${uint8ToBase64(data)}`);
  }

  const headerText = await read('Contents/header.xml');
  const head = headerText ? parseHeader(parseXml(headerText)) : { fonts: {}, borderFills: {}, charPrs: {}, paraPrs: {} };

  let page = null;
  const blocks = [];
  for (let i = 0; i < sectionPaths.length; i++) {
    const text = await read(sectionPaths[i]);
    if (!text) continue;
    const sp = new SectionParser(head, images);
    const secBlocks = sp.parseParagraphs(parseXml(text));
    if (i > 0 && secBlocks[0]) secBlocks[0].pageBreakBefore = true;
    blocks.push(...secBlocks);
    page = page || sp.page;
  }

  let title = null;
  if (hpfText) {
    const t = findFirst(parseXml(hpfText), 'title');
    title = t ? t.textContent : null;
  }
  return { format: 'hwpx', version: null, title, warnings: [], page, blocks };
}

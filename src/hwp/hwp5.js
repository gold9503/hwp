// HWP 5.0 바이너리 문서 파서
// 구조: CFB(Compound File) 컨테이너 → FileHeader / DocInfo / BodyText/SectionN / BinData
// 각 스트림은 (압축 시) raw deflate 로 압축된 "레코드" 열이다.
import CFB from 'cfb';
import { inflateRaw } from 'pako';
import { hwpUnitToPx, colorRefToCss, uint8ToBase64, mimeFromExt } from './util.js';

const TAG_BEGIN = 0x10;
export const TAG = {
  DOCUMENT_PROPERTIES: TAG_BEGIN,
  ID_MAPPINGS: TAG_BEGIN + 1,
  BIN_DATA: TAG_BEGIN + 2,
  FACE_NAME: TAG_BEGIN + 3,
  BORDER_FILL: TAG_BEGIN + 4,
  CHAR_SHAPE: TAG_BEGIN + 5,
  TAB_DEF: TAG_BEGIN + 6,
  NUMBERING: TAG_BEGIN + 7,
  BULLET: TAG_BEGIN + 8,
  PARA_SHAPE: TAG_BEGIN + 9,
  STYLE: TAG_BEGIN + 10,
  PARA_HEADER: TAG_BEGIN + 50,
  PARA_TEXT: TAG_BEGIN + 51,
  PARA_CHAR_SHAPE: TAG_BEGIN + 52,
  PARA_LINE_SEG: TAG_BEGIN + 53,
  CTRL_HEADER: TAG_BEGIN + 55,
  LIST_HEADER: TAG_BEGIN + 56,
  PAGE_DEF: TAG_BEGIN + 57,
  SHAPE_COMPONENT: TAG_BEGIN + 60,
  TABLE: TAG_BEGIN + 61,
  SHAPE_COMPONENT_PICTURE: TAG_BEGIN + 69,
  EQEDIT: TAG_BEGIN + 72,
};

// 문자 컨트롤 분류 (HWP 5.0 스펙 "제어 문자")
const EXTENDED_CTRL = new Set([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23]);
const INLINE_CTRL = new Set([4, 5, 6, 7, 8, 9, 19, 20]);

// 테두리 굵기 인덱스 → mm
const BORDER_WIDTH_MM = [0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0];
const BORDER_STYLE = { 0: 'none', 1: 'solid', 2: 'dashed', 3: 'dotted', 4: 'dashed', 5: 'dotted', 6: 'dashed', 7: 'dotted', 8: 'double', 9: 'double', 10: 'double', 11: 'double' };

const ALIGN = ['justify', 'left', 'right', 'center', 'justify', 'justify'];

class Reader {
  constructor(u8) {
    this.u8 = u8;
    this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    this.p = 0;
  }
  get remaining() { return this.u8.length - this.p; }
  u8v() { return this.p + 1 <= this.u8.length ? this.dv.getUint8(this.p++) : 0; }
  i8() { const v = this.p + 1 <= this.u8.length ? this.dv.getInt8(this.p) : 0; this.p += 1; return v; }
  u16() { const v = this.p + 2 <= this.u8.length ? this.dv.getUint16(this.p, true) : 0; this.p += 2; return v; }
  i16() { const v = this.p + 2 <= this.u8.length ? this.dv.getInt16(this.p, true) : 0; this.p += 2; return v; }
  u32() { const v = this.p + 4 <= this.u8.length ? this.dv.getUint32(this.p, true) : 0; this.p += 4; return v; }
  i32() { const v = this.p + 4 <= this.u8.length ? this.dv.getInt32(this.p, true) : 0; this.p += 4; return v; }
  skip(n) { this.p += n; return this; }
  wstr(len) {
    let s = '';
    for (let i = 0; i < len && this.p + 2 <= this.u8.length; i++) s += String.fromCharCode(this.u16());
    return s;
  }
}

export function readRecords(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const records = [];
  let p = 0;
  while (p + 4 <= u8.length) {
    const h = dv.getUint32(p, true);
    p += 4;
    const tag = h & 0x3ff;
    const level = (h >>> 10) & 0x3ff;
    let size = (h >>> 20) & 0xfff;
    if (size === 0xfff) {
      if (p + 4 > u8.length) break;
      size = dv.getUint32(p, true);
      p += 4;
    }
    records.push({ tag, level, data: u8.subarray(p, Math.min(p + size, u8.length)), children: [] });
    p += size;
  }
  return records;
}

// 레벨 정보를 이용해 레코드 트리 구성
export function buildTree(records) {
  const root = { tag: -1, level: -1, children: [] };
  const stack = [root];
  for (const rec of records) {
    while (stack.length > 1 && stack[stack.length - 1].level >= rec.level) stack.pop();
    stack[stack.length - 1].children.push(rec);
    stack.push(rec);
  }
  return root.children;
}

function ctrlIdString(id) {
  return String.fromCharCode((id >>> 24) & 0xff, (id >>> 16) & 0xff, (id >>> 8) & 0xff, id & 0xff);
}

function getStream(cfb, path) {
  const entry = CFB.find(cfb, '/' + path);
  if (!entry || !entry.content) return null;
  const c = entry.content;
  return c instanceof Uint8Array ? c : new Uint8Array(c);
}

function decompress(u8, compressed) {
  if (!compressed) return u8;
  try {
    return inflateRaw(u8);
  } catch {
    return u8;
  }
}

// ---------------- DocInfo ----------------

function parseDocInfo(records) {
  const info = {
    idMappings: [],
    binData: [],
    faceNames: [],
    borderFills: [],
    charShapes: [],
    paraShapes: [],
  };
  for (const rec of records) {
    const r = new Reader(rec.data);
    switch (rec.tag) {
      case TAG.ID_MAPPINGS: {
        while (r.remaining >= 4) info.idMappings.push(r.i32());
        break;
      }
      case TAG.BIN_DATA: {
        const prop = r.u16();
        const type = prop & 0x0f;
        const item = { type, compress: (prop >> 4) & 0x3 };
        if (type === 0) {
          item.absPath = r.wstr(r.u16());
          item.relPath = r.wstr(r.u16());
        } else {
          item.id = r.u16();
          if (type === 1) item.ext = r.wstr(r.u16());
        }
        info.binData.push(item);
        break;
      }
      case TAG.FACE_NAME: {
        r.u8v();
        info.faceNames.push(r.wstr(r.u16()));
        break;
      }
      case TAG.BORDER_FILL: {
        r.u16();
        const sides = [];
        for (let i = 0; i < 4; i++) {
          const type = r.u8v();
          const width = r.u8v();
          const color = r.u32();
          sides.push({ type, width, color });
        }
        r.skip(6); // 대각선
        const fillType = r.u32();
        let background = null;
        if (fillType & 1) {
          const bg = r.u32();
          background = colorRefToCss(bg);
        }
        info.borderFills.push({ sides, background });
        break;
      }
      case TAG.CHAR_SHAPE: {
        const faceIds = [];
        for (let i = 0; i < 7; i++) faceIds.push(r.u16());
        const ratios = []; for (let i = 0; i < 7; i++) ratios.push(r.u8v());
        const spacings = []; for (let i = 0; i < 7; i++) spacings.push(r.i8());
        const relSizes = []; for (let i = 0; i < 7; i++) relSizes.push(r.u8v());
        r.skip(7); // 글자 위치
        const baseSize = r.i32();
        const prop = r.u32();
        r.skip(2); // 그림자 간격
        const textColor = r.u32();
        const underlineColor = r.u32();
        const shadeColor = r.u32();
        const strikeShape = (prop >>> 26) & 0x0f;
        info.charShapes.push({
          faceIds,
          ratio: ratios[0],
          spacing: spacings[0],
          relSize: relSizes[0] || 100,
          size: baseSize / 100,
          italic: !!(prop & 1),
          bold: !!(prop & 2),
          underline: ((prop >> 2) & 3) === 1 ? 'underline' : ((prop >> 2) & 3) === 3 ? 'overline' : null,
          strike: ((prop >>> 18) & 7) !== 0 && strikeShape <= 12,
          superscript: !!(prop & (1 << 15)),
          subscript: !!(prop & (1 << 16)),
          color: colorRefToCss(textColor),
          underlineColor: colorRefToCss(underlineColor),
          shade: shadeColor === 0xffffffff ? null : colorRefToCss(shadeColor),
        });
        break;
      }
      case TAG.PARA_SHAPE: {
        const prop1 = r.u32();
        const marginLeft = r.i32();
        const marginRight = r.i32();
        const indent = r.i32();
        const spaceBefore = r.i32();
        const spaceAfter = r.i32();
        const lineSpacing = r.i32();
        r.u16(); // tab def
        r.u16(); // numbering / bullet
        const borderFillId = r.u16();
        r.skip(8);
        r.u32(); // prop2
        let lineSpacingType = prop1 & 3;
        let lineSpacing2 = lineSpacing;
        if (r.remaining >= 8) {
          const prop3 = r.u32();
          const ls = r.u32();
          lineSpacingType = prop3 & 0x1f;
          if (ls) lineSpacing2 = ls;
        }
        info.paraShapes.push({
          align: ALIGN[(prop1 >> 2) & 7] || 'justify',
          marginLeft,
          marginRight,
          indent,
          spaceBefore,
          spaceAfter,
          lineSpacingType,
          lineSpacing: lineSpacing2,
          borderFillId,
        });
        break;
      }
      default:
        break;
    }
  }
  // 언어별 글꼴 목록 시작 위치 (ID_MAPPINGS: [binData, 한글, 영어, 한자, 일어, 기타, 기호, 사용자, ...])
  const counts = info.idMappings.slice(1, 8);
  info.faceOffsets = [];
  let acc = 0;
  for (let i = 0; i < 7; i++) {
    info.faceOffsets.push(acc);
    acc += counts[i] || 0;
  }
  return info;
}

function charShapeToStyle(info, id) {
  const cs = info.charShapes[id];
  if (!cs) return {};
  const style = {};
  const hangul = info.faceNames[(info.faceOffsets[0] || 0) + cs.faceIds[0]];
  const latin = info.faceNames[(info.faceOffsets[1] || 0) + cs.faceIds[1]];
  const fonts = [latin, hangul].filter(Boolean);
  if (fonts.length) style.fontFamily = [...new Set(fonts)];
  const size = cs.size * (cs.relSize / 100);
  if (size > 0) style.fontSize = Math.round(size * 10) / 10;
  if (cs.bold) style.bold = true;
  if (cs.italic) style.italic = true;
  if (cs.underline) style.underline = true;
  if (cs.strike) style.strike = true;
  if (cs.superscript) style.sup = true;
  if (cs.subscript) style.sub = true;
  if (cs.color && cs.color !== '#000000') style.color = cs.color;
  if (cs.shade && cs.shade !== '#ffffff') style.background = cs.shade;
  if (cs.spacing) style.letterSpacing = cs.spacing; // %
  if (cs.ratio && cs.ratio !== 100) style.scaleX = cs.ratio;
  return style;
}

function paraShapeToStyle(info, id) {
  const ps = info.paraShapes[id];
  if (!ps) return {};
  const s = { align: ps.align };
  // 문단 여백 값은 HWPUNIT 의 2배로 저장된다.
  if (ps.marginLeft) s.marginLeft = hwpUnitToPx(ps.marginLeft / 2);
  if (ps.marginRight) s.marginRight = hwpUnitToPx(ps.marginRight / 2);
  if (ps.indent) s.indent = hwpUnitToPx(ps.indent / 2);
  if (ps.spaceBefore) s.spaceBefore = hwpUnitToPx(ps.spaceBefore / 2);
  if (ps.spaceAfter) s.spaceAfter = hwpUnitToPx(ps.spaceAfter / 2);
  if (ps.lineSpacingType === 0 && ps.lineSpacing > 0) s.lineHeight = ps.lineSpacing / 100;
  else if (ps.lineSpacingType === 1 && ps.lineSpacing > 0) s.lineHeightPx = hwpUnitToPx(ps.lineSpacing / 2);
  return s;
}

function borderFillToCell(info, id) {
  const bf = info.borderFills[id - 1];
  if (!bf) return {};
  const css = (side) => {
    if (side.type === 0) return 'none';
    const mm = BORDER_WIDTH_MM[side.width] ?? 0.12;
    const px = Math.max(1, Math.round((mm * 96) / 25.4 * 10) / 10);
    return `${px}px ${BORDER_STYLE[side.type] || 'solid'} ${colorRefToCss(side.color)}`;
  };
  return {
    borderLeft: css(bf.sides[0]),
    borderRight: css(bf.sides[1]),
    borderTop: css(bf.sides[2]),
    borderBottom: css(bf.sides[3]),
    background: bf.background && bf.background !== '#ffffff' ? bf.background : null,
  };
}

// ---------------- BodyText ----------------

class SectionParser {
  constructor(info, bins) {
    this.info = info;
    this.bins = bins;
    this.page = null;
  }

  parseParagraphs(nodes) {
    const blocks = [];
    for (const n of nodes) if (n.tag === TAG.PARA_HEADER) blocks.push(...this.parseParagraph(n));
    return blocks;
  }

  parseParagraph(node) {
    const hr = new Reader(node.data);
    hr.u32(); // nChars
    hr.u32(); // control mask
    const paraShapeId = hr.u16();
    hr.u8v(); // style
    const breakType = hr.u8v();

    let textRec = null;
    let charShapeRec = null;
    const ctrls = [];
    for (const c of node.children) {
      if (c.tag === TAG.PARA_TEXT) textRec = c;
      else if (c.tag === TAG.PARA_CHAR_SHAPE) charShapeRec = c;
      else if (c.tag === TAG.CTRL_HEADER) ctrls.push(c);
    }

    // 글자 모양 위치 테이블
    const shapes = [];
    if (charShapeRec) {
      const r = new Reader(charShapeRec.data);
      while (r.remaining >= 8) shapes.push([r.u32(), r.u32()]);
    }
    if (!shapes.length) shapes.push([0, 0]);
    const shapeAt = (pos) => {
      let id = shapes[0][1];
      for (const [p, s] of shapes) {
        if (p <= pos) id = s;
        else break;
      }
      return id;
    };

    const para = {
      type: 'para',
      style: paraShapeToStyle(this.info, paraShapeId),
      runs: [],
    };
    if (breakType & 0x04 || breakType & 0x01) para.pageBreakBefore = true;

    const out = []; // 문단 + 표가 섞인 블록 목록
    let cur = para;
    let buf = '';
    let bufShape = -1;
    const flush = () => {
      if (buf) cur.runs.push({ type: 'text', text: buf, style: charShapeToStyle(this.info, bufShape) });
      buf = '';
    };
    const pushText = (s, pos) => {
      const sh = shapeAt(pos);
      if (sh !== bufShape) {
        flush();
        bufShape = sh;
      }
      buf += s;
    };

    let ctrlIdx = 0;
    if (textRec) {
      const u = textRec.data;
      const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
      const n = Math.floor(u.length / 2);
      let i = 0;
      while (i < n) {
        const c = dv.getUint16(i * 2, true);
        if (c >= 32) {
          pushText(String.fromCharCode(c), i);
          i += 1;
        } else if (EXTENDED_CTRL.has(c)) {
          const ctrl = ctrls[ctrlIdx++];
          if (ctrl) {
            const obj = this.parseControl(ctrl);
            if (obj) {
              flush();
              if (obj.type === 'table') {
                // 표만 담긴 문단은 빈 줄을 만들지 않도록 생략
                if (cur.runs.length || buf) out.push(cur);
                else if (cur.pageBreakBefore) obj.pageBreakBefore = true;
                out.push(obj);
                cur = { type: 'para', style: { ...para.style, indent: 0 }, runs: [], continuation: true };
              } else if (obj.type === 'blocks') {
                cur.runs.push({ type: 'textbox', blocks: obj.blocks, width: obj.width });
              } else {
                cur.runs.push(obj);
              }
            }
          }
          i += 8;
        } else if (INLINE_CTRL.has(c)) {
          if (c === 9) {
            flush();
            cur.runs.push({ type: 'tab' });
          }
          i += 8;
        } else {
          if (c === 10) {
            flush();
            cur.runs.push({ type: 'br' });
          } else if (c === 24) pushText('-', i);
          else if (c === 30 || c === 31) pushText(' ', i);
          i += 1;
        }
      }
    }
    flush();
    // 텍스트 없이 붙은 나머지 컨트롤(구역 정의 등) 처리
    for (; ctrlIdx < ctrls.length; ctrlIdx++) this.parseControl(ctrls[ctrlIdx]);
    out.push(cur);
    // 표 사이에 생긴 빈 이어짐 문단은 제거
    return out.filter((b) => b.type !== 'para' || !b.continuation || b.runs.length);
  }

  parseControl(ctrl) {
    const r = new Reader(ctrl.data);
    const id = ctrlIdString(r.u32());
    switch (id) {
      case 'secd': {
        const pd = ctrl.children.find((c) => c.tag === TAG.PAGE_DEF);
        if (pd && !this.page) {
          const p = new Reader(pd.data);
          const width = p.u32(), height = p.u32();
          const ml = p.u32(), mr = p.u32(), mt = p.u32(), mb = p.u32(), mh = p.u32(), mf = p.u32();
          p.u32(); // 제본
          const prop = p.u32();
          const landscape = !!(prop & 1);
          this.page = {
            width: hwpUnitToPx(landscape ? height : width),
            height: hwpUnitToPx(landscape ? width : height),
            marginLeft: hwpUnitToPx(ml),
            marginRight: hwpUnitToPx(mr),
            marginTop: hwpUnitToPx(mt + mh),
            marginBottom: hwpUnitToPx(mb + mf),
          };
        }
        return null;
      }
      case 'tbl ':
        return this.parseTable(ctrl);
      case 'gso ':
        return this.parseShape(ctrl);
      case 'eqed': {
        const eq = findDeep(ctrl, (n) => n.tag === TAG.EQEDIT);
        if (!eq) return null;
        const er = new Reader(eq.data);
        er.u32();
        const script = er.wstr(er.u16());
        return { type: 'text', text: script, style: { italic: true, fontFamily: ['Times New Roman'] } };
      }
      default:
        return null;
    }
  }

  // 컨트롤 자식 중 LIST_HEADER 뒤의 문단들을 묶어 반환
  collectLists(children) {
    const lists = [];
    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      if (c.tag !== TAG.LIST_HEADER) continue;
      const r = new Reader(c.data);
      const count = r.u16();
      const paras = [];
      let j = i + 1;
      while (j < children.length && paras.length < count && children[j].tag === TAG.PARA_HEADER) paras.push(children[j++]);
      lists.push({ header: c, paras });
      i = j - 1;
    }
    return lists;
  }

  parseTable(ctrl) {
    const cr = new Reader(ctrl.data);
    cr.skip(16);
    const width = cr.u32();
    const tableRec = ctrl.children.find((c) => c.tag === TAG.TABLE);
    let rows = 0, cols = 0;
    if (tableRec) {
      const tr = new Reader(tableRec.data);
      tr.u32();
      rows = tr.u16();
      cols = tr.u16();
    }
    const cells = [];
    for (const { header, paras } of this.collectLists(ctrl.children)) {
      const r = new Reader(header.data);
      r.skip(8);
      const col = r.u16(), row = r.u16(), colSpan = r.u16() || 1, rowSpan = r.u16() || 1;
      const w = r.u32(), h = r.u32();
      const ml = r.u16(), mr = r.u16(), mt = r.u16(), mb = r.u16();
      const borderFillId = r.u16();
      cells.push({
        row, col, colSpan, rowSpan,
        width: hwpUnitToPx(w),
        height: hwpUnitToPx(h),
        padding: [mt, mr, mb, ml].map((v) => hwpUnitToPx(v)),
        style: borderFillToCell(this.info, borderFillId),
        blocks: this.parseParagraphs(paras),
      });
    }
    rows = Math.max(rows, ...cells.map((c) => c.row + 1), 0);
    const grid = Array.from({ length: rows }, () => []);
    for (const c of cells) if (grid[c.row]) grid[c.row].push(c);
    for (const r of grid) r.sort((a, b) => a.col - b.col);
    return { type: 'table', width: hwpUnitToPx(width), cols, rows: grid };
  }

  parseShape(ctrl) {
    const cr = new Reader(ctrl.data);
    cr.skip(16);
    const width = hwpUnitToPx(cr.u32());
    const height = hwpUnitToPx(cr.u32());
    const pics = [];
    walk(ctrl, (n) => {
      if (n.tag === TAG.SHAPE_COMPONENT_PICTURE) pics.push(n);
    });
    if (pics.length) {
      const images = pics.map((pic) => {
        const r = new Reader(pic.data);
        r.skip(71);
        const binId = r.u16();
        return this.bins.get(binId);
      }).filter(Boolean);
      if (images.length === 1) return { type: 'image', src: images[0], width, height };
      if (images.length > 1) return { type: 'blocks', width, blocks: images.map((src) => ({ type: 'para', style: {}, runs: [{ type: 'image', src }] })) };
      return null;
    }
    // 글상자: SHAPE_COMPONENT 아래 LIST_HEADER + 문단
    const blocks = [];
    walk(ctrl, (n) => {
      if (n.children && n.children.some((c) => c.tag === TAG.LIST_HEADER)) {
        for (const { paras } of this.collectLists(n.children)) blocks.push(...this.parseParagraphs(paras));
        return false;
      }
      return true;
    });
    if (blocks.length) return { type: 'blocks', width, blocks };
    return null;
  }
}

function walk(node, fn) {
  for (const c of node.children || []) {
    if (fn(c) === false) continue;
    walk(c, fn);
  }
}

function findDeep(node, pred) {
  let found = null;
  walk(node, (n) => {
    if (found) return false;
    if (pred(n)) { found = n; return false; }
    return true;
  });
  return found;
}

// ---------------- 진입점 ----------------

export function isHwp5(u8) {
  // CFB 시그니처
  return u8.length > 8 && u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0;
}

export function parseHwp5(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!isHwp5(u8)) {
    const head = new TextDecoder('latin1').decode(u8.subarray(0, 32));
    if (head.startsWith('HWP Document File V3')) throw new Error('HWP 3.0 이하 형식은 지원하지 않습니다. 한글에서 HWP 5.0 이상으로 저장 후 열어주세요.');
    throw new Error('HWP 5.0 문서가 아닙니다.');
  }
  const cfb = CFB.read(u8, { type: 'array' });
  const header = getStream(cfb, 'FileHeader');
  if (!header) throw new Error('FileHeader 스트림이 없습니다.');
  const sig = new TextDecoder('latin1').decode(header.subarray(0, 17));
  if (sig !== 'HWP Document File') throw new Error('HWP 서명이 올바르지 않습니다.');
  const hdv = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const ver = hdv.getUint32(32, true);
  const version = `${(ver >>> 24) & 0xff}.${(ver >>> 16) & 0xff}.${(ver >>> 8) & 0xff}.${ver & 0xff}`;
  const props = hdv.getUint32(36, true);
  const compressed = !!(props & 1);
  const encrypted = !!(props & 2);
  const distribution = !!(props & 4);

  const warnings = [];
  const docInfoRaw = getStream(cfb, 'DocInfo');
  const info = parseDocInfo(docInfoRaw ? readRecords(decompress(docInfoRaw, compressed)) : []);

  // 이미지 (BinData)
  const bins = new Map();
  info.binData.forEach((b, idx) => {
    if (b.type === 0) return;
    const ext = (b.ext || 'bin').toLowerCase();
    const name = `BIN${b.id.toString(16).toUpperCase().padStart(4, '0')}.${ext}`;
    let raw = getStream(cfb, `BinData/${name}`) || getStream(cfb, `BinData/${name.toLowerCase()}`);
    if (!raw) return;
    const comp = b.compress === 0 ? compressed : b.compress === 1;
    raw = decompress(raw, comp);
    const mime = mimeFromExt(ext);
    if (!mime) return;
    bins.set(idx + 1, `data:${mime};base64,${uint8ToBase64(raw)}`);
  });

  const sections = [];
  const fallback = () => {
    const prv = getStream(cfb, 'PrvText');
    const text = prv ? new TextDecoder('utf-16le').decode(prv) : '';
    return {
      page: null,
      blocks: text.split(/\r?\n/).map((line) => ({ type: 'para', style: {}, runs: line ? [{ type: 'text', text: line, style: {} }] : [] })),
    };
  };

  if (encrypted) {
    warnings.push('암호가 설정된 문서입니다. 미리보기 텍스트만 표시합니다.');
    sections.push(fallback());
  } else if (distribution) {
    warnings.push('배포용 문서입니다. 미리보기 텍스트만 표시합니다.');
    sections.push(fallback());
  } else {
    for (let i = 0; ; i++) {
      const raw = getStream(cfb, `BodyText/Section${i}`);
      if (!raw) break;
      const tree = buildTree(readRecords(decompress(raw, compressed)));
      const sp = new SectionParser(info, bins);
      const blocks = sp.parseParagraphs(tree);
      sections.push({ page: sp.page, blocks });
    }
    if (!sections.length) {
      warnings.push('본문을 찾을 수 없어 미리보기 텍스트를 표시합니다.');
      sections.push(fallback());
    }
  }

  return {
    format: 'hwp',
    version,
    warnings,
    page: sections.find((s) => s.page)?.page || null,
    blocks: sections.flatMap((s, i) => {
      if (i > 0 && s.blocks[0]) s.blocks[0].pageBreakBefore = true;
      return s.blocks;
    }),
  };
}

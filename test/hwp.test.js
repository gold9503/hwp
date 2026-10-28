// 파서/저장 단위 테스트: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import CFB from 'cfb';
import { parseDocument } from '../src/hwp/index.js';
import { documentToHwpx, documentToText } from '../src/hwp/hwpx-writer.js';
import { documentToHtml } from '../src/hwp/render.js';
import { TAG } from '../src/hwp/hwp5.js';

// ---- 최소 HWP 5.0 문서 합성 ----
function record(tag, level, data) {
  const size = data.length;
  const head = Buffer.alloc(size >= 0xfff ? 8 : 4);
  head.writeUInt32LE((tag & 0x3ff) | ((level & 0x3ff) << 10) | (Math.min(size, 0xfff) << 20), 0);
  if (size >= 0xfff) head.writeUInt32LE(size, 4);
  return Buffer.concat([head, data]);
}
const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };
const i32 = (v) => { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; };
const wstr = (s) => Buffer.concat([u16(s.length), Buffer.from(s, 'utf16le')]);

function charShape({ size = 1000, bold = false, color = 0 }) {
  return Buffer.concat([
    Buffer.alloc(14), // 글꼴 id x7
    Buffer.from([100, 100, 100, 100, 100, 100, 100]), // 장평
    Buffer.alloc(7), // 자간
    Buffer.from([100, 100, 100, 100, 100, 100, 100]), // 상대 크기
    Buffer.alloc(7), // 위치
    i32(size), u32(bold ? 2 : 0), Buffer.alloc(2), u32(color), u32(0), u32(0xffffffff), u32(0),
  ]);
}

function paraShape(align) {
  return Buffer.concat([u32(align << 2), i32(0), i32(0), i32(0), i32(0), i32(0), i32(160), Buffer.alloc(14), u32(0)]);
}

function makeHwp() {
  const docInfo = Buffer.concat([
    record(TAG.ID_MAPPINGS, 0, Buffer.concat([i32(0), i32(1), i32(1), i32(1), i32(1), i32(1), i32(1), i32(1)])),
    ...Array.from({ length: 7 }, () => record(TAG.FACE_NAME, 1, Buffer.concat([Buffer.from([0]), wstr('바탕')]))),
    record(TAG.CHAR_SHAPE, 1, charShape({})),
    record(TAG.CHAR_SHAPE, 1, charShape({ size: 2000, bold: true, color: 0x0000ff })), // 빨강 (BGR)
    record(TAG.PARA_SHAPE, 1, paraShape(3)), // 가운데
  ]);
  const text = '제목 본문';
  const paraText = Buffer.concat([Buffer.from(text, 'utf16le'), u16(13)]);
  const body = Buffer.concat([
    record(TAG.PARA_HEADER, 0, Buffer.concat([u32(text.length + 1), u32(0), u16(0), Buffer.from([0, 0])])),
    record(TAG.PARA_TEXT, 1, paraText),
    record(TAG.PARA_CHAR_SHAPE, 1, Buffer.concat([u32(0), u32(1), u32(2), u32(0)])),
  ]);
  const header = Buffer.alloc(256);
  header.write('HWP Document File', 0, 'latin1');
  header.writeUInt32LE(0x05000300, 32);
  header.writeUInt32LE(0, 36); // 압축 안 함
  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, '/FileHeader', header);
  CFB.utils.cfb_add(cfb, '/DocInfo', docInfo);
  CFB.utils.cfb_add(cfb, '/BodyText/Section0', body);
  return new Uint8Array(CFB.write(cfb, { type: 'buffer' }));
}

test('HWP 5.0 문서를 읽어 문단/글자 모양을 해석한다', async () => {
  const doc = await parseDocument(makeHwp(), 'test.hwp');
  assert.equal(doc.format, 'hwp');
  assert.equal(doc.version, '5.0.3.0');
  assert.equal(doc.blocks.length, 1);
  const p = doc.blocks[0];
  assert.equal(p.style.align, 'center');
  assert.deepEqual(p.runs.map((r) => r.text), ['제목', ' 본문']);
  assert.equal(p.runs[0].style.bold, true);
  assert.equal(p.runs[0].style.fontSize, 20);
  assert.equal(p.runs[0].style.color, '#ff0000');
  assert.equal(p.runs[1].style.bold, undefined);
  assert.match(documentToHtml(doc), /<p style="text-align: center[^"]*"><span style="[^"]*font-weight: bold[^"]*">제목<\/span>/);
});

test('HWPX 로 저장한 문서를 다시 읽으면 내용과 서식이 유지된다', async () => {
  const src = {
    title: '테스트',
    page: { width: 793.7, height: 1122.5, marginTop: 100, marginBottom: 90, marginLeft: 110, marginRight: 110 },
    blocks: [
      { type: 'para', style: { align: 'center', lineHeight: 1.6 }, runs: [{ type: 'text', text: '가운데 <제목> & 기호', style: { bold: true, fontSize: 16, fontFamily: ['맑은 고딕'] } }] },
      { type: 'para', style: { align: 'justify', marginLeft: 20, indent: -10 }, runs: [{ type: 'text', text: '줄', style: {} }, { type: 'br' }, { type: 'text', text: '바꿈', style: { italic: true, underline: true, color: '#0000FF' } }, { type: 'tab' }, { type: 'text', text: '탭', style: {} }] },
      {
        type: 'table', width: 400, pageBreakBefore: true,
        rows: [
          [{ colSpan: 2, rowSpan: 1, width: 400, height: 30, style: { borderTop: '1px solid #000000' }, blocks: [{ type: 'para', style: {}, runs: [{ type: 'text', text: '병합 셀', style: {} }] }] }],
          [
            { colSpan: 1, rowSpan: 1, width: 200, height: 30, style: { background: '#DCE6F2' }, blocks: [{ type: 'para', style: {}, runs: [{ type: 'text', text: 'A', style: {} }] }] },
            { colSpan: 1, rowSpan: 1, width: 200, height: 30, style: {}, blocks: [{ type: 'para', style: {}, runs: [{ type: 'text', text: 'B', style: {} }] }] },
          ],
        ],
      },
    ],
  };
  const bytes = await documentToHwpx(src);
  const doc = await parseDocument(bytes, 'out.hwpx');
  assert.equal(doc.format, 'hwpx');
  assert.equal(doc.title, '테스트');
  assert.equal(doc.blocks.length, 3);
  const [p1, p2, t] = doc.blocks;
  assert.equal(p1.style.align, 'center');
  assert.equal(p1.runs[0].text, '가운데 <제목> & 기호');
  assert.equal(p1.runs[0].style.bold, true);
  assert.equal(p1.runs[0].style.fontSize, 16);
  assert.deepEqual(p1.runs[0].style.fontFamily, ['맑은 고딕']);
  assert.deepEqual(p2.runs.map((r) => r.type), ['text', 'br', 'text', 'tab', 'text']);
  assert.equal(p2.runs[2].style.italic, true);
  assert.equal(p2.runs[2].style.underline, true);
  assert.equal(p2.runs[2].style.color, '#0000FF');
  assert.ok(Math.abs(p2.style.indent - -10) < 0.1);
  assert.ok(Math.abs(p2.style.marginLeft - 20) < 0.1);
  assert.equal(t.type, 'table');
  assert.equal(t.pageBreakBefore, true);
  assert.equal(t.rows[0][0].colSpan, 2);
  assert.equal(t.rows[1][1].col, 1);
  assert.equal(t.rows[1][0].style.background, '#DCE6F2');
  assert.ok(Math.abs(doc.page.marginLeft - 110) < 0.1);
  assert.match(documentToText(doc), /병합 셀/);
});

test('지원하지 않는 형식은 오류를 낸다', async () => {
  await assert.rejects(parseDocument(new TextEncoder().encode('hello'), 'a.bin'), /지원하지 않는/);
});

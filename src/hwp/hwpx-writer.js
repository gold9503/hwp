// 공통 문서 모델 → HWPX(ZIP + OWPML XML) 저장
import JSZip from 'jszip';
import { pxToHwpUnit, base64ToUint8, extFromMime, escapeHtml } from './util.js';

const NS = [
  'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"',
  'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"',
  'xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph"',
  'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"',
  'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"',
  'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"',
  'xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history"',
  'xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page"',
  'xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:opf="http://www.idpf.org/2007/opf/"',
  'xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart"',
  'xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"',
  'xmlns:epub="http://www.idpf.org/2007/ops"',
  'xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"',
].join(' ');
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';
const LANGS = ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER'];
const ALIGN = { justify: 'JUSTIFY', left: 'LEFT', right: 'RIGHT', center: 'CENTER' };
const esc = (s) => escapeHtml(String(s));
const hu = (px) => pxToHwpUnit(px || 0);

// 같은 값은 같은 id 를 쓰도록 하는 테이블
class Pool {
  constructor(first) {
    this.items = [];
    this.keys = new Map();
    if (first !== undefined) this.get(first);
  }
  get(v) {
    const k = JSON.stringify(v);
    if (!this.keys.has(k)) {
      this.keys.set(k, this.items.length);
      this.items.push(v);
    }
    return this.keys.get(k);
  }
}

function normCharStyle(s = {}) {
  return {
    font: (s.fontFamily && s.fontFamily[s.fontFamily.length - 1]) || '함초롬바탕',
    latin: (s.fontFamily && s.fontFamily[0]) || (s.fontFamily && s.fontFamily[s.fontFamily.length - 1]) || '함초롬바탕',
    size: Math.round((s.fontSize || 10) * 100),
    bold: !!s.bold,
    italic: !!s.italic,
    underline: !!s.underline,
    strike: !!s.strike,
    sup: !!s.sup,
    sub: !!s.sub,
    color: (s.color || '#000000').toUpperCase(),
    background: s.background ? s.background.toUpperCase() : 'none',
  };
}

function normParaStyle(s = {}) {
  let left = s.marginLeft || 0;
  let indent = s.indent || 0;
  return {
    align: ALIGN[s.align] || 'JUSTIFY',
    left: hu(left),
    right: hu(s.marginRight),
    indent: hu(indent),
    prev: hu(s.spaceBefore),
    next: hu(s.spaceAfter),
    lineType: s.lineHeightPx ? 'FIXED' : 'PERCENT',
    line: s.lineHeightPx ? hu(s.lineHeightPx) : Math.round((s.lineHeight || 1.6) * 100),
  };
}

function borderXml(name, css) {
  // css 예: "1px solid #000000" 또는 'none'
  if (!css || css === 'none') return `<hh:${name} type="NONE" width="0.1 mm" color="#000000"/>`;
  const m = css.match(/([\d.]+)px\s+(\w+)\s+(#[0-9a-fA-F]{6})/);
  const pxw = m ? parseFloat(m[1]) : 1;
  const style = m ? m[2] : 'solid';
  const color = m ? m[3].toUpperCase() : '#000000';
  const mm = Math.round(((pxw * 25.4) / 96) * 100) / 100;
  const widths = [0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0];
  const w = widths.reduce((a, b) => (Math.abs(b - mm) < Math.abs(a - mm) ? b : a));
  const type = { dashed: 'DASH', dotted: 'DOT', double: 'DOUBLE_SLIM' }[style] || 'SOLID';
  return `<hh:${name} type="${type}" width="${w} mm" color="${color}"/>`;
}

export async function documentToHwpx(doc) {
  const fonts = new Pool('함초롬바탕');
  const chars = new Pool(normCharStyle({}));
  const paras = new Pool(normParaStyle({}));
  const borders = new Pool({ none: true }); // id 1: 테두리 없음
  borders.get({ borderLeft: '1px solid #000000', borderRight: '1px solid #000000', borderTop: '1px solid #000000', borderBottom: '1px solid #000000' });
  const images = []; // {id, path, data, mime}
  const imageIds = new Map();
  let idSeq = 1000;

  const imageRef = (src) => {
    if (imageIds.has(src)) return imageIds.get(src);
    const m = /^data:([^;]+);base64,(.*)$/.exec(src || '');
    if (!m) return null;
    const id = `image${images.length + 1}`;
    const ext = extFromMime(m[1]);
    images.push({ id, path: `BinData/${id}.${ext}`, data: base64ToUint8(m[2]), mime: m[1] });
    imageIds.set(src, id);
    return id;
  };

  const charId = (style) => {
    const n = normCharStyle(style);
    fonts.get(n.font);
    fonts.get(n.latin);
    return chars.get(n);
  };

  const runsXml = (runs) => {
    let xml = '';
    let cur = null; // {id, body}
    const open = (id) => {
      if (cur && cur.id === id) return;
      close();
      cur = { id, body: '' };
    };
    const close = () => {
      if (cur) xml += `<hp:run charPrIDRef="${cur.id}"><hp:t>${cur.body}</hp:t></hp:run>`;
      cur = null;
    };
    let lastStyle = {};
    for (const r of runs) {
      if (r.type === 'text') {
        lastStyle = r.style || {};
        open(charId(lastStyle));
        cur.body += esc(r.text).replace(/\t/g, '<hp:tab/>');
      } else if (r.type === 'br') {
        open(charId(lastStyle));
        cur.body += '<hp:lineBreak/>';
      } else if (r.type === 'tab') {
        open(charId(lastStyle));
        cur.body += '<hp:tab/>';
      } else if (r.type === 'image') {
        const ref = imageRef(r.src);
        if (!ref) continue;
        close();
        xml += `<hp:run charPrIDRef="${charId(lastStyle)}">${picXml(ref, r.width || 200, r.height || 150)}<hp:t/></hp:run>`;
      } else if (r.type === 'textbox') {
        // 글상자는 1x1 표로 변환
        close();
        const t = { type: 'table', width: r.width, rows: [[{ row: 0, col: 0, colSpan: 1, rowSpan: 1, width: r.width || 300, blocks: r.blocks, style: {} }]] };
        xml += `<hp:run charPrIDRef="${charId(lastStyle)}">${tableXml(t)}<hp:t/></hp:run>`;
      }
    }
    close();
    return xml || `<hp:run charPrIDRef="${charId(lastStyle)}"/>`;
  };

  const picXml = (ref, wpx, hpx) => {
    const w = hu(wpx), h = hu(hpx);
    const id = idSeq++;
    return `<hp:pic id="${id}" zOrder="${id}" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${id}" reverse="0">` +
      `<hp:offset x="0" y="0"/><hp:orgSz width="${w}" height="${h}"/><hp:curSz width="${w}" height="${h}"/><hp:flip horizontal="0" vertical="0"/>` +
      `<hp:rotationInfo angle="0" centerX="${Math.round(w / 2)}" centerY="${Math.round(h / 2)}" rotateimage="1"/>` +
      `<hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>` +
      `<hc:img binaryItemIDRef="${ref}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>` +
      `<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${w}" y="0"/><hc:pt2 x="${w}" y="${h}"/><hc:pt3 x="0" y="${h}"/></hp:imgRect>` +
      `<hp:imgClip left="0" right="${w}" top="0" bottom="${h}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="${w}" dimheight="${h}"/><hp:effects/>` +
      `<hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${h}" heightRelTo="ABSOLUTE" protect="0"/>` +
      `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
      `<hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`;
  };

  const tableXml = (t) => {
    // 셀 주소(병합 고려) 계산
    const occupied = [];
    const rowsXml = [];
    let maxCols = 0;
    let totalH = 0;
    t.rows.forEach((row, ri) => {
      let ci = 0;
      let rowH = 0;
      const cellsXml = row.map((c) => {
        while (occupied[ri]?.[ci]) ci++;
        const col = ci;
        for (let r = ri; r < ri + (c.rowSpan || 1); r++) {
          occupied[r] = occupied[r] || [];
          for (let k = col; k < col + (c.colSpan || 1); k++) occupied[r][k] = true;
        }
        ci += c.colSpan || 1;
        maxCols = Math.max(maxCols, ci);
        const st = c.style || {};
        const bf = borders.get({
          borderLeft: st.borderLeft || 'none', borderRight: st.borderRight || 'none',
          borderTop: st.borderTop || 'none', borderBottom: st.borderBottom || 'none',
          background: st.background || null,
        }) + 1;
        const w = hu(c.width || 100), h = hu(c.height || 25);
        rowH = Math.max(rowH, h);
        const inner = (c.blocks && c.blocks.length ? c.blocks : [{ type: 'para', style: {}, runs: [] }]).map(blockXml).join('');
        return `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">` +
          `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${inner}</hp:subList>` +
          `<hp:cellAddr colAddr="${col}" rowAddr="${ri}"/><hp:cellSpan colSpan="${c.colSpan || 1}" rowSpan="${c.rowSpan || 1}"/>` +
          `<hp:cellSz width="${w}" height="${h}"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>`;
      });
      totalH += rowH;
      rowsXml.push(`<hp:tr>${cellsXml.join('')}</hp:tr>`);
    });
    const width = hu(t.width || 600);
    const id = idSeq++;
    return `<hp:tbl id="${id}" zOrder="${id}" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${t.rows.length}" colCnt="${t.cols || maxCols}" cellSpacing="0" borderFillIDRef="1" noAdjust="0">` +
      `<hp:sz width="${width}" widthRelTo="ABSOLUTE" height="${totalH}" heightRelTo="ABSOLUTE" protect="0"/>` +
      `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
      `<hp:outMargin left="283" right="283" top="283" bottom="283"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>` +
      `${rowsXml.join('')}</hp:tbl>`;
  };

  let firstPara = true;
  const secPrXml = () => {
    const p = doc.page || {};
    const W = hu(p.width || 793.7), H = hu(p.height || 1122.5);
    const ml = hu(p.marginLeft ?? 113.4), mr = hu(p.marginRight ?? 113.4);
    // 머리말/꼬리말 영역은 따로 쓰지 않고 위/아래 여백에 합친다
    const header = 0, footer = 0;
    const mt = hu(p.marginTop ?? 132.3), mb = hu(p.marginBottom ?? 113.4);
    return `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">` +
      `<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>` +
      `<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>` +
      `<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>` +
      `<hp:pagePr landscape="${W > H ? 'NARROWLY' : 'WIDELY'}" width="${Math.min(W, H)}" height="${Math.max(W, H)}" gutterType="LEFT_ONLY"><hp:margin header="${header}" footer="${footer}" gutter="0" left="${ml}" right="${mr}" top="${mt}" bottom="${mb}"/></hp:pagePr>` +
      `<hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr>` +
      `<hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr>` +
      `<hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>` +
      `<hp:pageBorderFill type="EVEN" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>` +
      `<hp:pageBorderFill type="ODD" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>` +
      `</hp:secPr><hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>`;
  };

  function blockXml(b) {
    const isFirst = firstPara;
    firstPara = false;
    const pageBreak = b.pageBreakBefore ? 1 : 0;
    if (b.type === 'table') {
      const pid = paras.get(normParaStyle({}));
      const sec = isFirst ? `<hp:run charPrIDRef="0">${secPrXml()}</hp:run>` : '';
      return `<hp:p id="0" paraPrIDRef="${pid}" styleIDRef="0" pageBreak="${pageBreak}" columnBreak="0" merged="0">${sec}<hp:run charPrIDRef="0">${tableXml(b)}<hp:t/></hp:run></hp:p>`;
    }
    const pid = paras.get(normParaStyle(b.style));
    const sec = isFirst ? `<hp:run charPrIDRef="0">${secPrXml()}</hp:run>` : '';
    return `<hp:p id="0" paraPrIDRef="${pid}" styleIDRef="0" pageBreak="${pageBreak}" columnBreak="0" merged="0">${sec}${runsXml(b.runs)}</hp:p>`;
  }

  const blocks = doc.blocks.length ? doc.blocks : [{ type: 'para', style: {}, runs: [] }];
  const body = blocks.map(blockXml).join('');
  const sectionXml = `${XML_HEAD}<hs:sec ${NS}>${body}</hs:sec>`;

  // ---- header.xml ----
  const fontfaces = LANGS.map((lang) =>
    `<hh:fontface lang="${lang}" fontCnt="${fonts.items.length}">` +
    fonts.items.map((f, i) => `<hh:font id="${i}" face="${esc(f)}" type="TTF" isEmbedded="0"/>`).join('') +
    '</hh:fontface>').join('');

  const borderFillsXml = borders.items.map((b, i) => {
    const fill = b.background ? `<hc:fillBrush><hc:winBrush faceColor="${b.background.toUpperCase()}" hatchColor="#000000" alpha="0"/></hc:fillBrush>` : '';
    return `<hh:borderFill id="${i + 1}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">` +
      '<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>' +
      (b.none ? ['leftBorder', 'rightBorder', 'topBorder', 'bottomBorder'].map((n) => borderXml(n, 'none')).join('')
        : borderXml('leftBorder', b.borderLeft) + borderXml('rightBorder', b.borderRight) + borderXml('topBorder', b.borderTop) + borderXml('bottomBorder', b.borderBottom)) +
      `<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>${fill}</hh:borderFill>`;
  }).join('');

  const charsXml = chars.items.map((c, i) => {
    const f = fonts.get(c.font);
    const fl = fonts.get(c.latin);
    const langAttrs = (v, latin = v) => LANGS.map((l) => `${l.toLowerCase()}="${l === 'LATIN' ? latin : v}"`).join(' ');
    return `<hh:charPr id="${i}" height="${c.size}" textColor="${c.color}" shadeColor="${c.background}" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">` +
      `<hh:fontRef ${langAttrs(f, fl)}/><hh:ratio ${langAttrs(100)}/><hh:spacing ${langAttrs(0)}/><hh:relSz ${langAttrs(100)}/><hh:offset ${langAttrs(0)}/>` +
      (c.bold ? '<hh:bold/>' : '') + (c.italic ? '<hh:italic/>' : '') +
      `<hh:underline type="${c.underline ? 'BOTTOM' : 'NONE'}" shape="SOLID" color="${c.color}"/>` +
      `<hh:strikeout shape="${c.strike ? 'SOLID' : 'NONE'}" color="${c.color}"/>` +
      '<hh:outline type="NONE"/><hh:shadow type="NONE" color="#B2B2B2" offsetX="10" offsetY="10"/>' +
      (c.sup ? '<hh:supscript/>' : '') + (c.sub ? '<hh:subscript/>' : '') +
      '</hh:charPr>';
  }).join('');

  const parasXml = paras.items.map((p, i) => {
    const margin = (k) => `<hh:margin><hc:intent value="${p.indent * k}" unit="HWPUNIT"/><hc:left value="${p.left * k}" unit="HWPUNIT"/><hc:right value="${p.right * k}" unit="HWPUNIT"/><hc:prev value="${p.prev * k}" unit="HWPUNIT"/><hc:next value="${p.next * k}" unit="HWPUNIT"/></hh:margin>` +
      `<hh:lineSpacing type="${p.lineType}" value="${p.lineType === 'FIXED' ? p.line * k : p.line}" unit="HWPUNIT"/>`;
    return `<hh:paraPr id="${i}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">` +
      `<hh:align horizontal="${p.align}" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/>` +
      '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>' +
      '<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>' +
      `<hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">${margin(1)}</hp:case><hp:default>${margin(2)}</hp:default></hp:switch>` +
      '<hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>';
  }).join('');

  const headerXml = `${XML_HEAD}<hh:head ${NS} version="1.4" secCnt="1">` +
    '<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/><hh:refList>' +
    `<hh:fontfaces itemCnt="7">${fontfaces}</hh:fontfaces>` +
    `<hh:borderFills itemCnt="${borders.items.length}">${borderFillsXml}</hh:borderFills>` +
    `<hh:charProperties itemCnt="${chars.items.length}">${charsXml}</hh:charProperties>` +
    '<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>' +
    `<hh:paraProperties itemCnt="${paras.items.length}">${parasXml}</hh:paraProperties>` +
    '<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>' +
    '</hh:refList><hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument>' +
    '<hh:docOption><hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/></hh:docOption>' +
    '<hh:trackchageConfig flags="56"/></hh:head>';

  const title = esc(doc.title || '');
  const imgItems = images.map((im) => `<opf:item id="${im.id}" href="${im.path}" media-type="${im.mime}" isEmbeded="1"/>`).join('');
  const contentHpf = `${XML_HEAD}<opf:package ${NS} version="" unique-identifier="" id="">` +
    `<opf:metadata><opf:title>${title}</opf:title><opf:language>ko</opf:language><opf:meta name="creator" content="text">HanEditor</opf:meta></opf:metadata>` +
    `<opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>${imgItems}` +
    '<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest>' +
    '<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>';

  const zip = new JSZip();
  zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
  zip.file('version.xml', `${XML_HEAD}<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.4" application="Hancom Office Hangul" appVersion="11, 0, 0, 0"/>`);
  zip.file('META-INF/container.xml', `${XML_HEAD}<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/><ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/></ocf:rootfiles></ocf:container>`);
  zip.file('META-INF/manifest.xml', `${XML_HEAD}<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>`);
  zip.file('Contents/content.hpf', contentHpf);
  zip.file('Contents/header.xml', headerXml);
  zip.file('Contents/section0.xml', sectionXml);
  zip.file('settings.xml', `${XML_HEAD}<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>`);
  zip.file('Preview/PrvText.txt', documentToText(doc).slice(0, 1024));
  for (const im of images) zip.file(im.path, im.data);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/hwp+zip' });
}

export function documentToText(doc) {
  const blockText = (b) => {
    if (b.type === 'table') return b.rows.map((r) => r.map((c) => c.blocks.map(blockText).join(' ')).join('\t')).join('\n');
    return b.runs.map((r) => (r.type === 'text' ? r.text : r.type === 'br' ? '\n' : r.type === 'tab' ? '\t' : r.type === 'textbox' ? r.blocks.map(blockText).join('\n') : '')).join('');
  };
  return doc.blocks.map(blockText).join('\r\n');
}

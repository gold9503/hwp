// 공용 유틸리티

// HWPUNIT: 1/7200 inch → CSS px (96 dpi)
export const hwpUnitToPx = (v) => Math.round((v / 75) * 100) / 100;
export const pxToHwpUnit = (px) => Math.round(px * 75);

// COLORREF (0x00BBGGRR) → #rrggbb
export function colorRefToCss(c) {
  const r = c & 0xff, g = (c >>> 8) & 0xff, b = (c >>> 16) & 0xff;
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function uint8ToBase64(u8) {
  if (typeof Buffer !== 'undefined') return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}

export function base64ToUint8(b64) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp',
  webp: 'image/webp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff',
};
export const mimeFromExt = (ext) => MIME[(ext || '').toLowerCase()] || null;
export const extFromMime = (mime) => Object.keys(MIME).find((k) => MIME[k] === mime) || 'png';

export const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 설치되지 않은 한글 글꼴을 대신할 대체 글꼴
export const SERIF_FALLBACK = ['함초롬바탕', 'HCR Batang', 'Batang', 'AppleMyungjo', 'Noto Serif KR'];
export const SANS_FALLBACK = ['함초롬돋움', 'HCR Dotum', 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR'];
export const FALLBACK_FONTS = new Set([...SERIF_FALLBACK, ...SANS_FALLBACK].map((f) => f.toLowerCase()));
export const isSerifName = (name) => /명조|바탕|궁서|myeongjo|myungjo|batang|serif|times|신명|순명|견명/i.test(name);

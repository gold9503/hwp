// 문서 형식 자동 판별 후 공통 문서 모델로 변환
import { parseHwp5, isHwp5 } from './hwp5.js';
import { parseHwpx, isZip } from './hwpx.js';

export async function parseDocument(input, fileName = '') {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (isHwp5(u8)) return parseHwp5(u8);
  if (isZip(u8)) return parseHwpx(u8);
  const head = new TextDecoder('latin1').decode(u8.subarray(0, 32));
  if (head.startsWith('HWP Document File')) return parseHwp5(u8);
  throw new Error(`지원하지 않는 문서 형식입니다: ${fileName}`);
}

export { parseHwp5, parseHwpx };

// 스냅숏 기반 되돌리기/다시 실행 (사용자 정의 서식 명령까지 포함하기 위해 직접 관리)

function nodePath(root, node) {
  const path = [];
  while (node && node !== root) {
    const parent = node.parentNode;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, node));
    node = parent;
  }
  return node === root ? path : null;
}

function resolvePath(root, path) {
  let n = root;
  for (const i of path) {
    if (!n.childNodes[i]) return null;
    n = n.childNodes[i];
  }
  return n;
}

export function saveSelection(root) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer)) return null;
  const start = nodePath(root, r.startContainer);
  const end = nodePath(root, r.endContainer);
  if (!start || !end) return null;
  return { start, startOffset: r.startOffset, end, endOffset: r.endOffset };
}

export function restoreSelection(root, s) {
  if (!s) return;
  const a = resolvePath(root, s.start);
  const b = resolvePath(root, s.end);
  if (!a || !b) return;
  try {
    const r = document.createRange();
    r.setStart(a, Math.min(s.startOffset, a.length ?? a.childNodes.length));
    r.setEnd(b, Math.min(s.endOffset, b.length ?? b.childNodes.length));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  } catch {
    /* 선택 복원 실패는 무시 */
  }
}

export class History {
  constructor(root, limit = 200) {
    this.root = root;
    this.limit = limit;
    this.stack = [];
    this.index = -1;
    this.timer = null;
  }
  reset() {
    this.stack = [{ html: this.root.innerHTML, sel: null }];
    this.index = 0;
  }
  // 즉시 기록
  record() {
    clearTimeout(this.timer);
    this.timer = null;
    const html = this.root.innerHTML;
    if (this.stack[this.index]?.html === html) {
      this.stack[this.index].sel = saveSelection(this.root);
      return;
    }
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push({ html, sel: saveSelection(this.root) });
    if (this.stack.length > this.limit) this.stack.shift();
    this.index = this.stack.length - 1;
  }
  // 입력 중에는 잠시 모아서 기록
  recordLater() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.record(), 350);
  }
  flush() {
    if (this.timer) this.record();
  }
  undo() {
    this.flush();
    if (this.index <= 0) return false;
    this.index--;
    this.apply();
    return true;
  }
  redo() {
    if (this.index >= this.stack.length - 1) return false;
    this.index++;
    this.apply();
    return true;
  }
  apply() {
    const s = this.stack[this.index];
    this.root.innerHTML = s.html;
    restoreSelection(this.root, s.sel);
  }
}

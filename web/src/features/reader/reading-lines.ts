export type ReadingLine = { startOffset: number; endOffset: number; excerpt: string; range: Range };

function textNodes(block: HTMLElement) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  return nodes;
}

export function readingRange(block: HTMLElement, start: number, end: number): Range | null {
  const length = block.textContent?.length ?? 0;
  start = Math.max(0, Math.min(length, start)); end = Math.max(start, Math.min(length, end));
  if (start === end) return null;
  const range = document.createRange();
  let offset = 0, started = false;
  for (const node of textNodes(block)) {
    const next = offset + node.length;
    if (!started && start < next) { range.setStart(node, start - offset); started = true; }
    if (started && end <= next) { range.setEnd(node, end - offset); return range; }
    offset = next;
  }
  return null;
}

/** DOM ranges follow actual wrapping, including inline formatting and Vietnamese characters. */
export function readingLineAt(block: HTMLElement, y: number): ReadingLine | null {
  const box = block.getBoundingClientRect();
  const style = getComputedStyle(block);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
  const wanted = Math.max(0, Math.floor((y - box.top) / lineHeight));
  const lines = new Map<number, { start: number; end: number }>();
  const range = document.createRange();
  let offset = 0;
  scan: for (const node of textNodes(block)) {
    for (let index = 0; index < node.length;) {
      const size = (node.data.codePointAt(index) ?? 0) > 0xffff ? 2 : 1;
      range.setStart(node, index); range.setEnd(node, index + size);
      const rect = range.getBoundingClientRect();
      if (rect.height && !node.parentElement?.closest('button')) {
        const line = Math.max(0, Math.floor((rect.top + rect.height / 2 - box.top) / lineHeight));
        if (line > wanted && lines.has(wanted)) break scan;
        const current = lines.get(line);
        lines.set(line, { start: current?.start ?? offset + index, end: offset + index + size });
      }
      index += size;
    }
    offset += node.length;
  }
  const nearest = [...lines.keys()].sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted))[0];
  const line = lines.get(nearest);
  const selected = line && readingRange(block, line.start, line.end);
  return line && selected ? { startOffset: line.start, endOffset: line.end, excerpt: selected.toString().trim().slice(0, 500), range: selected } : null;
}

export function readingLineRects(range: Range, article: HTMLElement) {
  const origin = article.getBoundingClientRect();
  const rows: Array<{ left: number; top: number; width: number; height: number }> = [];
  for (const rect of Array.from(range.getClientRects()).filter(rect => rect.width && rect.height)) {
    const row = rows.find(row => Math.min(row.top + row.height, rect.bottom - origin.top) - Math.max(row.top, rect.top - origin.top) > Math.min(row.height, rect.height) / 2);
    const left = rect.left - origin.left, top = rect.top - origin.top;
    if (!row) rows.push({ left, top, width: rect.width, height: rect.height });
    else {
      const right = Math.max(row.left + row.width, left + rect.width), bottom = Math.max(row.top + row.height, top + rect.height);
      row.left = Math.min(row.left, left); row.top = Math.min(row.top, top); row.width = right - row.left; row.height = bottom - row.top;
    }
  }
  return rows;
}

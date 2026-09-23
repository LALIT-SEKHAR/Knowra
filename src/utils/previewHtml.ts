const ALLOWED = new Set([
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'P',
  'BR',
  'UL',
  'OL',
  'LI',
  'TABLE',
  'THEAD',
  'TBODY',
  'TFOOT',
  'TR',
  'TH',
  'TD',
  'STRONG',
  'EM',
  'B',
  'I',
  'U',
  'S',
  'A',
  'IMG',
  'SPAN',
  'DIV',
  'BLOCKQUOTE',
  'SUP',
  'SUB',
  'COLGROUP',
  'COL',
  'CAPTION',
]);

function keepAttribute(el: HTMLElement, name: string, value: string): boolean {
  const attr = name.toLowerCase();
  if (attr.startsWith('on') || attr === 'style') return false;
  if (el.tagName === 'A' && attr === 'href') return /^(https?:|mailto:)/i.test(value.trim());
  if (el.tagName === 'IMG' && attr === 'src') {
    const src = value.trim();
    return (
      /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src) || /^https:\/\//i.test(src)
    );
  }
  if (el.tagName === 'IMG' && attr === 'alt') return true;
  if ((el.tagName === 'TD' || el.tagName === 'TH') && (attr === 'colspan' || attr === 'rowspan')) {
    return /^\d{1,3}$/.test(value);
  }
  return false;
}

function sanitizeChildren(parent: Node) {
  for (const child of [...parent.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE) continue;
    if (!(child instanceof HTMLElement)) {
      child.remove();
      continue;
    }
    if (!ALLOWED.has(child.tagName)) {
      while (child.firstChild) parent.insertBefore(child.firstChild, child);
      child.remove();
      sanitizeChildren(parent);
      return;
    }
    for (const attr of [...child.attributes]) {
      if (!keepAttribute(child, attr.name, attr.value)) child.removeAttribute(attr.name);
    }
    if (child.tagName === 'A' && child.hasAttribute('href')) {
      child.setAttribute('target', '_blank');
      child.setAttribute('rel', 'noreferrer');
    }
    sanitizeChildren(child);
  }
}

export function sanitizePreviewHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  sanitizeChildren(doc.body);
  return doc.body.innerHTML;
}

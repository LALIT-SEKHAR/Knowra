const SYMBOLS: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  pi: 'π',
  sigma: 'σ',
  phi: 'φ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Pi: 'Π',
  Sigma: 'Σ',
  Phi: 'Φ',
  Omega: 'Ω',
  times: '×',
  cdot: '·',
  pm: '±',
  mp: '∓',
  leq: '≤',
  geq: '≥',
  neq: '≠',
  approx: '≈',
  infty: '∞',
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  div: '÷',
  degree: '°',
  ldots: '…',
  cdots: '⋯',
};

const BINARY = new Set([
  'times',
  'cdot',
  'pm',
  'mp',
  'leq',
  'geq',
  'neq',
  'approx',
  'to',
  'rightarrow',
  'leftarrow',
  'div',
]);

const UNWRAP = new Set([
  'text',
  'mathrm',
  'mathbf',
  'mathit',
  'mathsf',
  'mathtt',
  'operatorname',
  'boldsymbol',
  'overline',
  'underline',
  'hat',
  'bar',
  'vec',
  'dot',
  'ddot',
  'boxed',
]);

const SUP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  n: 'ⁿ',
  i: 'ⁱ',
};

const SUB: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
  a: 'ₐ',
  e: 'ₑ',
  i: 'ᵢ',
  o: 'ₒ',
  u: 'ᵤ',
  n: 'ₙ',
  x: 'ₓ',
};

function toScript(text: string, map: Record<string, string>, plain: (value: string) => string) {
  let out = '';
  for (const ch of text) {
    const mapped = map[ch];
    if (!mapped) return plain(text);
    out += mapped;
  }
  return out;
}

/** Turn a TeX formula into a single readable line, without `$` or `\frac`. */
export function texToPlain(input: string) {
  let i = 0;
  const s = input.trim();

  function parseSeq() {
    let out = '';
    while (i < s.length && s[i] !== '}') out += parseAtom();
    return out;
  }

  function parseGroup() {
    if (s[i] !== '{') return parseAtom();
    i += 1;
    const inner = parseSeq();
    if (s[i] === '}') i += 1;
    return inner;
  }

  function parseAtom(): string {
    if (i >= s.length) return '';
    if (/\s/.test(s[i])) {
      while (i < s.length && /\s/.test(s[i])) i += 1;
      return ' ';
    }
    if (s[i] === '\\') {
      i += 1;
      if (s[i] === '\\') {
        i += 1;
        return '\n';
      }
      let name = '';
      while (i < s.length && /[a-zA-Z]/.test(s[i])) {
        name += s[i];
        i += 1;
      }
      if (!name) {
        const ch = s[i] ?? '';
        if (ch === ',' || ch === ';' || ch === ':' || ch === ' ') {
          i += 1;
          return ' ';
        }
        if (ch === '!') {
          i += 1;
          return '';
        }
        i += 1;
        return ch;
      }
      if (s[i] === ' ') i += 1;
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const num = parseGroup().trim();
        const den = parseGroup().trim();
        const simple = (part: string) => part.length > 0 && !/[+\-=/]/.test(part);
        if (simple(num) && simple(den)) return `${num}/${den}`;
        return `(${num})/(${den})`;
      }
      if (name === 'sqrt') {
        let index = '';
        if (s[i] === '[') {
          i += 1;
          while (i < s.length && s[i] !== ']') {
            index += s[i];
            i += 1;
          }
          if (s[i] === ']') i += 1;
        }
        const body = parseGroup().trim();
        return index ? `${index}√(${body})` : `√(${body})`;
      }
      if (name === 'binom') {
        const n = parseGroup().trim();
        const k = parseGroup().trim();
        return `(${n} choose ${k})`;
      }
      if (UNWRAP.has(name)) return parseGroup();
      if (name === 'quad' || name === 'qquad') return ' ';
      if (BINARY.has(name) && SYMBOLS[name]) return ` ${SYMBOLS[name]} `;
      if (SYMBOLS[name]) return SYMBOLS[name];
      if (s[i] === '{') return parseGroup();
      return '';
    }
    if (s[i] === '{') return parseGroup();
    if (s[i] === '^') {
      i += 1;
      const body = (s[i] === '{' ? parseGroup() : (s[i++] ?? '')).trim();
      return toScript(body, SUP, (value) => (value.length === 1 ? `^${value}` : `^(${value})`));
    }
    if (s[i] === '_') {
      i += 1;
      const body = (s[i] === '{' ? parseGroup() : (s[i++] ?? '')).trim();
      return toScript(body, SUB, (value) => (value.length === 1 ? `_${value}` : `_(${value})`));
    }
    if (s[i] === '&' || s[i] === '~') {
      const space = s[i] === '~';
      i += 1;
      return space ? ' ' : '';
    }
    return s[i++];
  }

  return parseSeq()
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function withFormulasAsText(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.katex').forEach((node) => {
    const tex = node.querySelector('annotation')?.textContent ?? '';
    const plain = tex ? texToPlain(tex) : (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    node.replaceWith(document.createTextNode(plain));
  });
  return clone;
}

function markLists(root: HTMLElement) {
  root.querySelectorAll('ol').forEach((list) => {
    let index = 0;
    for (const child of list.children) {
      if (child.tagName !== 'LI') continue;
      index += 1;
      child.prepend(`${index}. `);
    }
  });
  root.querySelectorAll('ul').forEach((list) => {
    for (const child of list.children) {
      if (child.tagName !== 'LI') continue;
      child.prepend('• ');
    }
  });
}

function readInnerText(node: HTMLElement) {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-9999px';
  host.style.top = '0';
  host.style.width = '40rem';
  host.append(node);
  document.body.append(host);
  const plain = node.innerText.replace(/\n{3,}/g, '\n\n').trim();
  host.remove();
  return plain;
}

export function renderedClipboard(source: HTMLElement) {
  const htmlNode = withFormulasAsText(source);
  const plainNode = withFormulasAsText(source);
  markLists(plainNode);
  return {
    html: `<div>${htmlNode.innerHTML}</div>`,
    plain: readInnerText(plainNode),
  };
}

export async function copyRenderedMessage(source: HTMLElement) {
  const { html, plain } = renderedClipboard(source);
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      }),
    ]);
  } catch {
    await navigator.clipboard.writeText(plain);
  }
}

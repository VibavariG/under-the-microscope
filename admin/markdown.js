/* =====================================================================
   A small, self-contained Markdown → HTML converter.
   Not full CommonMark — covers what a technical blog post actually
   needs: headers, bold/italic, inline code, fenced code blocks, links,
   images, blockquotes, ordered/unordered lists (single level), and
   horizontal rules. No network dependency, so the admin tool never
   needs a CDN to work.
   ===================================================================== */

function mdEscapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Inline formatting: code spans, images, links, bold, italic.
// Order matters — code spans are protected first so markup inside them
// isn't touched by the later passes.
function mdInline(text) {
  const codeSpans = [];
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(mdEscapeHTML(code));
    return `\u0000CODE${codeSpans.length - 1}\u0000`;
  });

  text = mdEscapeHTML(text);

  // images: ![alt](src)
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img src="${src}" alt="${alt}">`);
  // links: [text](url) — external links open in a new tab
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const external = /^https?:\/\//i.test(url);
    return `<a href="${url}"${external ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
  });
  // bold then italic (bold first so **_x_** style nesting behaves)
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/_([^_]+)_/g, '<em>$1</em>');

  text = text.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => `<code>${codeSpans[Number(i)]}</code>`);
  return text;
}

function mdToHTML(markdown) {
  const src = String(markdown || '').replace(/\r\n/g, '\n');

  // 1. Pull out fenced code blocks so nothing else touches their contents.
  const blocks = [];
  const withoutFences = src.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    blocks.push(`<pre><code${lang ? ` class="language-${lang}"` : ''}>${mdEscapeHTML(code.replace(/\n$/, ''))}</code></pre>`);
    return `\u0000BLOCK${blocks.length - 1}\u0000`;
  });

  const lines = withoutFences.split('\n');
  const html = [];
  let i = 0;

  const flushParagraph = (buf) => {
    const text = buf.join(' ').trim();
    if (text) html.push(`<p>${mdInline(text)}</p>`);
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^\u0000BLOCK\d+\u0000$/.test(line.trim())) {
      const idx = Number(line.trim().match(/\d+/)[0]);
      html.push(blocks[idx]);
      i++;
      continue;
    }

    if (line.trim() === '') { i++; continue; }

    // headers
    const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      html.push(`<h${level}>${mdInline(headerMatch[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    // horizontal rule
    if (/^(---|\*\*\*)\s*$/.test(line)) {
      html.push('<hr>');
      i++;
      continue;
    }

    // blockquote (consume consecutive '> ' lines)
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      html.push(`<blockquote><p>${mdInline(buf.join(' ').trim())}</p></blockquote>`);
      continue;
    }

    // unordered list
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(`<li>${mdInline(lines[i].replace(/^[-*]\s+/, ''))}</li>`);
        i++;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${mdInline(lines[i].replace(/^\d+\.\s+/, ''))}</li>`);
        i++;
      }
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // paragraph — consume until a blank line or a line that starts a new block
    const buf = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !/^(---|\*\*\*)\s*$/.test(lines[i]) &&
      !/^\u0000BLOCK\d+\u0000$/.test(lines[i].trim())
    ) {
      buf.push(lines[i]);
      i++;
    }
    flushParagraph(buf);
  }

  return html.join('\n');
}

import katex from 'katex';
import 'katex/dist/katex.min.css';
import DOMPurify from 'dompurify';

import { stripMarkdownSyntax } from '@/lib/strip-markdown-syntax';
import { sanitizeAiHtml } from '@/lib/sanitize-ai-html';
import { formatClassroomScienceText } from '@/lib/exam-text-normalize';
import { splitMathSegments } from '@/lib/math-segments';

/** Inline Markdown for table cells and line renderer (math only — no bold/italic markers). */
export function formatInlineMarkdown(t: string): string {
  if (t.includes('__MATH_BLOCK__') || t.includes('__MATH_ERROR__') || t.includes('__NOTE_CARD')) {
    return t;
  }

  const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Same splitter as the on-screen viewer: $…$, \(…\), bare \frac / \sqrt, and
  // no stray "$" left behind (BUG-02).
  let formatted = splitMathSegments(stripMarkdownSyntax(formatClassroomScienceText(t)))
    .map((part) => {
      if (!part.math) return escapeHtml(part.value);
      try {
        return katex.renderToString(part.value.replace(/\\\\/g, '\\'), { displayMode: false, throwOnError: false });
      } catch {
        return escapeHtml(part.value);
      }
    })
    .join('');

  formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre class="bg-gray-100 p-4 rounded-lg overflow-x-auto mb-2 text-sm font-mono"><code>$1</code></pre>');

  formatted = formatted.replace(/`([^`]+)`/g, (match, codeContent: string) => {
    if (match.includes('$')) return match;
    return `<code class="bg-gray-100 px-2 py-1 rounded text-sm font-mono text-gray-800">${codeContent}</code>`;
  });

  return formatted;
}

function splitPipeCells(row: string): string[] {
  const parts = row.trim().split('|');
  return parts
    .map((p) => p.trim())
    .filter((p, i) => !(p === '' && (i === 0 || i === parts.length - 1)));
}

function isSeparatorRow(row: string): boolean {
  const cells = splitPipeCells(row);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{3,}:?$/.test(c.replace(/\s/g, '')));
}

/** Convert a GFM pipe table block to one line of HTML (handled by hasHTML pass). */
function gfmPipeTableToHtml(rows: string[]): string {
  if (rows.length < 2 || !isSeparatorRow(rows[1])) return rows.join('\n');

  const headers = splitPipeCells(rows[0]);
  const bodyRows = rows.slice(2).map((r) => splitPipeCells(r));

  let html =
    '<div class="my-4 overflow-x-auto"><table class="min-w-full border-collapse border border-gray-300 text-sm">';
  html += '<thead><tr>';
  for (const h of headers) {
    html += `<th class="border border-gray-300 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-900">${formatInlineMarkdown(h)}</th>`;
  }
  html += '</tr></thead><tbody>';
  for (const row of bodyRows) {
    html += '<tr>';
    for (let k = 0; k < headers.length; k++) {
      const cell = row[k] ?? '';
      html += `<td class="border border-gray-300 px-3 py-2 align-top text-gray-700">${formatInlineMarkdown(cell)}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['form', 'input', 'button', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick'],
  });
}

/** Replace | pipe | tables | with HTML before the line-by-line pass. */
function expandGfmTablesBeforeSplit(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('|')) {
      const block: string[] = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        block.push(lines[j]);
        j++;
      }
      if (block.length >= 2) {
        const html = gfmPipeTableToHtml(block);
        if (html.startsWith('<div')) {
          result.push(html);
          i = j;
          continue;
        }
      }
    }
    result.push(lines[i]);
    i++;
  }
  return result.join('\n');
}

/**
 * Same renderer used on teacher tools for Gemini output (headings, lists, bold, math, etc.).
 */
export function renderMarkdown(text: string): string {
  if (!text) return '';

  let processedText = text;
  try {
    if (text.trim().startsWith('{') && text.includes('"formatted"')) {
      const parsed = JSON.parse(text);
      if (parsed.formatted) {
        processedText = parsed.formatted;
      }
    }
  } catch {
    processedText = text;
  }

  processedText = stripMarkdownSyntax(processedText);

  processedText = processedText.replace(/\$\$([\s\S]*?)\$\$/g, (match, mathContent) => {
    try {
      const cleanedMath = mathContent.trim().replace(/\\\\/g, '\\');
      const rendered = katex.renderToString(cleanedMath, {
        displayMode: true,
        throwOnError: false,
      });
      return `__MATH_BLOCK__${rendered}__MATH_BLOCK__`;
    } catch {
      return `__MATH_ERROR__${mathContent}__MATH_ERROR__`;
    }
  });

  processedText = processedText.replace(/__NOTE_CARD_START__\n([\s\S]*?)\n__NOTE_CARD_END__/g, (match, cardContent) => {
    return `__HTML_CARD__${cardContent.trim()}__HTML_CARD__`;
  });

  processedText = expandGfmTablesBeforeSplit(processedText);

  const lines = processedText.split('\n');
  let html = '';
  let inList = false;
  let listType: 'ul' | 'ol' | null = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();

    const hasMathBlock = line.includes('__MATH_BLOCK__') || line.includes('__MATH_ERROR__');
    const hasHTMLCard = line.includes('__HTML_CARD__');

    if (hasMathBlock) {
      closeList();
      line = line.replace(/__MATH_BLOCK__(.*?)__MATH_BLOCK__/g, '<div class="my-4 overflow-x-auto">$1</div>');
      line = line.replace(/__MATH_ERROR__(.*?)__MATH_ERROR__/g, '<div class="my-4 p-2 bg-red-50 border border-red-200 rounded text-red-800 text-sm">Math Error: $1</div>');
      html += line;
      continue;
    }

    if (hasHTMLCard) {
      closeList();
      line = line.replace(/__HTML_CARD__(.*?)__HTML_CARD__/g, '$1');
      html += line + '\n';
      continue;
    }

    const hasHTML =
      line.includes('<div') ||
      line.includes('</div>') ||
      line.includes('<table') ||
      line.includes('<h2') ||
      line.includes('<h3') ||
      line.includes('<ul') ||
      line.includes('<li') ||
      line.includes('<p') ||
      line.includes('<span');

    if (hasHTML) {
      closeList();
      html += line + '\n';
      continue;
    }

    if (trimmed.startsWith('#### ')) {
      closeList();
      html += `<h4 class="text-base font-bold text-gray-900 mt-4 mb-2">${formatInlineMarkdown(trimmed.substring(5))}</h4>`;
    } else if (trimmed.startsWith('### ')) {
      closeList();
      html += `<h3 class="text-lg font-bold text-gray-900 mt-6 mb-3">${formatInlineMarkdown(trimmed.substring(4))}</h3>`;
    } else if (trimmed.startsWith('## ')) {
      closeList();
      html += `<h2 class="text-xl font-bold text-gray-900 mt-8 mb-4 border-b border-gray-200 pb-2">${formatInlineMarkdown(trimmed.substring(3))}</h2>`;
    } else if (trimmed.startsWith('# ')) {
      closeList();
      html += `<h1 class="text-2xl font-bold text-gray-900 mt-8 mb-4">${formatInlineMarkdown(trimmed.substring(2))}</h1>`;
    } else if (/^\d+\.\s+/.test(trimmed)) {
      if (!inList || listType !== 'ol') {
        closeList();
        html += '<ol class="list-decimal ml-6 mb-4 space-y-1">';
        inList = true;
        listType = 'ol';
      }
      const content = trimmed.replace(/^\d+\.\s+/, '');
      html += `<li class="mb-1">${formatInlineMarkdown(content)}</li>`;
    } else if (/^[-*]\s+/.test(trimmed)) {
      if (!inList || listType !== 'ul') {
        closeList();
        html += '<ul class="list-disc ml-6 mb-4 space-y-1">';
        inList = true;
        listType = 'ul';
      }
      const content = trimmed.replace(/^[-*]\s+/, '');
      html += `<li class="mb-1">${formatInlineMarkdown(content)}</li>`;
    } else if (/^-{3,}$/.test(trimmed)) {
      closeList();
      html += '<hr class="my-6 border-gray-200" />';
    } else if (!trimmed) {
      closeList();
      if (
        html &&
        !html.endsWith('</p>') &&
        !html.endsWith('</h1>') &&
        !html.endsWith('</h2>') &&
        !html.endsWith('</h3>') &&
        !html.endsWith('</h4>') &&
        !html.endsWith('</div>')
      ) {
        html += '<br>';
      }
    } else {
      closeList();
      html += `<p class="mb-4 text-gray-700 leading-relaxed">${formatInlineMarkdown(line)}</p>`;
    }
  }

  closeList();

  function closeList() {
    if (inList) {
      html += listType === 'ul' ? '</ul>' : '</ol>';
      inList = false;
      listType = null;
    }
  }

  return sanitizeAiHtml(html);
}

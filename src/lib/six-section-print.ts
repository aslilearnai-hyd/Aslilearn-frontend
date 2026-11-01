/**
 * Static, print-ready HTML for a six-section record (BUG-05).
 *
 * The PDF used to be built from the raw saved text, while the screen showed
 * the mapped six-section view, so numbering, sections and maths differed.
 * This renders the very same mapped sections the screen shows, with every
 * hidden part opened up: answers, flashcard backs, collapsed sections.
 */
import katex from 'katex';
import { latexToReadable, splitMathSegments } from './math-segments.ts';
import type { ContentBlock, McqQuestion, SixSectionViewerProps } from '@/components/ai-v2/six-section-viewer';

type PrintOptions = {
  /** Same text clean-up the on-screen viewer runs before rendering maths. */
  normalize?: (text: string) => string;
  /** Write maths as readable text (√, ², a/b) for the text-only PDF fallback. */
  plainMath?: boolean;
};

const escapeHtml = (value: string) =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function mathHtml(text: string, normalize: (t: string) => string, plainMath = false): string {
  return splitMathSegments(normalize(String(text ?? '')))
    .map((part) => {
      if (!part.math) return escapeHtml(part.value).replace(/\n/g, '<br/>');
      if (plainMath) return escapeHtml(latexToReadable(part.value));
      try {
        return katex.renderToString(part.value, { displayMode: false, throwOnError: false });
      } catch {
        return escapeHtml(part.value);
      }
    })
    .join('');
}

const SAFE_IMAGE = /^(?:https?:\/\/|\/|data:image\/)/i;

function figure(url: string | undefined, n: string): string {
  if (!url || !SAFE_IMAGE.test(url)) return '';
  return `<div style="margin:6px 0 4px 26px"><img src="${escapeHtml(url)}" alt="Figure for question ${escapeHtml(n)}" crossorigin="anonymous" style="max-width:100%;max-height:260px;border:1px solid #e2e8f0;border-radius:6px"/></div>`;
}

function questionHead(n: string, stem: string, marks: string | undefined, m: (t: string) => string): string {
  const badge = marks ? `<span style="float:right;font-size:11px;color:#64748b;border:1px solid #e2e8f0;border-radius:999px;padding:0 8px">${escapeHtml(marks)}</span>` : '';
  return `<div style="font-weight:600;color:#1e293b">${badge}<span style="color:#4f46e5;font-weight:800;margin-right:6px">${escapeHtml(n)}.</span>${m(stem)}</div>`;
}

function mcqHtml(questions: McqQuestion[], m: (t: string) => string, showAnswers: boolean): string {
  return questions
    .map((q) => {
      let body = questionHead(q.n, q.stem, q.marks, m) + figure(q.imageUrl, q.n);
      if (q.matchPairs?.length) {
        body += `<table style="margin:6px 0 0 26px;border-collapse:collapse;font-size:13px">${q.matchPairs
          .map((p, i) => `<tr><td style="border:1px solid #e2e8f0;padding:4px 8px">${escapeHtml(p.leftKey || String(i + 1))}. ${m(p.left)}</td><td style="border:1px solid #e2e8f0;padding:4px 8px">${escapeHtml(p.rightKey || String.fromCharCode(97 + i))}. ${m(p.right)}</td></tr>`)
          .join('')}</table>`;
      }
      if (q.options.length) {
        body += `<ol style="list-style:none;margin:6px 0 0 26px;padding:0">${q.options
          .map((o, i) => `<li style="margin:2px 0">(${escapeHtml(o.label || String.fromCharCode(65 + i))}) ${m(o.text)}</li>`)
          .join('')}</ol>`;
        const correct = q.options.findIndex((o) => o.correct);
        if (showAnswers && correct >= 0) {
          const o = q.options[correct];
          body += `<div style="margin:4px 0 0 26px;color:#047857;font-size:13px">Answer: (${escapeHtml(o.label || String.fromCharCode(65 + correct))}) ${m(o.text)}</div>`;
        }
      }
      return `<div style="margin:0 0 12px">${body}</div>`;
    })
    .join('');
}

function blockHtml(block: ContentBlock, m: (t: string) => string, showAnswers: boolean): string {
  switch (block.kind) {
    case 'lead':
      return `<p style="color:#475569">${m(block.text)}</p>`;
    case 'titleLine':
      return `<h4 style="margin:14px 0 6px;font-size:14px;color:#0f172a;border-left:4px solid #6366f1;padding-left:8px">${m(block.text)}</h4>`;
    case 'bullets':
    case 'tips':
      return `<ul style="margin:4px 0 8px 18px;padding:0">${block.items.map((it) => `<li style="margin:3px 0">${m(it)}</li>`).join('')}</ul>`;
    case 'steps':
      return `<ol style="margin:4px 0 8px 18px;padding:0">${block.items.map((it) => `<li style="margin:3px 0">${m(it)}</li>`).join('')}</ol>`;
    case 'keyValue':
      return block.rows
        .map((r) => `<div style="margin:6px 0;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px"><div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#4f46e5">${escapeHtml(r.label)}</div><div>${m(r.value)}</div></div>`)
        .join('');
    case 'mcq':
      return mcqHtml(block.questions, m, showAnswers);
    case 'shortAnswer':
      return block.questions
        .map((q) => `<div style="margin:0 0 10px">${questionHead(q.n, q.stem, q.marks, m)}${figure(q.imageUrl, q.n)}</div>`)
        .join('');
    case 'answerKey':
      return block.items
        .map((a) => `<div style="margin:0 0 8px"><span style="font-weight:800;color:#047857;margin-right:6px">${escapeHtml(a.n)}.</span>${m(a.answer)}${a.work ? `<div style="margin:2px 0 0 22px;color:#64748b;font-size:13px">${m(a.work)}</div>` : ''}</div>`)
        .join('');
    case 'flashcards':
      return block.cards
        .map((c, i) => `<div style="margin:6px 0;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px"><div style="font-weight:700">${i + 1}. ${m(c.front)}</div><div style="margin-top:3px;color:#475569">${m(c.back)}</div></div>`)
        .join('');
    case 'table':
      return `<table style="width:100%;border-collapse:collapse;margin:6px 0;font-size:13px"><thead><tr>${block.head
        .map((h) => `<th style="border:1px solid #cbd5e1;background:#f1f5f9;padding:5px 8px;text-align:left">${m(h)}</th>`)
        .join('')}</tr></thead><tbody>${block.rows
        .map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #e2e8f0;padding:5px 8px;vertical-align:top">${m(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`;
    case 'bloom':
      return `<ul style="margin:4px 0 8px 18px;padding:0">${block.chips.map((c) => `<li><b>${escapeHtml(c.level)}</b> — ${m(c.desc)}</li>`).join('')}</ul>`;
    default:
      return '';
  }
}

/** One HTML string per section, so a long record can be paged section by section. */
export function sixSectionToPrintSections(props: SixSectionViewerProps, options: PrintOptions = {}): string[] {
  const normalize = options.normalize ?? ((t: string) => t);
  const m = (t: string) => mathHtml(t, normalize, options.plainMath);
  // Inline answers only when the record has no answer-key section of its own.
  const hasKey = props.sections.some((s) => s.blocks.some((b) => b.kind === 'answerKey'));
  const out: string[] = [];
  if (props.summary?.learn?.length || props.summary?.stats?.length) {
    out.push(
      `<div style="margin:0 0 14px;padding:10px 12px;border:1px solid #e0e7ff;background:#eef2ff;border-radius:10px">${
        props.summary.learn?.length ? `<div style="font-weight:700;margin-bottom:4px">What students will learn</div><ul style="margin:0 0 0 18px;padding:0">${props.summary.learn.map((l) => `<li>${m(l)}</li>`).join('')}</ul>` : ''
      }${props.summary.stats?.length ? `<div style="margin-top:6px;font-size:12px;color:#475569">${props.summary.stats.map((s) => `${escapeHtml(s.label)}: <b>${escapeHtml(s.value)}</b>`).join(' · ')}</div>` : ''}</div>`,
    );
  }
  for (const section of props.sections) {
    const body = section.blocks.map((b) => blockHtml(b, m, !hasKey)).join('');
    if (!body) continue;
    out.push(
      `<section style="margin:0 0 16px"><h3 style="margin:0 0 8px;padding-bottom:4px;border-bottom:2px solid #e0e7ff;font-size:16px;color:#312e81">${escapeHtml(section.emoji ? `${section.emoji} ` : '')}${escapeHtml(section.label)}</h3>${body}</section>`,
    );
  }
  return out;
}

export function sixSectionToPrintHtml(props: SixSectionViewerProps, options: PrintOptions = {}): string {
  return sixSectionToPrintSections(props, options).join('');
}

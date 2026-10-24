import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';
import {
  reconciledWorksheetInstructions,
  resolveWorksheetFromPayload,
  type NormalizedWorksheet,
} from '@/lib/parse-worksheet-mcq';
import { resolveHomeworkFromPayload, type NormalizedHomework } from '@/lib/parse-homework-creator';
import {
  formatLabeledMcqOptions,
  resolveExamPaperFromPayload,
  type NormalizedExamPaper,
} from '@/lib/parse-exam-question-paper';
import { resolveMockTestFromPayload } from '@/lib/parse-mock-test';
import { getFlashcardsFromContent } from '@/components/flashcard-viewer';
import { formatClassroomScienceText } from '@/lib/exam-text-normalize';
import { aiToolBoardLabel } from './school-program';

export const TEACHER_DOWNLOAD_TOOL_IDS = [
  'worksheet-mcq-generator',
  'exam-question-paper-generator',
  'homework-creator',
  'flashcard-generator',
] as const;

export type TeacherDownloadToolId = (typeof TEACHER_DOWNLOAD_TOOL_IDS)[number];

export type AiToolPdfMeta = {
  toolName?: string;
  board?: string;
  classLabel?: string;
  subject?: string;
  topic?: string;
  subtopic?: string;
};

const PDF_MARGIN: [number, number, number, number] = [12, 12, 12, 12];

function fmt(value: unknown, subject?: string): string {
  return formatClassroomScienceText(value, subject);
}

export function isTeacherDownloadTool(toolType: string): toolType is TeacherDownloadToolId {
  return (TEACHER_DOWNLOAD_TOOL_IDS as readonly string[]).includes(toolType);
}

function csvEscape(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvEscape).join(',');
}

function addCanvasToPdf(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  margin: [number, number, number, number],
) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const innerW = pageW - margin[1] - margin[3];
  const innerH = pageH - margin[0] - margin[2];
  const innerRatio = innerH / innerW;
  const pxFullHeight = canvas.height;
  const pxPageHeight = Math.floor(canvas.width * innerRatio);
  const nPages = Math.max(1, Math.ceil(pxFullHeight / pxPageHeight));
  const pageCanvas = document.createElement('canvas');
  const pageCtx = pageCanvas.getContext('2d');
  if (!pageCtx) return;
  pageCanvas.width = canvas.width;

  for (let page = 0; page < nPages; page++) {
    if (page === nPages - 1 && pxFullHeight % pxPageHeight !== 0) {
      pageCanvas.height = pxFullHeight % pxPageHeight;
    } else {
      pageCanvas.height = pxPageHeight;
    }
    const w = pageCanvas.width;
    const h = pageCanvas.height;
    pageCtx.fillStyle = 'white';
    pageCtx.fillRect(0, 0, w, h);
    pageCtx.drawImage(canvas, 0, page * pxPageHeight, w, h, 0, 0, w, h);
    const pageHeightMm = (pageCanvas.height * innerW) / pageCanvas.width;
    if (page > 0) pdf.addPage();
    pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.98), 'JPEG', margin[1], margin[0], innerW, pageHeightMm);
  }
}

function buildPdfCover(meta?: AiToolPdfMeta): string {
  const rows = [
    ['Class', meta?.classLabel],
    ['Subject', meta?.subject],
    ['Topic', meta?.topic],
    ['Subtopic', meta?.subtopic],
    ['Board', meta?.board ? aiToolBoardLabel(String(meta.board)) : ''],
  ].filter(([, v]) => String(v || '').trim());

  const metaGrid = rows
    .map(
      ([label, value]) => `
      <div style="border:1px solid #e0e7ff;border-radius:10px;padding:10px 12px;background:#fff;">
        <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6366f1;">${label}</p>
        <p style="margin:4px 0 0;font-size:13px;font-weight:600;color:#0f172a;">${value}</p>
      </div>`,
    )
    .join('');

  return `
    <div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 55%,#0ea5e9 100%);color:#fff;border-radius:18px;padding:22px 24px;margin-bottom:18px;">
      <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;opacity:0.9;">ASLILEARN · AI V2</p>
      <h1 style="margin:0;font-size:24px;font-weight:800;line-height:1.2;">${meta?.toolName || 'Generated Content'}</h1>
      <p style="margin:10px 0 0;font-size:12px;opacity:0.92;">Premium export · Curriculum-aligned · ${new Date().toLocaleDateString()}</p>
    </div>
    ${
      metaGrid
        ? `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:18px;">${metaGrid}</div>`
        : ''
    }
  `;
}

export function buildTeacherToolCsv(
  toolType: string,
  content: string,
  rawContent: unknown,
): string | null {
  if (toolType === 'worksheet-mcq-generator') {
    const { worksheet } = resolveWorksheetFromPayload(content, rawContent);
    if (!worksheet) return null;
    const rows: string[] = [
      csvRow(['Section', 'Question Number', 'Type', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Answer', 'Marks']),
    ];
    for (const section of worksheet.sections) {
      section.questions.forEach((q, index) => {
        rows.push(
          csvRow([
            section.label,
            q.questionNumber ?? index + 1,
            q.type || '',
            fmt(q.question),
            fmt(q.options[0]?.replace(/^[A-D]\)\s*/i, '') || ''),
            fmt(q.options[1]?.replace(/^[A-D]\)\s*/i, '') || ''),
            fmt(q.options[2]?.replace(/^[A-D]\)\s*/i, '') || ''),
            fmt(q.options[3]?.replace(/^[A-D]\)\s*/i, '') || ''),
            fmt(q.answer),
            q.marks ?? '',
          ]),
        );
      });
    }
    return rows.join('\n');
  }

  if (toolType === 'homework-creator') {
    const { homework } = resolveHomeworkFromPayload(content, rawContent);
    if (!homework) return null;
    const rows: string[] = [csvRow(['Type', 'Question / Task', 'Option A', 'Option B', 'Option C', 'Option D', 'Answer'])];
    homework.practiceQuestions.forEach((q, index) => {
      rows.push(
        csvRow([
          q.type || 'Practice',
          fmt(q.question || `Question ${index + 1}`),
          fmt(q.options[0] || ''),
          fmt(q.options[1] || ''),
          fmt(q.options[2] || ''),
          fmt(q.options[3] || ''),
          fmt(q.answer),
        ]),
      );
    });
    homework.applicationTasks.forEach((task, index) => {
      rows.push(csvRow(['Application', fmt(task || `Task ${index + 1}`), '', '', '', '', '']));
    });
    return rows.join('\n');
  }

  if (toolType === 'exam-question-paper-generator') {
    const { paper } = resolveExamPaperFromPayload(content, rawContent);
    if (!paper) return null;
    const rows: string[] = [
      csvRow([
        'Question Number',
        'Section',
        'Question',
        'Option A',
        'Option B',
        'Option C',
        'Option D',
        'Answer',
        'Explanation',
        'Marks',
      ]),
    ];
    for (const section of paper.sections) {
      section.questions.forEach((q, index) => {
        rows.push(
          csvRow([
            q.questionNumber || index + 1,
            section.title,
            fmt(q.question),
            fmt(q.options[0]?.replace(/^[A-D]\)\s*/i, '') || ''),
            fmt(q.options[1]?.replace(/^[A-D]\)\s*/i, '') || ''),
            fmt(q.options[2]?.replace(/^[A-D]\)\s*/i, '') || ''),
            fmt(q.options[3]?.replace(/^[A-D]\)\s*/i, '') || ''),
            fmt(q.answer),
            fmt(q.explanation || ''),
            q.marks ?? '',
          ]),
        );
      });
    }
    return rows.join('\n');
  }

  if (toolType === 'flashcard-generator') {
    const cards = getFlashcardsFromContent(content);
    if (!cards.length) return null;
    const rows: string[] = [csvRow(['Front', 'Back', 'Type', 'Category', 'Memory Hook'])];
    for (const card of cards) {
      rows.push(
        csvRow([
          fmt(card.front),
          fmt(card.back),
          card.type || '',
          card.cardCategory || '',
          fmt(card.memoryHookQuickTip || card.memoryCue || ''),
        ]),
      );
    }
    return rows.join('\n');
  }

  return null;
}

function pushBlock(lines: string[], heading: string, body?: string) {
  const text = String(body || '').trim();
  if (!text) return;
  lines.push(`## ${heading}`, '', text, '');
}

function formatWorksheetAsMarkdown(worksheet: NormalizedWorksheet, subject?: string): string {
  const lines: string[] = [];
  lines.push(`# ${fmt(worksheet.title || 'Worksheet', subject)}`, '');

  if (worksheet.learningObjectives.length) {
    lines.push('## Learning Objectives', '');
    for (const obj of worksheet.learningObjectives) {
      const t = fmt(obj, subject);
      if (t) lines.push(`- ${t}`);
    }
    lines.push('');
  }

  pushBlock(lines, 'Instructions', fmt(reconciledWorksheetInstructions(worksheet), subject));

  for (const section of worksheet.sections) {
    if (!section.questions.length) continue;
    lines.push(`## ${fmt(section.displayLabel || section.label, subject)}`, '');
    section.questions.forEach((q, index) => {
      const num = q.questionNumber ?? index + 1;
      const marks = q.marks != null && q.marks > 0 ? ` (${q.marks} mark${q.marks === 1 ? '' : 's'})` : '';
      lines.push(`${num}. ${fmt(q.question, subject)}${marks}`);
      for (const opt of formatLabeledMcqOptions(q.options || [])) {
        lines.push(fmt(opt, subject));
      }
      lines.push('');
    });
  }

  pushBlock(lines, 'Answer Key', fmt(worksheet.answerKey, subject));
  if (worksheet.bloomLevel) pushBlock(lines, 'Bloom Level', fmt(worksheet.bloomLevel, subject));
  if (worksheet.difficultyTag) pushBlock(lines, 'Difficulty', fmt(worksheet.difficultyTag, subject));

  return lines.join('\n').trim();
}

function formatExamPaperAsMarkdown(paper: NormalizedExamPaper, subject?: string): string {
  const lines: string[] = [];
  lines.push(`# ${fmt(paper.paperTitle || 'Exam Question Paper', subject)}`, '');
  pushBlock(lines, 'Instructions', fmt(paper.instructions, subject));
  pushBlock(lines, 'Blueprint', fmt(paper.blueprint, subject));

  for (const section of paper.sections) {
    if (!section.questions.length) continue;
    lines.push(`## ${fmt(section.title, subject)}`, '');
    section.questions.forEach((q, index) => {
      const num = q.questionNumber || String(index + 1);
      const marks = q.marks != null && q.marks > 0 ? ` (${q.marks} mark${q.marks === 1 ? '' : 's'})` : '';
      lines.push(`${num}. ${fmt(q.question, subject)}${marks}`);
      for (const opt of formatLabeledMcqOptions(q.options || [])) {
        lines.push(fmt(opt, subject));
      }
      lines.push('');
    });
  }

  pushBlock(lines, 'Internal Choices', fmt(paper.internalChoices, subject));
  pushBlock(lines, 'Answer Key', fmt(paper.answerKey, subject));
  pushBlock(lines, 'Marking Scheme', fmt(paper.markingScheme, subject));
  pushBlock(lines, 'Open-ended Rubric', fmt(paper.openEndedRubric, subject));

  return lines.join('\n').trim();
}

function formatHomeworkAsMarkdown(homework: NormalizedHomework, subject?: string): string {
  const lines: string[] = [];
  lines.push(`# ${fmt(homework.title || 'Homework', subject)}`, '');
  pushBlock(lines, 'Instructions', fmt(homework.instructions, subject));

  if (homework.practiceQuestions.length) {
    lines.push('## Practice Questions', '');
    homework.practiceQuestions.forEach((q, index) => {
      const num = q.questionNumber ?? index + 1;
      lines.push(`${num}. ${fmt(q.question || `Question ${num}`, subject)}`);
      for (const opt of formatLabeledMcqOptions(q.options || [])) {
        lines.push(fmt(opt, subject));
      }
      lines.push('');
    });
  }

  if (homework.applicationTasks.length) {
    lines.push('## Application Tasks', '');
    homework.applicationTasks.forEach((task, index) => {
      const t = fmt(task, subject);
      if (t) lines.push(`${index + 1}. ${t}`);
    });
    lines.push('');
  }

  pushBlock(lines, 'Creative Thinking', fmt(homework.creativeThinkingQuestion, subject));
  pushBlock(lines, 'Real-life Observation', fmt(homework.realLifeObservationTask, subject));
  pushBlock(lines, 'Challenge Question', fmt(homework.challengeQuestion, subject));
  pushBlock(lines, 'Support Hint', fmt(homework.supportHint, subject));
  pushBlock(lines, 'Answer Hints', fmt(homework.answerHints, subject));
  pushBlock(lines, 'Parent Note', fmt(homework.parentNote, subject));

  return lines.join('\n').trim();
}

/**
 * Build markdown for Word export. Structured tools often have empty display
 * markdown (content lives in raw JSON) — CSV already handles that; Word must too.
 */
export function buildTeacherToolWordText(
  toolType: string,
  content: string,
  rawContent: unknown,
  subject?: string,
): string {
  const fallback = String(content || '').trim();

  if (toolType === 'worksheet-mcq-generator') {
    const { worksheet, markdownFallback } = resolveWorksheetFromPayload(content, rawContent);
    if (worksheet) {
      const text = formatWorksheetAsMarkdown(worksheet, subject);
      if (text) return text;
    }
    if (markdownFallback?.trim()) return markdownFallback.trim();
    return fallback;
  }

  if (toolType === 'exam-question-paper-generator' || toolType === 'mock-test-builder') {
    if (toolType === 'mock-test-builder') {
      const { paper, markdownFallback } = resolveMockTestFromPayload(content, rawContent);
      if (paper) {
        const text = formatExamPaperAsMarkdown(paper, subject);
        if (text) return text;
      }
      if (markdownFallback?.trim()) return markdownFallback.trim();
      return fallback;
    }
    const { paper, markdownFallback } = resolveExamPaperFromPayload(content, rawContent);
    if (paper) {
      const text = formatExamPaperAsMarkdown(paper, subject);
      if (text) return text;
    }
    if (markdownFallback?.trim()) return markdownFallback.trim();
    return fallback;
  }

  if (toolType === 'homework-creator') {
    const { homework, markdownFallback } = resolveHomeworkFromPayload(content, rawContent);
    if (homework) {
      const text = formatHomeworkAsMarkdown(homework, subject);
      if (text) return text;
    }
    if (markdownFallback?.trim()) return markdownFallback.trim();
    return fallback;
  }

  if (toolType === 'flashcard-generator') {
    const cards = getFlashcardsFromContent(
      fallback ||
        (rawContent && typeof rawContent === 'object'
          ? JSON.stringify({ formatted: '', raw: rawContent })
          : ''),
    );
    if (cards.length) {
      const lines: string[] = ['# Flashcards', ''];
      cards.forEach((card, index) => {
        lines.push(`## Card ${index + 1}`, '');
        lines.push(`**Front:** ${fmt(card.front, subject)}`);
        lines.push(`**Back:** ${fmt(card.back, subject)}`);
        const hook = fmt(card.memoryHookQuickTip || card.memoryCue || '', subject);
        if (hook) lines.push(`**Memory hook:** ${hook}`);
        lines.push('');
      });
      return lines.join('\n').trim();
    }
  }

  return fallback;
}

export function queryAiToolExportElement(): HTMLElement | null {
  return document.querySelector('[data-ai-tool-export]');
}

export async function downloadAiToolPdf(
  fileName: string,
  fallbackHtml?: string,
  meta?: AiToolPdfMeta,
): Promise<void> {
  const source = queryAiToolExportElement();
  const wrapper = document.createElement('div');
  wrapper.style.boxSizing = 'border-box';
  wrapper.style.width = '210mm';
  wrapper.style.maxWidth = '100vw';
  wrapper.style.padding = '14mm 12mm';
  wrapper.style.backgroundColor = '#ffffff';
  wrapper.style.fontFamily = 'ui-sans-serif, system-ui, sans-serif';
  wrapper.style.color = '#1e293b';
  wrapper.style.fontSize = '14px';
  wrapper.style.lineHeight = '1.55';
  wrapper.style.position = 'fixed';
  wrapper.style.left = '0';
  wrapper.style.top = '100vh';
  wrapper.style.pointerEvents = 'none';

  wrapper.innerHTML = buildPdfCover(meta);

  const body = document.createElement('div');
  body.style.border = '1px solid #e2e8f0';
  body.style.borderRadius = '14px';
  body.style.padding = '16px';
  body.style.background = '#f8fafc';

  if (source) {
    body.innerHTML = source.innerHTML;
  } else if (fallbackHtml) {
    body.innerHTML = fallbackHtml;
  } else {
    throw new Error('No exportable content found');
  }

  wrapper.appendChild(body);
  document.body.appendChild(wrapper);

  await document.fonts.ready.catch(() => undefined);
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  await new Promise((r) => setTimeout(r, 50));

  try {
    const canvas = await html2canvas(wrapper, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      foreignObjectRendering: false,
    });
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    addCanvasToPdf(pdf, canvas, PDF_MARGIN);
    pdf.save(fileName);
  } finally {
    document.body.removeChild(wrapper);
  }
}

export function downloadTeacherToolCsv(
  toolType: string,
  content: string,
  rawContent: unknown,
  fileName: string,
): boolean {
  const csv = buildTeacherToolCsv(toolType, content, rawContent);
  if (!csv) return false;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, fileName);
  return true;
}

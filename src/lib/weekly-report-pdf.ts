import { formatMarks } from './format-marks';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  teacherActivityTiles,
  teacherAiTiles,
  teacherSchoolTiles,
  type WeeklyReportTile,
} from './weekly-report-metrics';

export type WeeklyReportPdfExam = {
  title?: string;
  percentage?: number;
  rank?: number | null;
};

export type WeeklyReportPdfInput = {
  title?: string;
  summary?: string;
  highlights?: string[];
  studentName?: string;
  schoolName?: string;
  role?: "student" | "teacher";
  metrics: Record<string, unknown>;
};

function n(v: unknown, fallback = 0) {
  const num = Number(v);
  return Number.isFinite(num) ? num : fallback;
}

function esc(s: unknown) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "12.5 / 20" from a marks pair, else the old percentage. */
function marksOrPct(pair: { obtained?: number; total?: number } | undefined, pct: unknown): string {
  return formatMarks(pair?.obtained, pair?.total) ?? `${n(pct)}%`;
}

/** One exam row: online exams carry obtained/total; OMR rows carry the score in totalMarks and the paper maximum in maxMarks. */
function rowMarks(r: { percentage?: number; obtainedMarks?: number; totalMarks?: number; maxMarks?: number }): string {
  const marks = r.obtainedMarks != null ? formatMarks(r.obtainedMarks, r.totalMarks) : formatMarks(r.totalMarks, r.maxMarks);
  return marks ?? `${n(r.percentage)}%`;
}

function tile(label: string, value: string, hint = '') {
  return `<div class="tile">
    <div class="tile-label">${esc(label)}</div>
    <div class="tile-value">${esc(value)}</div>
    ${hint ? `<div class="tile-hint">${esc(hint)}</div>` : ''}
  </div>`;
}

function tilesHtml(tiles: WeeklyReportTile[]) {
  return tiles.map((t) => tile(t.label, t.value, t.hint || '')).join('');
}

function section(title: string, bodyHtml: string) {
  return `<section class="section">
    <h2>${esc(title)}</h2>
    ${bodyHtml}
  </section>`;
}

function listRows(
  rows: Array<{ title?: string; percentage?: number; rank?: number | null }>,
  empty: string,
) {
  if (!rows.length) return `<p class="empty">${esc(empty)}</p>`;
  return `<ul class="list">${rows
    .map(
      (r) => `<li>
        <span class="list-title">${esc(r.title || 'Item')}${
          r.rank != null && Number(r.rank) > 0 ? ` · Rank #${esc(r.rank)}` : ''
        }</span>
        <span class="list-pct">${esc(rowMarks(r))}</span>
      </li>`,
    )
    .join('')}</ul>`;
}

function usageRows(
  rows: Array<{ title?: string; detail?: string; value?: string }>,
  empty: string,
) {
  if (!rows.length) return `<p class="empty">${esc(empty)}</p>`;
  return `<ul class="list">${rows
    .map(
      (r) => `<li>
        <span class="list-title">${esc(r.title || 'Item')}${
          r.detail ? `<br/><span style="font-size:11px;color:#64748b;font-weight:500">${esc(r.detail)}</span>` : ''
        }</span>
        <span class="list-pct">${esc(r.value || '')}</span>
      </li>`,
    )
    .join('')}</ul>`;
}

export function buildWeeklyReportHtml(input: WeeklyReportPdfInput): string {
  const m = input.metrics || {};
  const isTeacher =
    input.role === 'teacher' || String(m.role || '') === 'teacher' || 'generationsCreated' in m;
  const exams = Array.isArray(m.exams) ? (m.exams as WeeklyReportPdfExam[]) : [];
  const omr = Array.isArray(m.omrResults) ? (m.omrResults as WeeklyReportPdfExam[]) : [];
  const highlights = Array.isArray(input.highlights) ? input.highlights : [];
  const topSubjects = Array.isArray(m.topSubjects) ? (m.topSubjects as string[]) : [];
  const toolsUsed = Array.isArray(m.toolsUsed)
    ? (m.toolsUsed as Array<{ name?: string; count?: number; subjects?: string[] }>)
    : [];
  const topSubjectsDetailed = Array.isArray(m.topSubjectsDetailed)
    ? (m.topSubjectsDetailed as Array<{ subject?: string; sessions?: number; pct?: number }>)
    : [];
  const mostUsed = (m.mostUsedSubject || null) as
    | { subject?: string; sessions?: number; pct?: number }
    | null;

  const shellStart = `<!DOCTYPE html><html><head><meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Calibri, Arial, sans-serif;
      color: #0f172a;
      background: #fff;
      width: 794px;
    }
    .sheet {
      padding: 28px 32px 36px;
      background:
        radial-gradient(ellipse 80% 40% at 10% 0%, #e0f2fe 0%, transparent 55%),
        radial-gradient(ellipse 60% 35% at 100% 5%, #ccfbf1 0%, transparent 50%),
        #ffffff;
    }
    .hero {
      border-radius: 20px;
      padding: 22px 24px;
      background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 55%, #0f766e 100%);
      color: #fff;
      box-shadow: 0 12px 28px rgba(2, 132, 199, 0.28);
    }
    .brand {
      font-size: 11px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      opacity: 0.9;
      font-weight: 700;
    }
    .hero h1 {
      margin: 8px 0 4px;
      font-size: 26px;
      line-height: 1.2;
      font-weight: 800;
    }
    .hero .sub { margin: 0; font-size: 13px; opacity: 0.92; }
    .meta {
      margin-top: 14px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip {
      background: rgba(255,255,255,0.18);
      border: 1px solid rgba(255,255,255,0.28);
      border-radius: 999px;
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 600;
    }
    .section { margin-top: 22px; }
    .section h2 {
      margin: 0 0 10px;
      font-size: 12px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #0369a1;
      font-weight: 800;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .tile {
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 12px 14px;
      min-height: 96px;
      display: flex;
      flex-direction: column;
      background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
    }
    .tile-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.01em;
      color: #64748b;
      line-height: 1.25;
      min-height: 28px;
    }
    .tile-value {
      margin-top: auto;
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
      word-break: break-word;
    }
    .tile-hint { margin-top: 4px; font-size: 11px; color: #64748b; min-height: 14px; }
    .list {
      list-style: none;
      margin: 0;
      padding: 0;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      overflow: hidden;
    }
    .list li {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 14px;
      border-top: 1px solid #f1f5f9;
      background: #fff;
      font-size: 13px;
    }
    .list li:first-child { border-top: none; }
    .list-title { color: #334155; }
    .list-pct { font-weight: 800; color: #0f172a; }
    .empty { margin: 0; font-size: 12px; color: #64748b; }
    .highlights {
      border-radius: 14px;
      padding: 14px 16px;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
    }
    .highlights h3 {
      margin: 0 0 8px;
      font-size: 13px;
      color: #0369a1;
      font-weight: 800;
    }
    .highlights ul { margin: 0; padding-left: 18px; }
    .highlights li { margin: 4px 0; font-size: 13px; color: #0f172a; }
    .footer {
      margin-top: 26px;
      padding-top: 12px;
      border-top: 1px dashed #cbd5e1;
      font-size: 11px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
  </style></head><body><div class="sheet">
    <div class="hero">
      <div class="brand">AsliLearn · ${isTeacher ? 'Teacher' : 'Student'} weekly report</div>
      <h1>${esc(
        input.title ||
          (isTeacher
            ? 'Your weekly AsliLearn teacher report'
            : 'Your weekly AsliLearn learning report'),
      )}</h1>
      <p class="sub">${esc(input.summary || '')}</p>
      <div class="meta">
        ${input.studentName ? `<span class="chip">${esc(input.studentName)}</span>` : ''}
        ${input.schoolName ? `<span class="chip">${esc(input.schoolName)}</span>` : ''}
        <span class="chip">Generated ${esc(new Date().toLocaleString('en-IN'))}</span>
      </div>
    </div>`;

  const highlightsBlock = highlights.length
    ? `<section class="section"><div class="highlights">
            <h3>This week at a glance</h3>
            <ul>${highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
          </div></section>`
    : '';

  const shellEnd = `
    <div class="footer">
      <span>AsliLearn.ai · ${isTeacher ? 'Teaching impact summary' : 'Keep practising your weak chapters'}</span>
      <span>Confidential ${isTeacher ? 'teacher' : 'student'} report</span>
    </div>
  </div></body></html>`;

  if (isTeacher) {
    return `${shellStart}
    ${section(
      'Your activity',
      `<div class="grid">
        ${tilesHtml(teacherActivityTiles(m))}
      </div>`,
    )}
    ${section(
      'Teaching with AI',
      `<div class="grid">
        ${tilesHtml(teacherAiTiles(m))}
      </div>
      ${usageRows(
        toolsUsed.slice(0, 8).map((t) => ({
          title: t.name || 'Tool',
          detail: Array.isArray(t.subjects) && t.subjects.length ? t.subjects.slice(0, 3).join(' · ') : '',
          value: `${n(t.count)}×`,
        })),
        'No AI tools used this week yet.',
      )}`,
    )}
    ${section(
      'Your school this week',
      `<div class="grid">
        ${tilesHtml(teacherSchoolTiles(m))}
      </div>`,
    )}
    ${highlightsBlock}
    ${shellEnd}`;
  }

  return `${shellStart}
    ${section(
      'Adoption',
      `<div class="grid">
        ${tile('Logins this week', String(n(m.loginCount)), 'Days you opened the app')}
        ${tile('Last active', String(m.lastActiveDate || '—'))}
        ${tile('First activation', String(m.activationDate || '—'))}
      </div>`,
    )}

    ${section(
      'Engagement',
      `<div class="grid">
        ${tile('Learning sessions', String(n(m.sessions)))}
        ${tile('Total time', String(m.totalTimeLabel || `${n(m.minutes)} min`))}
        ${tile('Avg session', n(m.avgSessionMinutes) > 0 ? `${n(m.avgSessionMinutes)} min` : '—')}
      </div>`,
    )}

    ${section(
      'Learning behaviour',
      `<div class="grid">
        ${tile('Topics practised', String(n(m.topicsPractised)))}
        ${tile('Repeated topics', String(n(m.topicsRepeated)))}
        ${tile('Repeat practice', `${n(m.repeatPracticePct)}%`)}
      </div>`,
    )}

    ${section(
      'AI usage',
      `<div class="grid">
        ${tile('AI uses', String(n(m.aiExplanations)), `Vidya ${n(m.aiDoubts)} · Tools ${n(m.aiToolUses)}`)}
        ${tile('Practice / quizzes', String(n(m.practiceAttempts) + n(m.iqAttempts)))}
        ${tile('Accuracy', n(m.practiceAttempts) > 0 ? `${n(m.practiceAccuracy)}%` : '—')}
      </div>`,
    )}

    ${section(
      'Tools you used',
      usageRows(
        toolsUsed.slice(0, 8).map((t) => ({
          title: t.name || 'Tool',
          detail: Array.isArray(t.subjects) && t.subjects.length ? t.subjects.slice(0, 3).join(' · ') : '',
          value: `${n(t.count)}×`,
        })),
        'No AI tools used this week yet.',
      ),
    )}

    ${section(
      'Subjects you used most',
      usageRows(
        (topSubjectsDetailed.length
          ? topSubjectsDetailed
          : topSubjects.map((subject) => ({ subject, sessions: 0, pct: 0 }))
        )
          .slice(0, 5)
          .map((s, idx) => ({
            title: `${idx === 0 ? 'Most · ' : ''}${s.subject || 'Subject'}`,
            detail: n(s.pct) > 0 ? `${n(s.pct)}% of subject activity` : '',
            value: n(s.sessions) > 0 ? String(n(s.sessions)) : '—',
          })),
        'No subject activity this week yet.',
      ),
    )}

    ${section(
      'Exams',
      `<div class="grid">
        ${tile('Exams written', String(n(m.examAttempts)))}
        ${tile('Average marks', n(m.examAttempts) > 0 ? marksOrPct((m.examMarks as any)?.avg, m.avgExamPct) : '—')}
        ${tile('Best marks', n(m.examAttempts) > 0 ? marksOrPct((m.examMarks as any)?.best, m.bestExamPct) : '—')}
      </div>
      ${listRows(exams.slice(0, 8), 'No exams written this week yet.')}`,
    )}

    ${section(
      'Offline Results',
      `<div class="grid">
        ${tile('OMR tests', String(n(m.omrAttempts)))}
        ${tile('Average marks', n(m.omrAttempts) > 0 ? marksOrPct((m.omrMarks as any)?.avg, m.omrAvgPct) : '—')}
        ${tile('Best marks', n(m.omrAttempts) > 0 ? marksOrPct((m.omrMarks as any)?.best, m.omrBestPct) : '—')}
      </div>
      ${
        n(m.omrBestRank) > 0
          ? `<p class="empty" style="margin-top:8px">Best rank this week: #${esc(n(m.omrBestRank))}</p>`
          : ''
      }
      ${listRows(omr.slice(0, 8), 'No Offline Results Assigned This Week Yet.')}`,
    )}

    ${section(
      'Content & progress',
      `<div class="grid">
        ${tile(
          'Most used subject',
          String(mostUsed?.subject || (topSubjects.length ? topSubjects[0] : '—')),
          mostUsed?.sessions ? `${n(mostUsed.sessions)} activities` : '',
        )}
        ${tile('Videos watched', String(n(m.videosWatched)))}
        ${tile('Chapters updated', String(n(m.chaptersCompleted)))}
        ${tile('Current streak', n(m.streak) > 0 ? `${n(m.streak)} days` : '0')}
        ${tile('Mastery', `${n(m.masteryPct)}%`)}
        ${tile('Homework submitted', String(n(m.homeworkSubmissions)))}
      </div>`,
    )}

    ${highlightsBlock}
    ${shellEnd}`;
}

type LayoutBlock = { top: number; bottom: number; heading?: boolean };

/** Tiles, list rows, headings and boxes that must not be cut by a page break (CSS px). */
function collectLayoutBlocks(root: HTMLElement): LayoutBlock[] {
  const base = root.getBoundingClientRect().top;
  const blocks: LayoutBlock[] = [];
  root.querySelectorAll<HTMLElement>('.hero, .section > h2, .tile, .list li, .highlights, .empty, .footer').forEach((el) => {
    const r = el.getBoundingClientRect();
    blocks.push({ top: r.top - base, bottom: r.bottom - base, heading: el.tagName === 'H2' });
  });
  return blocks;
}

/**
 * Page ends in CSS px. A page used to be a fixed-height slice, which cut tile
 * rows in half ("Exams written" on one page, its "1" on the next). Now each
 * page ends before the first block that would cross it, and a section heading
 * is never left alone at the bottom.
 */
function pageBreaks(totalPx: number, pagePx: number, blocks: LayoutBlock[]): number[] {
  const ends: number[] = [];
  let start = 0;
  while (start < totalPx - 1) {
    const limit = start + pagePx;
    if (limit >= totalPx) {
      ends.push(totalPx);
      break;
    }
    let end = limit;
    const crossing = blocks.filter((b) => b.top < end && b.bottom > end && b.top > start);
    if (crossing.length) end = Math.min(...crossing.map((b) => b.top)) - 4;
    const orphan = blocks.find((b) => b.heading && b.top > start && b.top < end && end - b.top < 48);
    if (orphan) end = orphan.top - 4;
    // Never make a near-empty page (one block taller than a page is cut as before).
    if (end - start < pagePx * 0.35) end = limit;
    ends.push(end);
    start = end;
  }
  return ends;
}

function addCanvasPages(pdf: jsPDF, canvas: HTMLCanvasElement, blocks: LayoutBlock[] = [], cssWidth = 794) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const innerW = pageW - margin * 2;
  const imgW = innerW;
  const pageInnerH = pageH - margin * 2;
  const canvasPerCss = canvas.width / cssWidth;
  const pagePx = (pageInnerH * cssWidth) / imgW;
  const ends = pageBreaks(canvas.height / canvasPerCss, pagePx, blocks);

  let startCss = 0;
  for (let page = 0; page < ends.length; page += 1) {
    if (page > 0) pdf.addPage();
    const srcY = startCss * canvasPerCss;
    const srcH = Math.min(canvas.height - srcY, (ends[page] - startCss) * canvasPerCss);
    startCss = ends[page];
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = Math.max(1, Math.floor(srcH));
    const ctx = slice.getContext('2d');
    if (!ctx) continue;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
    const sliceH = (slice.height * imgW) / slice.width;
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, sliceH);
  }
}

export async function downloadWeeklyReportPdf(input: WeeklyReportPdfInput): Promise<string> {
  const html = buildWeeklyReportHtml(input);
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:794px;background:#fff;z-index:-1;opacity:1;';
  host.innerHTML = html;
  document.body.appendChild(host);

  try {
    const target = (host.querySelector('.sheet') as HTMLElement) || host;
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: 794,
      windowWidth: 794,
    });
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    addCanvasPages(pdf, canvas, collectLayoutBlocks(target), 794);
    const slug = String(input.studentName || input.title || 'weekly-report')
      .replace(/[^\w.-]+/g, '_')
      .slice(0, 48);
    const filename = `${slug || 'weekly'}_AsliLearn_Weekly_Report_${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;
    pdf.save(filename);
    return filename;
  } finally {
    host.remove();
  }
}

import ExcelJS from 'exceljs';
import type { SchoolAnalysisExamResult } from './school-performance-analysis-data';
import {
  buildExamAnalyticsHandoffReport,
  formatHandoffNumber,
  formatHandoffPct,
  type ExamAnalyticsHandoffReport,
  type HandoffIndividualReport,
} from './exam-analytics-handoff';

const COLORS = {
  titleBg: 'FF1F4E79',
  sectionBg: 'FF2F5496',
  headerBg: 'FF4472C4',
  white: 'FFFFFFFF',
  labelBg: 'FFE7E6E6',
  correctBg: 'FFC6EFCE',
  correctText: 'FF006100',
  wrongBg: 'FFFFC7CE',
  wrongText: 'FF9C0006',
  leftBg: 'FFBDD7EE',
  leftText: 'FF1F4E79',
  excellentBg: 'FFC6EFCE',
  excellentText: 'FF006100',
  goodBg: 'FFE2EFDA',
  goodText: 'FF375623',
  averageBg: 'FFFFF2CC',
  averageText: 'FF9C6500',
  poorBg: 'FFFFC7CE',
  poorText: 'FF9C0006',
  border: 'FFB4B4B4',
  zebra: 'FFF8F9FA',
};

type FillArgb = { type: 'pattern'; pattern: 'solid'; fgColor: { argb: string } };

const solidFill = (argb: string): FillArgb => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb },
});

const thinBorder = {
  top: { style: 'thin' as const, color: { argb: COLORS.border } },
  left: { style: 'thin' as const, color: { argb: COLORS.border } },
  bottom: { style: 'thin' as const, color: { argb: COLORS.border } },
  right: { style: 'thin' as const, color: { argb: COLORS.border } },
};

const styleCell = (
  cell: ExcelJS.Cell,
  opts: {
    bold?: boolean;
    size?: number;
    fill?: string;
    color?: string;
    align?: 'left' | 'center' | 'right';
    border?: boolean;
    wrap?: boolean;
  } = {},
) => {
  cell.font = {
    bold: opts.bold ?? false,
    size: opts.size ?? 11,
    color: opts.color ? { argb: opts.color } : { argb: 'FF000000' },
    name: 'Calibri',
  };
  if (opts.fill) cell.fill = solidFill(opts.fill);
  cell.alignment = {
    vertical: 'middle',
    horizontal: opts.align ?? 'center',
    wrapText: opts.wrap ?? false,
  };
  if (opts.border !== false) cell.border = thinBorder;
};

const accuracyFill = (pct01: number): { fill: string; color: string } => {
  const pct = pct01 * 100;
  if (pct >= 70) return { fill: COLORS.excellentBg, color: COLORS.excellentText };
  if (pct >= 55) return { fill: COLORS.goodBg, color: COLORS.goodText };
  if (pct >= 40) return { fill: COLORS.averageBg, color: COLORS.averageText };
  return { fill: COLORS.poorBg, color: COLORS.poorText };
};

const mergeBanner = (sheet: ExcelJS.Worksheet, row: number, text: string, colCount: number) => {
  if (colCount > 1) sheet.mergeCells(row, 1, row, colCount);
  const cell = sheet.getCell(row, 1);
  cell.value = text;
  styleCell(cell, { bold: true, fill: COLORS.sectionBg, color: COLORS.white, align: 'left', size: 12 });
  sheet.getRow(row).height = 24;
};

const writeHeaderRow = (sheet: ExcelJS.Worksheet, row: number, headers: string[]) => {
  headers.forEach((header, idx) => {
    const cell = sheet.getCell(row, idx + 1);
    cell.value = header;
    styleCell(cell, { bold: true, fill: COLORS.headerBg, color: COLORS.white });
  });
  sheet.getRow(row).height = 22;
};

const writeDataRow = (
  sheet: ExcelJS.Worksheet,
  row: number,
  values: unknown[],
  opts?: {
    zebra?: boolean;
    accuracyCols?: Record<number, number>;
    leftAlignCols?: number[];
  },
) => {
  values.forEach((value, idx) => {
    const col = idx + 1;
    const cell = sheet.getCell(row, col);
    cell.value = value as ExcelJS.CellValue;
    const align = opts?.leftAlignCols?.includes(col) ? 'left' : 'center';
    const acc = opts?.accuracyCols?.[col];
    if (acc != null) {
      const tone = accuracyFill(acc);
      styleCell(cell, { bold: true, fill: tone.fill, color: tone.color, align });
    } else {
      styleCell(cell, { fill: opts?.zebra ? COLORS.zebra : undefined, align });
    }
  });
};

const setColumnWidths = (sheet: ExcelJS.Worksheet, widths: number[]) => {
  widths.forEach((width, idx) => {
    sheet.getColumn(idx + 1).width = width;
  });
};

const safeSheetName = (raw: string, fallback: string) => {
  const cleaned = String(raw || '')
    .replace(/[\\/*?:[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 28);
  return cleaned || fallback;
};

function buildExecutiveSheet(workbook: ExcelJS.Workbook, report: ExamAnalyticsHandoffReport) {
  const sheet = workbook.addWorksheet('Executive Dashboard', {
    properties: { defaultRowHeight: 20 },
  });
  let row = 1;
  const maxCol = 17;

  sheet.mergeCells(row, 1, row, maxCol);
  const title = sheet.getCell(row, 1);
  title.value = `${report.examTitle.toUpperCase()} | EXECUTIVE ANALYTICS DASHBOARD`;
  styleCell(title, { bold: true, size: 14, fill: COLORS.titleBg, color: COLORS.white, align: 'left' });
  sheet.getRow(row).height = 30;
  row += 2;

  const meta = [
    'Students',
    report.studentCount,
    'Questions / Student',
    report.questionsPerStudent,
    'Question Records',
    report.questionRecords,
    'Subjects',
    report.subjectCount,
    'Attempts',
    report.totalAttempts,
    'Exam Date',
    report.examDateLabel,
    'Class',
    report.classLabel,
    'Student Reports',
    report.studentCount,
  ];
  meta.forEach((value, idx) => {
    const cell = sheet.getCell(row, idx + 1);
    cell.value = value as ExcelJS.CellValue;
    styleCell(cell, {
      bold: idx % 2 === 0,
      fill: idx % 2 === 0 ? COLORS.labelBg : undefined,
      align: 'center',
    });
  });
  row += 2;

  mergeBanner(sheet, row, 'CLASS PERFORMANCE', 8);
  row += 1;
  writeHeaderRow(sheet, row, [
    'Overall Accuracy',
    'Recorded Attempt Rate',
    'Attempted Precision',
    'Recorded Left Rate',
    'Avg Time/Q',
    'Median Accuracy',
    'Accuracy-Time Corr.',
    'Students >=50%',
  ]);
  row += 1;
  writeDataRow(
    sheet,
    row,
    [
      formatHandoffPct(report.classAccuracy),
      formatHandoffPct(report.classAttemptRate),
      formatHandoffPct(report.classPrecision),
      formatHandoffPct(report.classLeftRate),
      `${formatHandoffNumber(report.classAvgTimeSec)}s`,
      formatHandoffPct(report.medianAccuracy),
      formatHandoffNumber(report.accuracyTimeCorr, 2),
      report.studentsAtLeast50,
    ],
    { accuracyCols: { 1: report.classAccuracy, 3: report.classPrecision } },
  );
  row += 2;

  mergeBanner(sheet, row, 'WHAT THE EXAM IS SHOWCASING', 4);
  row += 1;
  writeHeaderRow(sheet, row, ['Dimension', 'Measured Signal', 'Interpretation', 'Academic Use']);
  row += 1;
  for (const item of report.showcase) {
    writeDataRow(sheet, row, [item.dimension, item.signal, item.interpretation, item.use], {
      zebra: row % 2 === 0,
      leftAlignCols: [1, 2, 3, 4],
    });
    sheet.getRow(row).height = 36;
    row += 1;
  }
  row += 1;

  mergeBanner(sheet, row, 'SUBJECT DIAGNOSTIC', 14);
  row += 1;
  writeHeaderRow(sheet, row, [
    'Subject',
    'Total Records',
    'Correct',
    'Wrong',
    'Left',
    'Accuracy',
    'Recorded Attempt Rate',
    'Attempted Precision',
    'Recorded Left Rate',
    'Avg Time/Q',
    'Correct / Est. Active Min',
    'Zero-Correct Students',
    'Students >=50%',
    'Key Reading',
  ]);
  row += 1;
  for (const subj of report.subjectRows) {
    writeDataRow(
      sheet,
      row,
      [
        subj.label,
        subj.total,
        subj.correct,
        subj.wrong,
        subj.left,
        formatHandoffPct(subj.accuracy),
        formatHandoffPct(subj.attemptRate),
        formatHandoffPct(subj.precision),
        formatHandoffPct(subj.leftRate),
        formatHandoffNumber(subj.avgTimeSec),
        formatHandoffNumber(subj.correctPerActiveMin, 2),
        subj.zeroCorrectStudents,
        subj.studentsAtLeast50,
        subj.keyReading,
      ],
      {
        zebra: row % 2 === 0,
        accuracyCols: { 6: subj.accuracy },
        leftAlignCols: [1, 14],
      },
    );
    row += 1;
  }
  row += 1;

  mergeBanner(sheet, row, 'STUDENT COHORT DIAGNOSTIC', maxCol);
  row += 1;
  const cohortHeaders = [
    'Rank',
    'Student',
    'Accuracy',
    'Percentile',
    'Attempt Rate',
    'Precision',
    'Avg Time/Q',
    'Accuracy Gap',
    ...report.subjectLabels.map((label) => `${label} Marks`),
    'Strongest',
    'Weakest',
    'Spread',
    'Pace-Accuracy',
    'Cohort Band',
  ];
  writeHeaderRow(sheet, row, cohortHeaders);
  row += 1;
  for (const student of report.students) {
    writeDataRow(
      sheet,
      row,
      [
        student.rank,
        student.name,
        formatHandoffPct(student.accuracy),
        formatHandoffNumber(student.percentile, 3),
        formatHandoffPct(student.attemptRate),
        formatHandoffPct(student.precision),
        formatHandoffNumber(student.avgTimeSec),
        formatHandoffPct(student.accuracyGap),
        ...report.subjects.map((key) =>
          Number((student.subjectMarks.get(key) ?? 0).toFixed(2)),
        ),
        student.strongestSubject,
        student.weakestSubject,
        formatHandoffPct(student.subjectSpread),
        student.paceAccuracyProfile,
        student.cohortBand,
      ],
      {
        zebra: row % 2 === 0,
        accuracyCols: { 3: student.accuracy },
        leftAlignCols: [2, 12 + report.subjects.length, 13 + report.subjects.length, 15 + report.subjects.length, 16 + report.subjects.length],
      },
    );
    row += 1;
  }
  row += 1;
  sheet.mergeCells(row, 1, row, maxCol);
  const note = sheet.getCell(row, 1);
  note.value = report.interpretationNote;
  styleCell(note, { align: 'left', wrap: true, fill: COLORS.labelBg });
  sheet.getRow(row).height = 28;

  setColumnWidths(sheet, [10, 28, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 14, 18, 14, 18, 14]);
}

function buildStudentDataSheet(workbook: ExcelJS.Workbook, report: ExamAnalyticsHandoffReport) {
  const sheet = workbook.addWorksheet('Student Data');
  const headers = [
    'Rank',
    'Student',
    'Class',
    'Attempt',
    'Completed At',
    'Total',
    'Correct',
    'Wrong',
    'Left',
    'Accuracy',
    'Avg Time/Q (s)',
    ...report.subjectLabels.map((label) => `${label} Marks`),
    'Attempted',
    'Recorded Attempt Rate',
    'Attempted Precision',
    'Wrong / Attempted',
    'Correct / Est. Active Min',
    'Accuracy Gap vs Class',
    'Time Gap vs Class (s)',
    'Subject Spread',
    'Percentile Position',
    'Strongest Subject',
    'Weakest Subject',
    'Pace-Accuracy Profile',
    'Cohort Band',
  ];
  writeHeaderRow(sheet, 1, headers);
  let row = 2;
  for (const student of report.students) {
    writeDataRow(
      sheet,
      row,
      [
        student.rank,
        student.name,
        student.classNumber,
        student.attemptLabel,
        student.completedAt,
        student.total,
        student.correct,
        student.wrong,
        student.left,
        formatHandoffPct(student.accuracy),
        formatHandoffNumber(student.avgTimeSec),
        ...report.subjects.map((key) =>
          Number((student.subjectMarks.get(key) ?? 0).toFixed(2)),
        ),
        student.attempted,
        formatHandoffPct(student.attemptRate),
        formatHandoffPct(student.precision),
        formatHandoffPct(student.wrongBurden),
        formatHandoffNumber(student.correctPerActiveMin, 2),
        formatHandoffPct(student.accuracyGap),
        formatHandoffNumber(student.timeGap),
        formatHandoffPct(student.subjectSpread),
        formatHandoffNumber(student.percentile, 3),
        student.strongestSubject,
        student.weakestSubject,
        student.paceAccuracyProfile,
        student.cohortBand,
      ],
      {
        zebra: row % 2 === 0,
        accuracyCols: { 10: student.accuracy },
        leftAlignCols: [2, 3, 4, 5],
      },
    );
    row += 1;
  }
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, row - 1), column: headers.length },
  };
  setColumnWidths(
    sheet,
    headers.map((h, i) => (i === 1 ? 30 : i === 4 ? 22 : h.length > 18 ? 18 : 12)),
  );
}

function buildSubjectDataSheet(workbook: ExcelJS.Workbook, report: ExamAnalyticsHandoffReport) {
  const sheet = workbook.addWorksheet('Subject Data');
  writeHeaderRow(sheet, 1, [
    'Subject',
    'Total Responses',
    'Correct',
    'Wrong',
    'Left',
    'Accuracy',
    'Recorded Attempt Rate',
    'Attempted Precision',
    'Wrong / Attempted',
    'Recorded Left Rate',
    'Avg Time/Q (s)',
    'Correct / Est. Active Min',
    'Zero-Correct Students',
    'Students >=50%',
  ]);
  let row = 2;
  for (const subj of report.subjectRows) {
    writeDataRow(
      sheet,
      row,
      [
        subj.label,
        subj.total,
        subj.correct,
        subj.wrong,
        subj.left,
        formatHandoffPct(subj.accuracy),
        formatHandoffPct(subj.attemptRate),
        formatHandoffPct(subj.precision),
        formatHandoffPct(subj.wrongBurden),
        formatHandoffPct(subj.leftRate),
        formatHandoffNumber(subj.avgTimeSec),
        formatHandoffNumber(subj.correctPerActiveMin, 2),
        subj.zeroCorrectStudents,
        subj.studentsAtLeast50,
      ],
      { zebra: row % 2 === 0, accuracyCols: { 6: subj.accuracy }, leftAlignCols: [1] },
    );
    row += 1;
  }
  setColumnWidths(sheet, [16, 14, 10, 10, 10, 12, 16, 16, 14, 14, 12, 16, 14, 12]);
}

function buildIndividualSheet(
  workbook: ExcelJS.Workbook,
  individual: HandoffIndividualReport,
  sheetName: string,
) {
  const sheet = workbook.addWorksheet(sheetName);
  const student = individual.student;
  let row = 1;

  sheet.mergeCells(row, 1, row, 8);
  const title = sheet.getCell(row, 1);
  title.value = `${student.name.toUpperCase()} | INDIVIDUAL EXAM ANALYSIS`;
  styleCell(title, { bold: true, size: 13, fill: COLORS.titleBg, color: COLORS.white, align: 'left' });
  sheet.getRow(row).height = 28;
  row += 2;

  writeDataRow(
    sheet,
    row,
    [
      'Rank',
      student.rank,
      'Percentile',
      formatHandoffNumber(student.percentile, 3),
      'Cohort Band',
      student.cohortBand,
      'Completed',
      student.completedAt,
    ],
    { leftAlignCols: [1, 3, 5, 7] },
  );
  row += 2;

  mergeBanner(sheet, row, 'PERFORMANCE SNAPSHOT', 8);
  row += 1;
  writeHeaderRow(sheet, row, [
    'Total',
    'Correct',
    'Wrong',
    'Recorded Left',
    'Accuracy',
    'Recorded Attempt Rate',
    'Precision',
    'Avg Time/Q',
  ]);
  row += 1;
  writeDataRow(
    sheet,
    row,
    [
      student.total,
      student.correct,
      student.wrong,
      student.left,
      formatHandoffPct(student.accuracy),
      formatHandoffPct(student.attemptRate),
      formatHandoffPct(student.precision),
      formatHandoffNumber(student.avgTimeSec),
    ],
    { accuracyCols: { 5: student.accuracy, 7: student.precision } },
  );
  row += 2;

  mergeBanner(sheet, row, 'SUBJECT DIAGNOSTIC', 7);
  row += 1;
  writeHeaderRow(sheet, row, [
    'Subject',
    'Student Marks',
    'Student Accuracy',
    'Class Accuracy',
    'Gap',
    'Subject Rank',
    'Position',
  ]);
  row += 1;
  for (const diag of individual.subjectDiagnostics) {
    writeDataRow(
      sheet,
      row,
      [
        diag.label,
        formatHandoffNumber(diag.studentMarks),
        formatHandoffPct(diag.studentAccuracy),
        formatHandoffPct(diag.classAccuracy),
        formatHandoffPct(diag.gap),
        diag.subjectRank,
        diag.position,
      ],
      {
        zebra: row % 2 === 0,
        accuracyCols: { 3: diag.studentAccuracy },
        leftAlignCols: [1, 7],
      },
    );
    row += 1;
  }
  row += 1;

  mergeBanner(sheet, row, 'EXAM BEHAVIOUR', 4);
  row += 1;
  writeHeaderRow(sheet, row, ['Metric', 'Student', 'Class', 'Reading']);
  row += 1;
  for (const item of individual.behaviour) {
    const studentVal =
      typeof item.student === 'number' && item.metric.toLowerCase().includes('time')
        ? formatHandoffNumber(item.student)
        : typeof item.student === 'number' && item.metric.toLowerCase().includes('correct')
          ? formatHandoffNumber(item.student, 2)
          : typeof item.student === 'number'
            ? formatHandoffPct(item.student)
            : item.student;
    const classVal =
      typeof item.classValue === 'number' && String(item.metric).toLowerCase().includes('time')
        ? formatHandoffNumber(item.classValue)
        : typeof item.classValue === 'number' && String(item.metric).toLowerCase().includes('correct')
          ? formatHandoffNumber(item.classValue, 2)
          : typeof item.classValue === 'number'
            ? formatHandoffPct(item.classValue)
            : item.classValue;
    writeDataRow(sheet, row, [item.metric, studentVal, classVal, item.reading], {
      zebra: row % 2 === 0,
      leftAlignCols: [1, 4],
    });
    row += 1;
  }
  row += 1;

  if (individual.questions?.length) {
    mergeBanner(sheet, row, 'QUESTION-BY-QUESTION', 6);
    row += 1;
    writeHeaderRow(sheet, row, [
      'Q#',
      'Status',
      'Subject',
      'Chapter',
      'Time (s)',
      'Question',
    ]);
    row += 1;
    for (const q of individual.questions) {
      const statusLabel =
        q.status === 'correct' ? 'Correct' : q.status === 'wrong' ? 'Wrong' : 'Unattempted';
      writeDataRow(
        sheet,
        row,
        [
          q.questionNumber,
          statusLabel,
          q.subject || '—',
          q.chapter || '—',
          q.timeTaken != null ? q.timeTaken : '—',
          q.questionText,
        ],
        {
          zebra: row % 2 === 0,
          leftAlignCols: [2, 3, 4, 6],
        },
      );
      sheet.getRow(row).height = 30;
      row += 1;
    }
    row += 1;
  }

  mergeBanner(sheet, row, 'PRIORITY ACTION PLAN', 3);
  row += 1;
  writeHeaderRow(sheet, row, ['Priority', 'Focus', 'Recommended Action']);
  row += 1;
  for (const action of individual.actions) {
    writeDataRow(sheet, row, [action.priority, action.focus, action.action], {
      zebra: row % 2 === 0,
      leftAlignCols: [2, 3],
    });
    sheet.getRow(row).height = 28;
    row += 1;
  }

  setColumnWidths(sheet, [18, 16, 16, 16, 14, 16, 18, 22]);
}

export function schoolPerformanceAnalysisExcelFilename(examTitle: string): string {
  const slug = String(examTitle || 'exam')
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  const date = new Date().toISOString().slice(0, 10);
  return `${slug || 'exam'}_Exam_Analytics_${date}.xlsx`;
}

export async function buildSchoolPerformanceAnalysisExcel(
  examTitle: string,
  results: SchoolAnalysisExamResult[],
): Promise<ArrayBuffer | null> {
  const report = buildExamAnalyticsHandoffReport(examTitle, results);
  if (!report) return null;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ASLI Learn';
  workbook.created = new Date();
  workbook.modified = new Date();

  buildExecutiveSheet(workbook, report);
  buildStudentDataSheet(workbook, report);
  buildSubjectDataSheet(workbook, report);

  const usedNames = new Set(
    workbook.worksheets.map((ws) => ws.name.toLowerCase()),
  );
  for (const individual of report.individuals) {
    const prefix = String(individual.student.rank).padStart(2, '0');
    let name = safeSheetName(`${prefix} ${individual.student.name}`, `${prefix} Student`);
    let suffix = 2;
    while (usedNames.has(name.toLowerCase())) {
      name = safeSheetName(`${prefix} ${individual.student.name} ${suffix}`, `${prefix} Student ${suffix}`);
      suffix += 1;
    }
    usedNames.add(name.toLowerCase());
    buildIndividualSheet(workbook, individual, name);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

export async function downloadSchoolPerformanceAnalysisExcel(
  examTitle: string,
  results: SchoolAnalysisExamResult[],
): Promise<boolean> {
  const buffer = await buildSchoolPerformanceAnalysisExcel(examTitle, results);
  if (!buffer) return false;

  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer as ArrayLike<number>);
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = schoolPerformanceAnalysisExcelFilename(examTitle);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}

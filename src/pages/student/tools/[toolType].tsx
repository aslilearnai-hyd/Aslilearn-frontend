import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useRoute } from 'wouter';
import StudentShell from '@/components/layout/StudentShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, ArrowLeft, BookOpen, Sparkles, Download, Copy, Check, BookMarked, Brain, Calendar, HelpCircle, FileText, Key, ClipboardList, CheckCircle2, Layout, Target, FileSpreadsheet, FileDown, Loader2, RotateCcw, Share2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { API_BASE_URL } from '@/lib/api-config';
import { getAuthToken } from '@/lib/auth-utils';
import {
  isAiToolApiFailureInline,
  isAiToolClientValidationError,
  isAiToolInlineOnlyError,
  resolveAiToolStudentEmptyMessage,
  sanitizeAiToolUserFacingError,
  validateAiToolForm,
} from '@/lib/ai-tool-generate';
import {
  buildAiToolViewerContent,
  pickAiToolRawData,
  resolveAiToolDisplayState,
} from '@/lib/ai-tool-response-payload';
import { buildTeacherToolWordText } from '@/lib/ai-tool-teacher-export';
import {
  getAiToolBoardOptions,
  getDefaultAiToolBoard,
  mapGradeLevelForIitBoard,
  parseAiToolClassNumber,
  resolveCurriculumBoardForAiTools,
  resolveIsAsliPrepExclusive,
  resolveSchoolIitCategories,
  resolveStudentCurriculumGradeLevel,
  shouldShowIitTrackField,
} from '@/lib/school-program';
import {
  useCurriculumCascade,
  normalizeGradeForCurriculum,
} from '@/hooks/use-curriculum-cascade';
import { formatIitCategoryLabel } from '@/lib/products';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatAiToolText } from '@/lib/title-case';
import { motion } from 'framer-motion';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { formatClassroomScienceText } from '@/lib/exam-text-normalize';
import { saveAs } from 'file-saver';
import { AiToolResultShell } from '@/components/ai-tool-result-shell';
import { AiToolV2InputSummary } from '@/components/ai-v2';
import {
  AiToolFormField,
  AiToolGenerateFormCard,
  AiToolGeneratePageChrome,
} from '@/components/ai-tools/ai-tool-generate-form';
import { GeneratorRecordViewer } from '@/components/super-admin/generator-record-viewer';
import { buildAiToolViewerRecord } from '@/lib/build-ai-tool-viewer-record';
import { resolveStudentAiApiToolType } from '@/lib/student-ai-tool-routes';
import type { AiToolGenerationMeta } from '@/lib/ai-tool-generation-summary';
import {
  filterSubjectsForAiTool,
  filterSubjectsForIitBoard,
  isIitAiToolBoard,
  isLanguageExcludedTool,
  isStoryLanguageTool,
  isStoryPassageLanguageSubject,
  READING_PRACTICE_TOOL_ID,
} from '@/lib/ai-tool-subject-rules';
import { sanitizeAiHtml } from '@/lib/sanitize-ai-html';

/** Radix Select shows a blank label when `value` is not listed in items (e.g. URL-preset or taxonomy drift). */
function mergeSelectedIntoOptions(options: string[], selected: unknown): string[] {
  const v = typeof selected === 'string' ? selected.trim() : '';
  if (!v) return options;
  if (options.includes(v)) return options;
  return [v, ...options];
}

type RenderMarkdownVariant = 'default' | 'smart-study-guide';

// Import the renderMarkdown function from teacher tool page
const renderMarkdown = (text: string, variant: RenderMarkdownVariant = 'default') => {
  if (!text) return '';
  const isSmartStudyGuide = variant === 'smart-study-guide';
  
  // Handle JSON-wrapped content (for special viewers, but extract formatted content for display)
  let processedText = text;
  try {
    // Check if content is a JSON string with formatted property
    if (text.trim().startsWith('{') && text.includes('"formatted"')) {
      const parsed = JSON.parse(text);
      if (parsed.formatted) {
        processedText = parsed.formatted;
      }
    }
  } catch (e) {
    // Not JSON, use as-is
    processedText = text;
  }
  
  // If content starts with HTML tags (from formatters), return it directly without markdown processing
  const trimmed = processedText.trim();
  if (trimmed.startsWith('<div') || trimmed.startsWith('<h1') || trimmed.startsWith('<h2') || trimmed.startsWith('<h3') || trimmed.startsWith('<p') || trimmed.startsWith('<span')) {
    return sanitizeAiHtml(processedText);
  }
  
  // Clean up escaped LaTeX (convert \\ to \ for proper rendering)
  // But be careful - only unescape within math expressions
  
  // First, process block math ($$...$$) across multiple lines
  processedText = processedText.replace(/\$\$([\s\S]*?)\$\$/g, (match, mathContent) => {
    try {
      // Unescape LaTeX (convert \\ to \)
      const cleanedMath = mathContent.trim().replace(/\\\\/g, '\\');
      const rendered = katex.renderToString(cleanedMath, {
        displayMode: true,
        throwOnError: false
      });
      return `__MATH_BLOCK__${rendered}__MATH_BLOCK__`;
    } catch (e) {
      return `__MATH_ERROR__${mathContent}__MATH_ERROR__`;
    }
  });
  
  // Process HTML card markers for Short Notes (before line processing)
  // Replace the markers and keep the HTML content as-is for direct rendering
  processedText = processedText.replace(/__NOTE_CARD_START__\n([\s\S]*?)\n__NOTE_CARD_END__/g, (match, cardContent) => {
    // Return HTML directly without escaping - it will be rendered as HTML
    return `__HTML_CARD__${cardContent.trim()}__HTML_CARD__`;
  });
  
  const lines = processedText.split('\n');
  let html = '';
  let inList = false;
  let listType: 'ul' | 'ol' | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();
    
    // Check if this line contains a math block
    const hasMathBlock = line.includes('__MATH_BLOCK__') || line.includes('__MATH_ERROR__');
    
    // Check if this line contains HTML card marker
    const hasHTMLCard = line.includes('__HTML_CARD__');
    
    // Restore math blocks first
    if (hasMathBlock) {
      closeList();
      line = line.replace(/__MATH_BLOCK__(.*?)__MATH_BLOCK__/g, '<div class="my-4 overflow-x-auto">$1</div>');
      line = line.replace(/__MATH_ERROR__(.*?)__MATH_ERROR__/g, '<div class="my-4 p-2 bg-red-50 border border-red-200 rounded text-red-800 text-xs sm:text-sm">Math Error: $1</div>');
      html += line;
      continue;
    }
    
    // Process HTML cards - extract and render directly
    if (hasHTMLCard) {
      closeList();
      line = line.replace(/__HTML_CARD__(.*?)__HTML_CARD__/g, '$1');
      html += line + '\n';
      continue;
    }
    
    // Check if this line contains raw HTML (from note cards that span multiple lines or formatters)
    const hasHTML = line.includes('<div') || line.includes('</div>') || line.includes('<h1') || line.includes('</h1>') || line.includes('<h2') || line.includes('</h2>') || line.includes('<h3') || line.includes('</h3>') || line.includes('<ul') || line.includes('</ul>') || line.includes('<li') || line.includes('</li>') || line.includes('<p') || line.includes('</p>') || line.includes('<span') || line.includes('</span>') || line.includes('<strong') || line.includes('</strong>') || line.includes('style=');
    
    // If line contains HTML, add it directly without escaping (for note cards and formatters)
    if (hasHTML) {
      closeList();
      html += line + '\n';
      continue;
    }

    // Smart guide: convert numbered chapter rows to section banners
    if (isSmartStudyGuide && /^\d+\.\s+.+/.test(trimmed) && !/^\d+\.\s+\[[^\]]+\]\s+/i.test(trimmed)) {
      closeList();
      const sectionTitle = trimmed.replace(/^\d+\.\s+/, '').trim();
      html += `<div class="my-6 rounded-2xl border border-indigo-200/70 bg-gradient-to-r from-indigo-50 to-cyan-50 px-4 py-3 sm:px-5">
        <h2 class="m-0 text-base font-bold text-indigo-900 sm:text-lg">${formatInline(sectionTitle)}</h2>
      </div>`;
      continue;
    }

    // Emphasize generated question rows for better scanability
    if (/^\d+\.\s+\[[^\]]+\]\s+/i.test(trimmed)) {
      closeList();
      html += `<div class="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">${formatInline(trimmed)}</div>`;
      continue;
    }

    // Render answer lines as compact highlighted blocks
    if (/^answer\s*:/i.test(trimmed)) {
      closeList();
      const answerBody = trimmed.replace(/^answer\s*:\s*/i, '');
      html += `<div class="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-sm text-slate-800"><span class="font-semibold text-emerald-800">Answer:</span> ${formatInline(answerBody)}</div>`;
      continue;
    }
    
    if (trimmed.startsWith('#### ')) {
      if (inList) {
        html += listType === 'ul' ? '</ul>' : '</ol>';
        inList = false;
        listType = null;
      }
      html += `<h4 class="text-sm sm:text-base font-bold text-gray-900 mt-4 mb-2">${formatInline(trimmed.substring(5))}</h4>`;
    } else if (trimmed.startsWith('### ')) {
      if (inList) {
        html += listType === 'ul' ? '</ul>' : '</ol>';
        inList = false;
        listType = null;
      }
      html += `<h3 class="text-base sm:text-lg font-bold text-gray-900 mt-6 mb-3">${formatInline(trimmed.substring(4))}</h3>`;
    } else if (trimmed.startsWith('## ')) {
      if (inList) {
        html += listType === 'ul' ? '</ul>' : '</ol>';
        inList = false;
        listType = null;
      }
      html += `<h2 class="text-lg sm:text-xl font-bold text-gray-900 mt-8 mb-4 border-b border-gray-200 pb-2">${formatInline(trimmed.substring(3))}</h2>`;
    } else if (trimmed.startsWith('# ')) {
      if (inList) {
        html += listType === 'ul' ? '</ul>' : '</ol>';
        inList = false;
        listType = null;
      }
      html += `<h1 class="text-xl sm:text-2xl font-bold text-gray-900 mt-8 mb-4">${formatInline(trimmed.substring(2))}</h1>`;
    } else if (/^\d+\.\s+/.test(trimmed)) {
      if (!inList || listType !== 'ol') {
        if (inList) {
          html += listType === 'ul' ? '</ul>' : '</ol>';
        }
        html += isSmartStudyGuide
          ? '<ol class="mb-5 ml-6 list-decimal space-y-2 text-[15px] text-slate-700 marker:font-semibold marker:text-indigo-500">'
          : '<ol class="list-decimal ml-6 mb-4 space-y-1">';
        inList = true;
        listType = 'ol';
      }
      const content = trimmed.replace(/^\d+\.\s+/, '');
      html += `<li class="${isSmartStudyGuide ? 'pl-1' : 'mb-1'}">${formatInline(content)}</li>`;
    } else if (/^[-*]\s+/.test(trimmed)) {
      if (!inList || listType !== 'ul') {
        if (inList) {
          html += listType === 'ul' ? '</ul>' : '</ol>';
        }
        html += isSmartStudyGuide
          ? '<ul class="mb-6 grid gap-3 sm:grid-cols-2">'
          : '<ul class="list-disc ml-6 mb-4 space-y-1">';
        inList = true;
        listType = 'ul';
      }
      const content = trimmed.replace(/^[-*]\s+/, '');
      if (isSmartStudyGuide) {
        const conceptMatch = content.match(/^([A-Za-z][^—:\-.]{2,80})\s*[—:]\s+(.+)$/);
        if (conceptMatch) {
          html += `<li class="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
            <p class="mb-1 text-sm font-semibold tracking-tight text-indigo-900">${formatInline(conceptMatch[1].trim())}</p>
            <p class="m-0 text-[14px] leading-7 text-slate-700">${formatInline(conceptMatch[2].trim())}</p>
          </li>`;
        } else {
          html += `<li class="rounded-2xl border border-slate-200 bg-white p-4 text-[14px] leading-7 text-slate-700 shadow-sm">${formatInline(content)}</li>`;
        }
      } else {
        html += `<li class="mb-1">${formatInline(content)}</li>`;
      }
    } else if (!trimmed) {
      if (inList) {
        html += listType === 'ul' ? '</ul>' : '</ol>';
        inList = false;
        listType = null;
      }
      if (html && !html.endsWith('</p>') && !html.endsWith('</h1>') && !html.endsWith('</h2>') && !html.endsWith('</h3>') && !html.endsWith('</h4>') && !html.endsWith('</div>')) {
        html += '<br>';
      }
    } else {
      if (inList) {
        html += listType === 'ul' ? '</ul>' : '</ol>';
        inList = false;
        listType = null;
      }
      html += isSmartStudyGuide
        ? `<p class="mb-4 text-[15px] leading-8 text-slate-700">${formatInline(line)}</p>`
        : `<p class="mb-4 text-gray-700 leading-relaxed">${formatInline(line)}</p>`;
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
  
  function formatInline(text: string): string {
    // Don't process if it's already HTML (math blocks or note cards)
    if (text.includes('__MATH_BLOCK__') || text.includes('__MATH_ERROR__') || text.includes('__NOTE_CARD')) {
      return text;
    }
    
    // Escape HTML first
    let formatted = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Inline math ($...$) - but not if it's part of block math ($$)
    formatted = formatted.replace(/(?<!\$)\$(?!\$)([^$\n]+?)(?<!\$)\$(?!\$)/g, (match, mathContent) => {
      try {
        // Unescape LaTeX (convert \\ to \)
        const cleanedMath = mathContent.trim().replace(/\\\\/g, '\\');
        const rendered = katex.renderToString(cleanedMath, {
          displayMode: false,
          throwOnError: false
        });
        return rendered;
      } catch (e) {
        return `<span class="text-red-600 text-xs sm:text-sm">Math Error: ${mathContent}</span>`;
      }
    });
    
    // Code blocks
    formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre class="bg-gray-100 p-4 rounded-lg overflow-x-auto mb-2 text-xs sm:text-sm font-mono"><code>$1</code></pre>');
    
    // Inline code (but not if it's part of math)
    formatted = formatted.replace(/`([^`]+)`/g, (match, codeContent) => {
      // Check if this is inside a math expression
      if (match.includes('$')) return match;
      return `<code class="bg-gray-100 px-2 py-1 rounded text-xs sm:text-sm font-mono text-gray-800">${codeContent}</code>`;
    });
    
    // Bold
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>');
    
    // Italic (but not if part of bold)
    formatted = formatted.replace(/(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, '<em class="italic">$1</em>');
    
    return sanitizeAiHtml(formatted);
  }
  
  return sanitizeAiHtml(html);
};

const CLASS_OPTIONS = ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'];

const WHOLE_CHAPTER_VALUE = '__WHOLE_CHAPTER__';

interface ToolConfig {
  name: string;
  description: string;
  icon: any;
  fields: Array<{
    name: string;
    label: string;
    type: string;
    required?: boolean;
    placeholder?: string;
    options?: string[];
    dependsOn?: string;
    getOptions?: (value: string) => string[];
    isNCERT?: boolean; // If true, topic field should be populated from API
    isCascadeSubtopic?: boolean;
  }>;
}

type CitationItem = {
  index: number;
  subject: string;
  classLabel: string;
  chapter: string;
  score: string;
  preview: string;
};

const TOOL_CONFIGS: Record<string, ToolConfig> = {
  'smart-study-guide-generator': {
    name: 'Smart Study Guide Generator',
    description: '11-section premium study guides with concepts, formulae, practice MCQs, and revision notes',
    icon: BookMarked,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'topic', label: 'Topic *', type: 'select', required: true, placeholder: 'Select topic', isNCERT: true },
      { name: 'subTopic', label: 'Sub Topic (Optional)', type: 'select', required: false, placeholder: 'Whole chapter', isCascadeSubtopic: true }
    ]
  },
  'concept-breakdown-explainer': {
    name: 'Concept Breakdown Explainer',
    description: '9-section concept breakdown with steps, Indian-context examples, and thinking prompts',
    icon: Brain,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'topic', label: 'Topic *', type: 'select', required: true, placeholder: 'Select topic', isNCERT: true },
      { name: 'subTopic', label: 'Sub Topic (Optional)', type: 'select', required: false, placeholder: 'Whole chapter', isCascadeSubtopic: true }
    ]
  },
  'smart-qa-practice-generator': {
    name: 'Smart Q&A Practice Generator',
    description: 'Generate practice questions with detailed answers',
    icon: HelpCircle,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'topic', label: 'Topic *', type: 'select', required: true, placeholder: 'Select topic', isNCERT: true },
      { name: 'subTopic', label: 'Sub Topic (Optional)', type: 'select', required: false, placeholder: 'Whole chapter', isCascadeSubtopic: true },
      { name: 'questionCount', label: 'Number of Questions', type: 'number', placeholder: '10' },
      { name: 'difficulty', label: 'Difficulty', type: 'select', options: ['easy', 'medium', 'hard'] }
    ]
  },
  'chapter-summary-creator': {
    name: 'Chapter Summary Creator',
    description: 'Create concise summaries of chapters and topics',
    icon: FileText,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'chapter', label: 'Chapter/Topic *', type: 'select', required: true, placeholder: 'Select chapter/topic', isNCERT: true },
      { name: 'subTopic', label: 'Sub Topic (Optional)', type: 'select', required: false, placeholder: 'Whole chapter', isCascadeSubtopic: true }
    ]
  },
  'key-points-formula-extractor': {
    name: 'Key Points Extractor',
    description: '10-section revision sheet: concepts, definitions, formulae, keywords, exam points, and one-minute summary',
    icon: Key,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'topic', label: 'Topic *', type: 'select', required: true, placeholder: 'Select topic', isNCERT: true },
      { name: 'subTopic', label: 'Sub Topic (Optional)', type: 'select', required: false, placeholder: 'Whole chapter', isCascadeSubtopic: true }
    ]
  },
  'quick-assignment-builder': {
    name: 'Quick Assignment Builder',
    description: '11-section assignment with concept questions, application tasks, rubric, and learning outcomes',
    icon: ClipboardList,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'topic', label: 'Topic *', type: 'select', required: true, placeholder: 'Select topic', isNCERT: true },
      { name: 'subTopic', label: 'Sub Topic (Optional)', type: 'select', required: false, placeholder: 'Whole chapter', isCascadeSubtopic: true }
    ]
  },
  'exam-readiness-checker': {
    name: 'Exam Readiness Checker',
    description: 'Assess your readiness for upcoming exams',
    icon: CheckCircle2,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'examType', label: 'Exam Type', type: 'select', options: ['Unit Test', 'Mid-Term', 'Final Exam', 'Board Exam', 'Competitive Exam'] },
      { name: 'examDate', label: 'Exam Date (Optional)', type: 'text', placeholder: 'e.g., 2025-03-15' }
    ]
  },
  'project-layout-designer': {
    name: 'Project Layout Designer',
    description: 'Design structured layouts for your projects',
    icon: Layout,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'projectTopic', label: 'Project Topic *', type: 'select', required: true, placeholder: 'Select project topic', isNCERT: true },
      { name: 'projectType', label: 'Project Type', type: 'select', options: ['Research', 'Science Experiment', 'Model', 'Presentation', 'Report'] }
    ]
  },
  'goal-motivation-planner': {
    name: 'Goal & Motivation Planner',
    description: 'Set goals and create motivation plans for success',
    icon: Target,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'goalType', label: 'Goal Type', type: 'select', options: ['Academic', 'Exam Preparation', 'Skill Development', 'Overall Improvement'] },
      { name: 'timeframe', label: 'Timeframe', type: 'select', options: ['1 week', '1 month', '3 months', '6 months', '1 year'] },
      { name: 'description', label: 'Goal Description (Optional)', type: 'textarea', placeholder: 'Describe your specific goals...' }
    ]
  },
  // Teacher AI Tools - Now available for students
  'worksheet-mcq-generator': {
    name: 'Worksheet & MCQ Generator',
    description: 'Generate worksheets with MCQs, Fill in the Blanks, and short-answer questions',
    icon: Sparkles,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'topic', label: 'Topic *', type: 'select', required: true, placeholder: 'Select topic', isNCERT: true },
      { name: 'subTopic', label: 'Sub Topic (Optional)', type: 'select', required: false, placeholder: 'Whole chapter', isCascadeSubtopic: true },
      { name: 'difficulty', label: 'Difficulty', type: 'select', options: ['easy', 'medium', 'hard'], placeholder: 'Select difficulty' }
    ]
  },
  'concept-mastery-helper': {
    name: 'Concept Mastery Helper',
    description: 'Break down complex concepts into digestible lessons',
    icon: Brain,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'topic', label: 'Topic *', type: 'select', required: true, placeholder: 'Select topic', isNCERT: true },
      { name: 'subTopic', label: 'Sub Topic (Optional)', type: 'select', required: false, placeholder: 'Whole chapter', isCascadeSubtopic: true }
    ]
  },
  'my-study-decks': {
    name: 'My Study Decks',
    description: '12-section study decks with flashcards, difficulty tags, and self-check',
    icon: BookMarked,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'topic', label: 'Topic *', type: 'select', required: true, placeholder: 'Select topic', isNCERT: true },
      { name: 'subTopic', label: 'Sub Topic (Optional)', type: 'select', required: false, placeholder: 'Whole chapter', isCascadeSubtopic: true }
    ]
  },
  'flashcard-generator': {
    name: 'My Study Decks',
    description: 'Legacy route — same as My Study Decks',
    icon: BookMarked,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'topic', label: 'Topic *', type: 'select', required: true, placeholder: 'Select topic', isNCERT: true },
      { name: 'subTopic', label: 'Sub Topic (Optional)', type: 'select', required: false, placeholder: 'Whole chapter', isCascadeSubtopic: true }
    ]
  },
  'short-notes-summaries-maker': {
    name: 'Short Notes & Summaries Maker',
    description: 'Condense complex topics into concise notes',
    icon: FileText,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'topic', label: 'Topic *', type: 'select', required: true, placeholder: 'Select topic', isNCERT: true },
      { name: 'subTopic', label: 'Sub Topic (Optional)', type: 'select', required: false, placeholder: 'Whole chapter', isCascadeSubtopic: true }
    ]
  },
  'homework-creator': {
    name: 'Homework Creator',
    description: 'Generate meaningful homework assignments',
    icon: ClipboardList,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'topic', label: 'Topic *', type: 'select', required: true, placeholder: 'Select topic', isNCERT: true },
      { name: 'subTopic', label: 'Sub Topic (Optional)', type: 'select', required: false, placeholder: 'Whole chapter', isCascadeSubtopic: true },
      { name: 'duration', label: 'Duration (Minutes)', type: 'number', placeholder: '30' }
    ]
  },
  'mock-test-builder': {
    name: 'Mock Test Builder',
    description: '12-section mock tests with question paper, answer key, solutions, and remedial guidance',
    icon: CheckCircle2,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'topic', label: 'Topic *', type: 'select', required: true, placeholder: 'Select topic', isNCERT: true },
      { name: 'subTopic', label: 'Sub Topic (Optional)', type: 'select', required: false, placeholder: 'Whole chapter', isCascadeSubtopic: true },
      { name: 'questionCount', label: 'Number of Questions', type: 'number', placeholder: '20' },
      { name: 'duration', label: 'Test Duration (minutes)', type: 'number', placeholder: '90' },
      { name: 'difficulty', label: 'Difficulty Mix', type: 'select', options: ['easy', 'medium', 'hard', 'mixed'] }
    ]
  },
  'exam-question-paper-generator': {
    name: 'Mock Test Builder',
    description: 'Legacy route — same as Mock Test Builder',
    icon: CheckCircle2,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'topic', label: 'Topic *', type: 'select', required: true, placeholder: 'Select topic', isNCERT: true },
      { name: 'subTopic', label: 'Sub Topic (Optional)', type: 'select', required: false, placeholder: 'Whole chapter', isCascadeSubtopic: true },
      { name: 'questionCount', label: 'Number of Questions', type: 'number', placeholder: '20' },
      { name: 'duration', label: 'Exam Duration (minutes)', type: 'number', placeholder: '90' },
      { name: 'difficulty', label: 'Difficulty Mix', type: 'select', options: ['easy', 'medium', 'hard', 'mixed'] }
    ]
  },
  'project-idea-lab': {
    name: 'Project Idea Lab',
    description: 'Discover student project ideas with safety, observation, and self-assessment sections',
    icon: Layout,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'topic', label: 'Topic *', type: 'select', required: true, placeholder: 'Select topic', isNCERT: true },
      { name: 'subTopic', label: 'Sub Topic (Optional)', type: 'select', required: false, placeholder: 'Whole chapter', isCascadeSubtopic: true }
    ]
  },
  'activity-project-generator': {
    name: 'Project Idea Lab',
    description: 'Discover student project ideas (legacy route)',
    icon: Layout,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'topic', label: 'Topic *', type: 'select', required: true, placeholder: 'Select topic', isNCERT: true },
      { name: 'subTopic', label: 'Sub Topic (Optional)', type: 'select', required: false, placeholder: 'Whole chapter', isCascadeSubtopic: true }
    ]
  },
  'reading-practice-room': {
    name: 'Reading Practice Room',
    description: 'Reading practice sets with passage, vocabulary, and recall/infer/connect questions (English, Hindi & Telugu only)',
    icon: FileText,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'topic', label: 'Topic *', type: 'select', required: true, placeholder: 'Select topic', isNCERT: true },
      { name: 'subTopic', label: 'Sub Topic (Optional)', type: 'select', required: false, placeholder: 'Whole chapter', isCascadeSubtopic: true }
    ]
  },
  'story-passage-creator': {
    name: 'Reading Practice Room',
    description: 'Legacy route — same as Reading Practice Room',
    icon: FileText,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'topic', label: 'Topic *', type: 'select', required: true, placeholder: 'Select topic', isNCERT: true },
      { name: 'subTopic', label: 'Sub Topic (Optional)', type: 'select', required: false, placeholder: 'Whole chapter', isCascadeSubtopic: true }
    ]
  },
  'study-schedule-maker': {
    name: 'Study Schedule Maker',
    description: 'Build a timed study schedule with concept slots, practice, and self-checkpoints',
    icon: Calendar,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'topic', label: 'Topic *', type: 'select', required: true, placeholder: 'Select topic', isNCERT: true },
      { name: 'subTopic', label: 'Sub Topic (Optional)', type: 'select', required: false, placeholder: 'Whole chapter', isCascadeSubtopic: true }
    ]
  },
  'lesson-planner': {
    name: 'Study Schedule Maker',
    description: 'Legacy route — same as Study Schedule Maker',
    icon: Calendar,
    fields: [
      { name: 'gradeLevel', label: 'Class *', type: 'select', required: true, options: CLASS_OPTIONS },
      { name: 'subject', label: 'Subject *', type: 'select', required: true, dependsOn: 'gradeLevel' },
      { name: 'topic', label: 'Topic *', type: 'select', required: true, placeholder: 'Select topic', isNCERT: true },
      { name: 'subTopic', label: 'Sub Topic (Optional)', type: 'select', required: false, placeholder: 'Whole chapter', isCascadeSubtopic: true }
    ]
  }
};

export default function StudentToolPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/student/tools/:toolType');
  const { toast } = useToast();
  const [formParams, setFormParams] = useState<Record<string, any>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [rawGeneratedContent, setRawGeneratedContent] = useState<any>(null);
  const [responseMeta, setResponseMeta] = useState<any>(null);
  const [fallbackEmptyMessage, setFallbackEmptyMessage] = useState<string>('');
  /** True when the message is "no content for this selection yet" rather than a real failure. */
  const [emptyIsContentGap, setEmptyIsContentGap] = useState(false);
  const { displayText: displayGeneratedContent, rawContent: effectiveRawContent } = useMemo(
    () => resolveAiToolDisplayState(generatedContent, rawGeneratedContent),
    [generatedContent, rawGeneratedContent],
  );
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [availableNCERTTopics, setAvailableNCERTTopics] = useState<string[]>([]);
  const [schoolBoardName, setSchoolBoardName] = useState('CBSE');
  const [isAsliPrepExclusive, setIsAsliPrepExclusive] = useState(false);
  const [schoolIitCategories, setSchoolIitCategories] = useState<string[]>([]);
  const boardOptions = getAiToolBoardOptions(isAsliPrepExclusive, schoolBoardName);
  const selectedBoard = formParams.board || getDefaultAiToolBoard(isAsliPrepExclusive, schoolBoardName);
  const assignedGradeLevel = useMemo(
    () => resolveStudentCurriculumGradeLevel(user),
    [user],
  );

  const viewerContextRaw = useMemo(() => {
    const base =
      effectiveRawContent && typeof effectiveRawContent === 'object' && !Array.isArray(effectiveRawContent)
        ? (effectiveRawContent as Record<string, unknown>)
        : {};
    return {
      ...base,
      classLabel: String(formParams.gradeLevel || base.classLabel || ''),
      subject: String(formParams.subject || base.subject || ''),
      topic: String(formParams.topic || formParams.chapter || base.topic || ''),
      subtopic: String(formParams.subTopic || base.subtopic || ''),
      board: String(selectedBoard || base.board || ''),
      productCategory: String(
        formParams.productCategory === 'NONE' ? '' : formParams.productCategory || base.productCategory || '',
      ),
    };
  }, [effectiveRawContent, formParams, selectedBoard]);

  const cascadeTopic = formParams.topic || formParams.chapter || '';

  const cascade = useCurriculumCascade(
    formParams.gradeLevel,
    formParams.subject,
    cascadeTopic,
    selectedBoard,
    formParams.productCategory === 'NONE' ? '' : formParams.productCategory || undefined,
  );

  const classSelectOptions = useMemo(() => {
    if (assignedGradeLevel) return [assignedGradeLevel];
    return cascade.classOptions.length > 0 ? cascade.classOptions : CLASS_OPTIONS;
  }, [assignedGradeLevel, cascade.classOptions]);

  const availableSubjects = (() => {
    if (!formParams.gradeLevel) return [];
    const raw = cascade.subjects;
    if (cascade.loadingSubjects && raw.length === 0) return [];
    if (raw.length === 0) return [];
    if (isIitAiToolBoard(selectedBoard)) {
      return filterSubjectsForIitBoard(raw);
    }
    return raw;
  })();

  const toolType = params?.toolType || '';
  const apiToolType = resolveStudentAiApiToolType(toolType);
  const isProjectIdeaLab = apiToolType === 'project-idea-lab';
  const isStudySchedule = apiToolType === 'study-schedule-maker';
  const isReadingPractice = apiToolType === 'reading-practice-room';
  const isMyStudyDecks = apiToolType === 'my-study-decks';
  const isFlashcardGenerator = apiToolType === 'flashcard-generator';
  const isMockTest = apiToolType === 'mock-test-builder';

  const viewerRecord = useMemo(
    () =>
      buildAiToolViewerRecord({
        toolSlug: apiToolType || toolType,
        generatedContent: displayGeneratedContent,
        rawContent: viewerContextRaw,
        meta: {
          board: selectedBoard || '',
          classLabel: String(formParams.gradeLevel || assignedGradeLevel || ''),
          subject: String(formParams.subject || formParams.subjects || ''),
          topic: String(formParams.topic || formParams.chapter || formParams.concept || ''),
          subtopic: String(formParams.subTopic || ''),
        },
      }),
    [
      apiToolType,
      toolType,
      displayGeneratedContent,
      viewerContextRaw,
      selectedBoard,
      formParams,
      assignedGradeLevel,
    ],
  );

  const subjectsForTool = useMemo(
    () => filterSubjectsForAiTool(apiToolType, availableSubjects),
    [apiToolType, availableSubjects],
  );
  const config =
    TOOL_CONFIGS[toolType] ||
    (isProjectIdeaLab ? TOOL_CONFIGS['project-idea-lab'] : undefined) ||
    (isStudySchedule ? TOOL_CONFIGS['study-schedule-maker'] : undefined) ||
    (isReadingPractice ? TOOL_CONFIGS['reading-practice-room'] : undefined);

  const effectiveConfig = useMemo(() => {
    if (!config) return config;
    const showTrack = shouldShowIitTrackField(selectedBoard, schoolIitCategories);
    if (!showTrack) {
      if (!config.fields.some((f) => f.name === 'productCategory')) return config;
      return {
        ...config,
        fields: config.fields.filter((f) => f.name !== 'productCategory'),
      };
    }
    const hasCategory = config.fields.some((f) => f.name === 'productCategory');
    if (hasCategory) return config;
    return {
      ...config,
      fields: [
        {
          name: 'productCategory',
          label: 'IIT Track (Optional)',
          type: 'select' as const,
          required: false,
          options: ['NONE', ...schoolIitCategories],
          placeholder: 'General',
        },
        ...config.fields,
      ],
    };
  }, [config, schoolIitCategories, selectedBoard]);

  // Drop stale track when board is not IIT or school has fewer than 2 tracks
  useEffect(() => {
    if (shouldShowIitTrackField(selectedBoard, schoolIitCategories)) return;
    setFormParams((prev) => {
      if (!prev.productCategory) return prev;
      const next = { ...prev };
      delete next.productCategory;
      return next;
    });
  }, [selectedBoard, schoolIitCategories]);

  // Fetch user data to get assigned class
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = getAuthToken();

        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData.user);
          const exclusive = resolveIsAsliPrepExclusive(userData.user);
          setIsAsliPrepExclusive(exclusive);
          setSchoolIitCategories(resolveSchoolIitCategories(userData.user));
          const curriculumBoard = resolveCurriculumBoardForAiTools(userData.user);
          const defaultBoard = getDefaultAiToolBoard(exclusive, curriculumBoard);
          setSchoolBoardName(curriculumBoard);
          setFormParams((prev) => ({
            ...prev,
            board: prev.board || defaultBoard,
          }));
          
          const curriculumGrade = resolveStudentCurriculumGradeLevel(userData.user);
          if (curriculumGrade) {
            setFormParams((prev) => ({ ...prev, gradeLevel: curriculumGrade }));
          }
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
      } finally {
        setIsLoadingUser(false);
      }
    };

    fetchUser();
  }, []);

  useEffect(() => {
    if (isLoadingUser || !formParams.board) return;
    if (!boardOptions.includes(formParams.board)) {
      const fallback = getDefaultAiToolBoard(isAsliPrepExclusive, schoolBoardName);
      setFormParams((prev) => ({ ...prev, board: fallback }));
    }
  }, [boardOptions, formParams.board, isAsliPrepExclusive, isLoadingUser, schoolBoardName]);

  useEffect(() => {
    if (isLoadingUser) return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const subject = sp.get('subject');
      const topic = sp.get('topic');
      const subTopic = sp.get('subTopic');
      if (!subject && !topic && !subTopic) return;
      setFormParams((prev) => ({
        ...prev,
        ...(subject ? { subject: decodeURIComponent(subject) } : {}),
        ...(topic ? { topic: decodeURIComponent(topic) } : {}),
        ...(subTopic ? { subTopic: decodeURIComponent(subTopic) } : {}),
      }));
    } catch {
      /* ignore malformed query */
    }
  }, [isLoadingUser, toolType]);

  useEffect(() => {
    const classValue = formParams.gradeLevel;
    const subjectValue = formParams.subject;
    if (!classValue || !subjectValue) {
      setAvailableNCERTTopics([]);
      return;
    }
    if (cascade.loadingTopics && cascade.topics.length === 0) {
      setAvailableNCERTTopics([]);
      return;
    }
    let topics = [...cascade.topics];
    const gl = normalizeGradeForCurriculum(classValue) || classValue;
    const isIit = gl === 'IIT-6';
    const classNumber = isIit ? NaN : parseInt(String(gl).replace('Class ', '').trim(), 10);
    setAvailableNCERTTopics(topics);
  }, [formParams.gradeLevel, formParams.subject, cascade.topics, cascade.loadingTopics]);

  useEffect(() => {
    // Do not clear subject based on language/tool pairing — delivery is not gated.
  }, [toolType, apiToolType, formParams.subject, isReadingPractice]);

  useEffect(() => {
    if (!assignedGradeLevel) return;
    setFormParams((prev) => {
      if (prev.gradeLevel === assignedGradeLevel) return prev;
      return { ...prev, gradeLevel: assignedGradeLevel };
    });
  }, [assignedGradeLevel]);

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl font-bold mb-4">Tool Not Found</h1>
          <Button onClick={() => setLocation('/ai-tutor')}>Go Back</Button>
        </div>
      </div>
    );
  }

  const Icon = config.icon;

  const handleInputChange = (name: string, value: any) => {
    if (name === 'gradeLevel' && assignedGradeLevel) return;

    setFormParams(prev => {
      const newParams = { ...prev, [name]: value };
      
      // Clear dependent fields when parent field changes
      if (name === 'gradeLevel') {
        delete newParams.subject;
        delete newParams.topic;
        delete newParams.subTopic;
        delete newParams.concept;
        delete newParams.chapter;
        delete newParams.projectTopic;
      }
      if (name === 'subject') {
        delete newParams.topic;
        delete newParams.subTopic;
        delete newParams.concept;
        delete newParams.chapter;
        delete newParams.projectTopic;
      }
      if (name === 'topic' || name === 'chapter') {
        delete newParams.subTopic;
      }
      if (name === 'board') {
        delete newParams.subject;
        delete newParams.topic;
        delete newParams.subTopic;
        delete newParams.concept;
        delete newParams.chapter;
        delete newParams.projectTopic;
        if (assignedGradeLevel) {
          newParams.gradeLevel = assignedGradeLevel;
        }
      }
      
      return newParams;
    });
  };

  const getFieldOptions = (field: ToolConfig['fields'][0]): string[] => {
    if (field.options) {
      return field.options;
    }
    
    // For subject field, use curriculum subjects (Story & Passage → English/Hindi/Telugu only)
    if (field.name === 'subject' && field.dependsOn === 'gradeLevel') {
      const classValue = formParams[field.dependsOn];
      if (classValue && subjectsForTool.length > 0) {
        return subjectsForTool;
      }
      return [];
    }
    
    if (field.isCascadeSubtopic && field.name === 'subTopic') {
      return cascade.subtopics;
    }

    // For topic/concept/chapter fields with isNCERT flag, use availableNCERTTopics
    if (field.isNCERT && (field.name === 'topic' || field.name === 'concept' || field.name === 'chapter' || field.name === 'projectTopic')) {
      return availableNCERTTopics;
    }
    
    if (field.dependsOn && field.getOptions) {
      const parentValue = formParams[field.dependsOn];
      if (parentValue) {
        return field.getOptions(parentValue);
      }
      return [];
    }
    
    return [];
  };

  const fieldUsesCurriculumSelect = (field: ToolConfig['fields'][0]) => field.type === 'select';

  const showInlineOutputMessage = useCallback((message: string, isContentGap = false) => {
    setGeneratedContent('');
    setRawGeneratedContent(null);
    setResponseMeta(null);
    setFallbackEmptyMessage(message);
    setEmptyIsContentGap(isContentGap);
  }, []);

  const handleGenerate = async () => {
    if (!config) return;

    const validationError = validateAiToolForm({
      config,
      formParams: { ...formParams, board: selectedBoard },
      toolType: apiToolType,
      isReadingPractice,
      requireBoard: true,
    });
    if (validationError) {
      showInlineOutputMessage(validationError);
      return;
    }

    setIsGenerating(true);
    setGeneratedContent('');
    setRawGeneratedContent(null);
    setResponseMeta(null);
    setFallbackEmptyMessage('');
    try {
      const token = getAuthToken();

      const teacherTools = [
        'worksheet-mcq-generator',
        'concept-mastery-helper',
        'short-notes-summaries-maker',
        'homework-creator',
        'reading-practice-room',
      ];

      const isTeacherTool = teacherTools.includes(toolType);

      const applySuccessPayload = (data: {
        success?: boolean;
        message?: string;
        data?: {
          content?: string;
          rawData?: unknown;
          metadata?: AiToolGenerationMeta & {
            aiUnavailable?: boolean;
            chunksUsed?: number;
            citations?: CitationItem[];
          };
        };
      }) => {
        if (!data.success || !data?.data?.content || String(data.data.content).trim().length === 0) {
          throw new Error(data.message || 'AI returned empty response');
        }
        setResponseMeta(data.data.metadata || null);

        const { displayContent, rawContent } = buildAiToolViewerContent(
          data.data.content,
          pickAiToolRawData(data.data),
        );
        setRawGeneratedContent(rawContent);
        // Always keep structured sections (cards, questions, steps) when present.
        setGeneratedContent(displayContent || String(data.data.content));
      };

      if (isTeacherTool) {
        const selectedClass = formParams.gradeLevel;
        const selectedSubject = formParams.subject || formParams.subjects;
        const selectedTopic = formParams.topic || '';
        const selectedSubTopic =
          formParams.subTopic === WHOLE_CHAPTER_VALUE ? '' : formParams.subTopic || '';
        const selectedSection = formParams.section || formParams.className || '';

        const requestBody = {
          toolType: apiToolType || toolType,
          classNumber: parseAiToolClassNumber(selectedClass),
          subject: selectedSubject,
          topic: selectedTopic,
          section: selectedSection,
          questionCount: formParams.questionCount ? parseInt(String(formParams.questionCount), 10) : undefined,
          duration: formParams.duration ? parseInt(String(formParams.duration), 10) : undefined,
          ...formParams,
          subTopic: selectedSubTopic,
          board: selectedBoard,
          gradeLevel: selectedClass,
          chapterScope: !selectedSubTopic,
          uniqueSeed: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        };

        const response = await fetch(`${API_BASE_URL}/api/teacher/ai/generate-content`, {
          method: 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        const responseText = await response.text();
        let data: {
          success?: boolean;
          data?: {
            content?: string;
            rawData?: unknown;
            metadata?: { source?: string; sourceLabel?: string; aiUnavailable?: boolean; citations?: CitationItem[] };
          };
          message?: string;
          code?: string;
          availableTopics?: string[];
        } = {};
        try {
          data = responseText ? JSON.parse(responseText) : {};
        } catch {
          data = {};
        }

        if (!response.ok) {
          if (isAiToolApiFailureInline(response, data?.code)) {
            {
              const empty = resolveAiToolStudentEmptyMessage(data, config?.name);
              showInlineOutputMessage(empty.message, empty.isContentGap);
            }
            return;
          }
          if (response.status === 503 && data?.code === 'AI_UNAVAILABLE_NO_FALLBACK') {
            {
              const empty = resolveAiToolStudentEmptyMessage(data, config?.name);
              showInlineOutputMessage(empty.message, empty.isContentGap);
            }
            return;
          }
          const errorMessage =
            data.message || responseText || `Server error: ${response.status}`;
          throw new Error(errorMessage || 'AI generation failed');
        }

        applySuccessPayload(data);
      } else {
        const mappedTopic =
          formParams.topic ||
          formParams.concept ||
          formParams.chapter ||
          formParams.projectTopic ||
          '';
        const requestBody: Record<string, unknown> = {
          toolType: apiToolType,
          ...formParams,
          board: selectedBoard,
          gradeLevel: mapGradeLevelForIitBoard(selectedBoard, formParams.gradeLevel),
          subject: formParams.subject || formParams.subjects,
          topic: mappedTopic,
          subTopic:
            formParams.subTopic === WHOLE_CHAPTER_VALUE ? '' : formParams.subTopic || '',
          chapterScope:
            !formParams.subTopic || formParams.subTopic === WHOLE_CHAPTER_VALUE,
          productCategory:
            formParams.productCategory === 'NONE' ? '' : formParams.productCategory || '',
          uniqueSeed: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        };

        const response = await fetch(`${API_BASE_URL}/api/student/ai/tool`, {
          method: 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        const responseText = await response.text();
        let data: {
          success?: boolean;
          data?: {
            content?: string;
            rawData?: unknown;
            metadata?: { source?: string; sourceLabel?: string; aiUnavailable?: boolean; citations?: CitationItem[] };
          };
          message?: string;
          code?: string;
          availableTopics?: string[];
        } = {};
        try {
          data = responseText ? JSON.parse(responseText) : {};
        } catch {
          data = {};
        }

        if (!response.ok) {
          if (isAiToolApiFailureInline(response, data?.code)) {
            {
              const empty = resolveAiToolStudentEmptyMessage(data, config?.name);
              showInlineOutputMessage(empty.message, empty.isContentGap);
            }
            return;
          }
          if (response.status === 503 && data?.code === 'AI_UNAVAILABLE_NO_FALLBACK') {
            {
              const empty = resolveAiToolStudentEmptyMessage(data, config?.name);
              showInlineOutputMessage(empty.message, empty.isContentGap);
            }
            return;
          }
          const errorMessage =
            data.message || responseText || `Server error: ${response.status}`;
          throw new Error(errorMessage || 'Content fetch failed');
        }

        applySuccessPayload(data);
      }
    } catch (error: unknown) {
      console.error('Generate error:', error);
      const errMsg = sanitizeAiToolUserFacingError(
        String((error as Error)?.message || 'Network error. Please try again.'),
      );
      if (/taking too long to load/i.test(errMsg)) {
        showInlineOutputMessage(errMsg);
        return;
      }
      if (isAiToolClientValidationError(errMsg) || /AI_TOOL_DATA_NOT_FOUND/i.test(errMsg)) {
        showInlineOutputMessage(errMsg);
        return;
      }

      try {
          const selectedClass = formParams.gradeLevel;
          const selectedSubject = formParams.subject || formParams.subjects;
          if (!selectedClass || !selectedSubject) {
            throw new Error('Missing class or subject for fallback');
          }
          const mappedTopic =
            formParams.topic ||
            formParams.concept ||
            formParams.chapter ||
            formParams.projectTopic ||
            '';
          const params = new URLSearchParams({
            class: String(selectedClass),
            subject: String(selectedSubject),
            topic: String(mappedTopic),
            subTopic: String(formParams.subTopic || ''),
            toolType: String(apiToolType || ''),
            board: String(selectedBoard || formParams.board || ''),
          });
          const token = getAuthToken();
          const fallbackRes = await fetch(
            `${API_BASE_URL}/api/teacher/ai/generated-content?${params.toString()}`,
            {
              headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                'Content-Type': 'application/json',
              },
            },
          );
          if (!fallbackRes.ok) {
            showInlineOutputMessage(
              'Could not load saved content for this selection. Please try again.',
            );
            return;
          }
          const fallbackJson = await fallbackRes.json();
          const fallbackContent =
            fallbackJson?.data?.generatedContent ?? fallbackJson?.data?.content ?? '';
          if (
            isAiToolInlineOnlyError(fallbackJson?.code) ||
            (fallbackJson?.success && !fallbackJson?.data)
          ) {
            showInlineOutputMessage(
              sanitizeAiToolUserFacingError(
                fallbackJson?.message ||
                  'No saved content matched this selection yet. Try Generate again shortly.',
              ),
            );
          } else if (fallbackJson?.success && String(fallbackContent).trim().length > 0) {
            const { displayContent, rawContent } = buildAiToolViewerContent(
              fallbackContent,
              pickAiToolRawData(fallbackJson?.data),
            );
            setGeneratedContent(displayContent || String(fallbackContent));
            setRawGeneratedContent(rawContent);
            setResponseMeta({
              matchType: fallbackJson?.data?.matchType,
              totalCandidates: fallbackJson?.data?.totalCandidates,
              selectedIndex: fallbackJson?.data?.selectedIndex,
            });
            setFallbackEmptyMessage('');
          } else {
            showInlineOutputMessage(
              sanitizeAiToolUserFacingError(
                fallbackJson?.message ||
                  'No saved content matched this selection yet. Try Generate again shortly.',
              ),
            );
          }
        } catch (fallbackError: unknown) {
          console.error('Fallback error:', fallbackError);
          showInlineOutputMessage(
            'Could not load saved content for this selection. Please try again.',
          );
        }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(displayGeneratedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: 'Copied!',
      description: 'Content copied to clipboard'
    });
  };

  const handleShare = async () => {
    const shareData = {
      title: `${config?.name || 'Study Tool'} | ASLILEARN AI`,
      text: displayGeneratedContent,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(displayGeneratedContent);
        toast({ title: 'Ready to share', description: 'Content copied to your clipboard' });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast({ title: 'Share unavailable', description: 'Please use Copy instead', variant: 'destructive' });
    }
  };

  // Helper function to clean LaTeX math for Word display
  const cleanLaTeXForWord = (latex: string): string => {
    if (!latex) return '';
    
    let cleaned = latex.trim();
    
    // Handle fractions first (before removing braces)
    cleaned = cleaned.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, (match, num, den) => {
      return `(${num})/(${den})`;
    });
    
    // Handle square roots
    cleaned = cleaned.replace(/\\sqrt\[([^\]]+)\]\{([^}]+)\}/g, (match, root, content) => {
      return `(${content})^(1/${root})`;
    });
    cleaned = cleaned.replace(/\\sqrt\{([^}]+)\}/g, '√($1)');
    cleaned = cleaned.replace(/\\sqrt/g, '√');
    
    // Handle inverse trigonometric functions
    cleaned = cleaned.replace(/\\tan\^\{\-1\}/g, 'tan⁻¹');
    cleaned = cleaned.replace(/\\sin\^\{\-1\}/g, 'sin⁻¹');
    cleaned = cleaned.replace(/\\cos\^\{\-1\}/g, 'cos⁻¹');
    cleaned = cleaned.replace(/\\cot\^\{\-1\}/g, 'cot⁻¹');
    cleaned = cleaned.replace(/\\sec\^\{\-1\}/g, 'sec⁻¹');
    cleaned = cleaned.replace(/\\csc\^\{\-1\}/g, 'csc⁻¹');
    
    // Handle common functions
    cleaned = cleaned.replace(/\\int/g, '∫');
    cleaned = cleaned.replace(/\\sum/g, 'Σ');
    cleaned = cleaned.replace(/\\prod/g, 'Π');
    cleaned = cleaned.replace(/\\pi/g, 'π');
    cleaned = cleaned.replace(/\\alpha/g, 'α');
    cleaned = cleaned.replace(/\\beta/g, 'β');
    cleaned = cleaned.replace(/\\gamma/g, 'γ');
    cleaned = cleaned.replace(/\\theta/g, 'θ');
    cleaned = cleaned.replace(/\\lambda/g, 'λ');
    cleaned = cleaned.replace(/\\mu/g, 'μ');
    cleaned = cleaned.replace(/\\sigma/g, 'σ');
    cleaned = cleaned.replace(/\\infty/g, '∞');
    cleaned = cleaned.replace(/\\pm/g, '±');
    cleaned = cleaned.replace(/\\mp/g, '∓');
    cleaned = cleaned.replace(/\\times/g, '×');
    cleaned = cleaned.replace(/\\div/g, '÷');
    cleaned = cleaned.replace(/\\leq/g, '≤');
    cleaned = cleaned.replace(/\\geq/g, '≥');
    cleaned = cleaned.replace(/\\neq/g, '≠');
    cleaned = cleaned.replace(/\\approx/g, '≈');
    cleaned = cleaned.replace(/\\equiv/g, '≡');
    
    cleaned = cleaned.replace(/\\ln/g, 'ln');
    cleaned = cleaned.replace(/\\log/g, 'log');
    cleaned = cleaned.replace(/\\sin/g, 'sin');
    cleaned = cleaned.replace(/\\cos/g, 'cos');
    cleaned = cleaned.replace(/\\tan/g, 'tan');
    cleaned = cleaned.replace(/\\sec/g, 'sec');
    cleaned = cleaned.replace(/\\csc/g, 'csc');
    cleaned = cleaned.replace(/\\cot/g, 'cot');
    cleaned = cleaned.replace(/\\exp/g, 'exp');
    
    // Handle left/right delimiters
    cleaned = cleaned.replace(/\\left\(/g, '(');
    cleaned = cleaned.replace(/\\right\)/g, ')');
    cleaned = cleaned.replace(/\\left\[/g, '[');
    cleaned = cleaned.replace(/\\right\]/g, ']');
    cleaned = cleaned.replace(/\\left\|/g, '|');
    cleaned = cleaned.replace(/\\right\|/g, '|');
    cleaned = cleaned.replace(/\\left\{/g, '{');
    cleaned = cleaned.replace(/\\right\}/g, '}');
    
    // Handle superscripts and subscripts (with braces) - do this before removing braces
    cleaned = cleaned.replace(/\^\{([^}]+)\}/g, '^$1');
    cleaned = cleaned.replace(/\_\{([^}]+)\}/g, '_$1');
    
    // Handle simple superscripts/subscripts (without braces)
    cleaned = cleaned.replace(/\^([a-zA-Z0-9\+\-\=])/g, '^$1');
    cleaned = cleaned.replace(/\_([a-zA-Z0-9\+\-\=])/g, '_$1');
    
    // Remove remaining braces (but keep content) - do this carefully
    // First handle nested braces
    let prevCleaned = '';
    while (cleaned !== prevCleaned) {
      prevCleaned = cleaned;
      cleaned = cleaned.replace(/\{([^{}]+)\}/g, '$1');
    }
    
    // Remove backslashes (but keep special characters we've already converted)
    cleaned = cleaned.replace(/\\([a-zA-Z]+)/g, '$1');
    cleaned = cleaned.replace(/\\/g, '');
    
    // Clean up any double spaces or extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return formatClassroomScienceText(cleaned);
  };

  // Helper function to process text with inline math and formatting
  const processTextWithMath = (text: string): TextRun[] => {
    // First, remove all LaTeX math delimiters and clean the expressions
    let processed = formatClassroomScienceText(text);
    
    // Process block math first ($$...$$) - should already be handled, but just in case
    processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, mathContent) => {
      return cleanLaTeXForWord(mathContent.trim());
    });
    
    // Process inline math ($...$) - handle all cases including at start/end of string
    // Match $...$ but not $$...$$
    processed = processed.replace(/\$([^$\n]+?)\$/g, (match, mathContent) => {
      // Skip if this looks like it might be part of block math (shouldn't happen after block math processing)
      return cleanLaTeXForWord(mathContent.trim());
    });
    
    // Now process bold formatting on the cleaned text
    const runs: TextRun[] = [];
    let lastIndex = 0;
    
    const boldRegex = /\*\*(.+?)\*\*/g;
    let match;
    
    while ((match = boldRegex.exec(processed)) !== null) {
      if (match.index > lastIndex) {
        runs.push(new TextRun(processed.substring(lastIndex, match.index)));
      }
      runs.push(new TextRun({
        text: match[1],
        bold: true
      }));
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < processed.length) {
      runs.push(new TextRun(processed.substring(lastIndex)));
    }
    
    return runs.length > 0 ? runs : [new TextRun(processed)];
  };

  // Helper function to process text formatting (bold, etc.) - also handles math
  const processTextFormatting = (text: string): TextRun[] => {
    // First clean any remaining LaTeX math
    let processed = text;
    
    // Process inline math ($...$)
    processed = processed.replace(/\$([^$\n]+?)\$/g, (match, mathContent) => {
      return cleanLaTeXForWord(mathContent.trim());
    });
    
    // Now process bold formatting
    const runs: TextRun[] = [];
    let lastIndex = 0;
    
    const boldRegex = /\*\*(.+?)\*\*/g;
    let match;
    
    while ((match = boldRegex.exec(processed)) !== null) {
      if (match.index > lastIndex) {
        runs.push(new TextRun(processed.substring(lastIndex, match.index)));
      }
      runs.push(new TextRun({
        text: match[1],
        bold: true
      }));
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < processed.length) {
      runs.push(new TextRun(processed.substring(lastIndex)));
    }
    
    return runs.length > 0 ? runs : [new TextRun(processed)];
  };

  const convertToWordDocument = async (content: string): Promise<Document> => {
    if (!content) {
      return new Document({
        sections: [{
          children: [
            new Paragraph({
              children: [new TextRun('No content available')]
            })
          ]
        }]
      });
    }

    const children: Paragraph[] = [];
    
    // Split content into lines
    const lines = content.split('\n');
    let currentParagraph: TextRun[] = [];
    let inCodeBlock = false;
    let inList = false;
    let listItems: string[] = [];

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        children.push(new Paragraph({
          children: currentParagraph,
          spacing: { after: 200 }
        }));
        currentParagraph = [];
      }
    };

    const flushList = () => {
      if (listItems.length > 0) {
        listItems.forEach(item => {
          children.push(new Paragraph({
            children: [new TextRun({
              text: `• ${item.trim()}`,
              size: 22
            })],
            spacing: { after: 100 },
            indent: { left: 400 }
          }));
        });
        listItems = [];
        inList = false;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip empty lines (but flush current paragraph)
      if (!trimmed) {
        flushParagraph();
        flushList();
        continue;
      }

      // Check for code blocks
      if (trimmed.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }

      if (inCodeBlock) {
        currentParagraph.push(new TextRun({
          text: line + '\n',
          font: 'Courier New',
          size: 20
        }));
        continue;
      }

      // Headings
      if (trimmed.startsWith('# ')) {
        flushParagraph();
        flushList();
        children.push(new Paragraph({
          text: trimmed.substring(2),
          heading: HeadingLevel.TITLE,
          spacing: { after: 300, before: 200 }
        }));
        continue;
      }

      if (trimmed.startsWith('## ')) {
        flushParagraph();
        flushList();
        children.push(new Paragraph({
          text: trimmed.substring(3),
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 250, before: 200 }
        }));
        continue;
      }

      if (trimmed.startsWith('### ')) {
        flushParagraph();
        flushList();
        children.push(new Paragraph({
          text: trimmed.substring(4),
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200, before: 150 }
        }));
        continue;
      }

      if (trimmed.startsWith('#### ')) {
        flushParagraph();
        flushList();
        children.push(new Paragraph({
          text: trimmed.substring(5),
          heading: HeadingLevel.HEADING_3,
          spacing: { after: 150, before: 100 }
        }));
        continue;
      }

      // Lists
      if (trimmed.match(/^[-*]\s+/)) {
        flushParagraph();
        const listItem = trimmed.replace(/^[-*]\s+/, '');
        listItems.push(listItem);
        inList = true;
        continue;
      }

      if (trimmed.match(/^\d+\.\s+/)) {
        flushParagraph();
        const listItem = trimmed.replace(/^\d+\.\s+/, '');
        listItems.push(listItem);
        inList = true;
        continue;
      }

      // Regular paragraph
      flushList();
      
      // Process inline formatting and math
      let processedLine = trimmed;
      
      // First, handle block math ($$...$$) - put on separate line
      if (processedLine.includes('$$')) {
        flushParagraph();
        const blockMathRegex = /\$\$([\s\S]*?)\$\$/g;
        let mathMatch;
        let lastMathIndex = 0;
        const parts: (string | { type: 'math', content: string })[] = [];
        
        while ((mathMatch = blockMathRegex.exec(processedLine)) !== null) {
          if (mathMatch.index > lastMathIndex) {
            const beforeMath = processedLine.substring(lastMathIndex, mathMatch.index);
            if (beforeMath.trim()) {
              parts.push(beforeMath);
            }
          }
          // Clean LaTeX for display using helper function
          const mathContent = cleanLaTeXForWord(mathMatch[1].trim());
          parts.push({ type: 'math', content: mathContent });
          lastMathIndex = mathMatch.index + mathMatch[0].length;
        }
        
        if (lastMathIndex < processedLine.length) {
          const afterMath = processedLine.substring(lastMathIndex);
          if (afterMath.trim()) {
            parts.push(afterMath);
          }
        }
        
        // Create paragraphs for each part
        parts.forEach(part => {
          if (typeof part === 'string') {
            if (part.trim()) {
              const textRuns = processTextFormatting(part);
              if (textRuns.length > 0) {
                children.push(new Paragraph({
                  children: textRuns,
                  spacing: { after: 200 }
                }));
              }
            }
          } else {
            // Math block - center it
            children.push(new Paragraph({
              children: [new TextRun({
                text: part.content,
                font: 'Cambria Math',
                size: 24
              })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 200, before: 100 }
            }));
          }
        });
        continue;
      }
      
      // Process inline math ($...$) and formatting
      const runs = processTextWithMath(processedLine);
      currentParagraph.push(...runs);
      currentParagraph.push(new TextRun({ text: ' ', break: 1 }));
    }

    flushParagraph();
    flushList();

    return new Document({
      sections: [{
        children: children.length > 0 ? children : [
          new Paragraph({
            children: [new TextRun('No content available')]
          })
        ],
        properties: {}
      }]
    });
  };

  const handleDownloadWord = async () => {
    try {
      setIsDownloading(true);
      const subject = String(formParams.subject || formParams.subjects || '');
      const wordToolSlug =
        toolType === 'worksheet-mcq-generator' ||
        toolType === 'exam-question-paper-generator' ||
        toolType === 'homework-creator' ||
        toolType === 'flashcard-generator'
          ? toolType
          : apiToolType || toolType;
      const wordText = buildTeacherToolWordText(
        wordToolSlug,
        displayGeneratedContent,
        effectiveRawContent,
        subject,
      );
      const doc = await convertToWordDocument(wordText);
      const blob = await Packer.toBlob(doc);
      const fileName = `${config.name.replace(/\s+/g, '-')}-${Date.now()}.docx`;
      saveAs(blob, fileName);
    toast({
      title: 'Downloaded!',
        description: 'Content downloaded as Word document successfully'
      });
    } catch (error) {
      console.error('Error generating Word document:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate Word document',
        variant: 'destructive'
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadCSV = () => {
    try {
      setIsDownloading(true);
      
      // For exam papers, extract questions from structured payload
      const csvRaw =
        effectiveRawContent && typeof effectiveRawContent === 'object'
          ? (effectiveRawContent as Record<string, any>)
          : null;
      if (isMockTest && csvRaw) {
        const csvRows: string[] = [];
        
        // CSV Headers
        csvRows.push('Question Number,Type,Question,Option A,Option B,Option C,Option D,Correct Answer,Answer,Explanation,Marks');
        
        // Extract questions from sections
        if (csvRaw.questions) {
          const questionTypes = ['mcqs', 'fillInBlanks', 'vsaqs', 'saqs', 'laqs'];
          const typeLabels = {
            'mcqs': 'MCQ',
            'fillInBlanks': 'Fill in the Blanks',
            'vsaqs': 'Very Short Answer',
            'saqs': 'Short Answer',
            'laqs': 'Long Answer'
          };

          questionTypes.forEach(type => {
            if (csvRaw.questions[type] && Array.isArray(csvRaw.questions[type])) {
              csvRaw.questions[type].forEach((q: any) => {
                const row = [
                  q.question_number || '',
                  typeLabels[type as keyof typeof typeLabels] || type,
                  `"${(q.question || '').replace(/"/g, '""')}"`,
                  q.options?.A ? `"${q.options.A.replace(/"/g, '""')}"` : '',
                  q.options?.B ? `"${q.options.B.replace(/"/g, '""')}"` : '',
                  q.options?.C ? `"${q.options.C.replace(/"/g, '""')}"` : '',
                  q.options?.D ? `"${q.options.D.replace(/"/g, '""')}"` : '',
                  q.correct_answer ? `"${q.correct_answer.replace(/"/g, '""')}"` : '',
                  q.answer ? `"${q.answer.replace(/"/g, '""')}"` : '',
                  q.explanation ? `"${q.explanation.replace(/"/g, '""')}"` : '',
                  q.marks || ''
                ];
                csvRows.push(row.join(','));
              });
            }
          });
        } else if (csvRaw.sections && Array.isArray(csvRaw.sections)) {
          // Alternative format with sections
          csvRaw.sections.forEach((section: any) => {
            if (section.questions && Array.isArray(section.questions)) {
              section.questions.forEach((q: any) => {
                const row = [
                  q.question_number || '',
                  section.type || '',
                  `"${(q.question || '').replace(/"/g, '""')}"`,
                  q.options?.A ? `"${q.options.A.replace(/"/g, '""')}"` : '',
                  q.options?.B ? `"${q.options.B.replace(/"/g, '""')}"` : '',
                  q.options?.C ? `"${q.options.C.replace(/"/g, '""')}"` : '',
                  q.options?.D ? `"${q.options.D.replace(/"/g, '""')}"` : '',
                  q.correct_answer ? `"${q.correct_answer.replace(/"/g, '""')}"` : '',
                  q.answer ? `"${q.answer.replace(/"/g, '""')}"` : '',
                  q.explanation ? `"${q.explanation.replace(/"/g, '""')}"` : '',
                  q.marks || ''
                ];
                csvRows.push(row.join(','));
              });
            }
          });
        }

        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const fileName = `${config.name.replace(/\s+/g, '-')}-${Date.now()}.csv`;
        saveAs(blob, fileName);

        toast({
          title: 'Downloaded!',
          description: 'Content downloaded as CSV successfully'
        });
      } else {
        // For other tools, create a simple CSV from the content
        const csvRows: string[] = [];
        csvRows.push('Content');
        csvRows.push(`"${displayGeneratedContent.replace(/"/g, '""').replace(/\n/g, ' ')}"`);
        
        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const fileName = `${config.name.replace(/\s+/g, '-')}-${Date.now()}.csv`;
        saveAs(blob, fileName);

        toast({
          title: 'Downloaded!',
          description: 'Content downloaded as CSV successfully'
        });
      }
    } catch (error) {
      console.error('Error generating CSV:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate CSV',
        variant: 'destructive'
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const isSmartStudyGuide = toolType === 'smart-study-guide-generator';
  const defaultResultWrapperClass =
    'rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/30 p-3 sm:p-4 lg:p-6 max-h-[80vh] overflow-y-auto shadow-inner';
  const smartStudyGuideWrapperClass =
    'rounded-3xl border border-indigo-100 bg-white p-4 sm:p-6 lg:p-8 max-h-[80vh] overflow-y-auto shadow-[0_24px_70px_-36px_rgba(79,70,229,0.35)]';
  const defaultProseClass =
    'prose prose-sm max-w-none leading-relaxed prose-headings:text-slate-900 prose-headings:tracking-tight prose-h2:mt-7 prose-h2:border-b prose-h2:border-slate-200 prose-h2:pb-2 prose-h3:mt-6 prose-h3:text-slate-800 prose-p:text-slate-700 prose-p:leading-7 prose-strong:text-slate-900 prose-li:text-slate-700 prose-code:text-slate-800 prose-img:rounded-lg prose-img:shadow-md prose-table:w-full prose-table:border-collapse prose-th:border prose-th:border-gray-300 prose-th:bg-gray-50 prose-th:p-2 prose-td:border prose-td:border-gray-300 prose-td:p-2';
  const smartStudyGuideProseClass =
    'prose prose-sm sm:prose-base max-w-none leading-relaxed prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-slate-900 prose-h1:text-2xl prose-h2:mt-8 prose-h2:text-indigo-900 prose-h3:mt-6 prose-h3:text-slate-800 prose-p:text-slate-700 prose-p:leading-8 prose-strong:text-slate-900 prose-blockquote:rounded-r-xl prose-blockquote:border-l-4 prose-blockquote:border-cyan-300 prose-blockquote:bg-cyan-50/50 prose-blockquote:py-1 prose-blockquote:pl-4 prose-blockquote:text-slate-700 prose-code:rounded prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-slate-800 prose-pre:rounded-xl prose-pre:border prose-pre:border-slate-200 prose-pre:bg-slate-950 prose-pre:text-slate-100 prose-img:rounded-xl prose-img:shadow-lg prose-table:w-full prose-table:border-separate prose-table:border-spacing-0 prose-th:border prose-th:border-indigo-200 prose-th:bg-indigo-50 prose-th:p-2 prose-td:border prose-td:border-slate-200 prose-td:p-2';
  const parameterHeaderTitle = isSmartStudyGuide ? 'Customize your study guide' : 'Choose what to generate';

  return (
    <StudentShell>
      <AiToolGeneratePageChrome
      title={config.name}
      description={config.description}
      icon={Icon}
      badge={isSmartStudyGuide ? 'Premium study' : 'Student AI'}
      onBack={() => setLocation('/ai-tutor')}
      backLabel="Back to AI Tutor"
    >
        <div className="flex flex-col gap-4 sm:gap-6">
          <AiToolGenerateFormCard
            title={parameterHeaderTitle}
            subtitle={
              isSmartStudyGuide
                ? 'Tune board, class, and topic for a premium interactive study guide.'
                : undefined
            }
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
            notices={null}
          >
                <AiToolFormField label="Board *" htmlFor="board">
                  <Select
                    value={selectedBoard}
                    onValueChange={(value) => handleInputChange('board', value)}
                  >
                    <SelectTrigger id="board" aria-label="Board">
                      <SelectValue placeholder="Select board" />
                    </SelectTrigger>
                    <SelectContent>
                      {boardOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </AiToolFormField>
                {(effectiveConfig || config).fields.map((field) => {
                  let fieldOptions = getFieldOptions(field);
                  let isDisabled = !!(field.dependsOn && !formParams[field.dependsOn]);
                  let loadingDropdown = false;

                  if (field.name === 'gradeLevel') {
                    fieldOptions = classSelectOptions;
                    isDisabled = cascade.loadingClasses && classSelectOptions.length === 0;
                    loadingDropdown = cascade.loadingClasses;
                  } else if (field.name === 'productCategory') {
                    fieldOptions = field.options || [];
                    isDisabled = false;
                  } else if (field.name === 'subject' && field.dependsOn === 'gradeLevel') {
                    fieldOptions = subjectsForTool;
                    loadingDropdown = cascade.loadingSubjects;
                    isDisabled =
                      !formParams.gradeLevel ||
                      cascade.loadingSubjects ||
                      isLoadingUser;
                  } else if (field.isNCERT && (field.name === 'topic' || field.name === 'concept' || field.name === 'chapter' || field.name === 'projectTopic')) {
                    loadingDropdown = cascade.loadingTopics;
                    isDisabled =
                      !formParams.gradeLevel ||
                      !formParams.subject ||
                      cascade.loadingTopics;
                  } else if (field.isCascadeSubtopic && field.name === 'subTopic') {
                    fieldOptions = !field.required
                      ? [WHOLE_CHAPTER_VALUE, ...cascade.subtopics]
                      : cascade.subtopics;
                    loadingDropdown = cascade.loadingSubtopics;
                    isDisabled =
                      !formParams.gradeLevel ||
                      !formParams.subject ||
                      !(formParams.topic || formParams.chapter) ||
                      cascade.loadingSubtopics;
                  }

                  const isClassField = field.name === 'gradeLevel';
                  const isClassFieldLocked = isClassField && !!assignedGradeLevel;

                  let placeholderText = field.placeholder || `Select ${field.label}`;
                  if (isDisabled) {
                    if (field.name === 'gradeLevel' && cascade.loadingClasses) {
                      placeholderText = 'Loading classes...';
                    } else if (field.name === 'subject') {
                      placeholderText =
                        !formParams.gradeLevel || cascade.loadingSubjects
                          ? 'Select Class first'
                          : subjectsForTool.length === 0
                            ? isReadingPractice
                              ? 'English, Hindi, or Telugu only for this tool'
                              : isLanguageExcludedTool(apiToolType)
                                ? 'Not available for English, Hindi, or Telugu'
                                : 'No data available'
                            : field.placeholder || placeholderText;
                    } else if (
                      field.isNCERT &&
                      (field.name === 'topic' ||
                        field.name === 'concept' ||
                        field.name === 'chapter' ||
                        field.name === 'projectTopic')
                    ) {
                      // `|| cascade.loadingTopics` used to sit on the second
                      // branch, so the field flashed "Select Subject first"
                      // mid-fetch (and made "Loading topics..." unreachable).
                      placeholderText = !formParams.gradeLevel
                        ? 'Select Class first'
                        : !formParams.subject
                          ? 'Select Subject first'
                          : cascade.loadingTopics
                            ? 'Loading topics...'
                            : fieldOptions.length === 0
                              ? 'No data available'
                              : field.placeholder || 'Select topic';
                    } else if (field.isCascadeSubtopic) {
                      placeholderText = !(formParams.topic || formParams.chapter)
                        ? 'Select Topic first'
                        : cascade.loadingSubtopics
                          ? 'Loading subtopics...'
                          : cascade.subtopics.length === 0 && !String(formParams.subTopic || '').trim()
                            ? 'No data available'
                            : field.placeholder || 'Select subtopic';
                    } else if (fieldOptions.length === 0 && field.dependsOn) {
                      placeholderText = `Select ${config.fields.find((f) => f.name === field.dependsOn)?.label || 'Class'} first`;
                    }
                  }

                  const optionsForSelect = fieldUsesCurriculumSelect(field)
                    ? mergeSelectedIntoOptions(fieldOptions, formParams[field.name])
                    : fieldOptions;

                  return (
                    <AiToolFormField
                      key={field.name}
                      htmlFor={field.name}
                      loading={loadingDropdown}
                      label={formatAiToolText(field.label)}
                      className={field.type === 'textarea' ? 'sm:col-span-2 lg:col-span-3' : ''}
                    >
                      {isClassFieldLocked ? (
                        <div className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                          <span>{assignedGradeLevel}</span>
                          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
                            Assigned
                          </span>
                        </div>
                      ) : fieldUsesCurriculumSelect(field) ? (
                        <Select
                          value={
                            field.isCascadeSubtopic && !field.required && !formParams[field.name]
                              ? WHOLE_CHAPTER_VALUE
                              : field.name === 'productCategory'
                                ? formParams[field.name] || 'NONE'
                                : formParams[field.name] || ''
                          }
                          onValueChange={(value) => {
                            if (field.isCascadeSubtopic && value === WHOLE_CHAPTER_VALUE) {
                              handleInputChange(field.name, '');
                              return;
                            }
                            if (field.name === 'productCategory') {
                              handleInputChange(field.name, value === 'NONE' ? '' : value);
                              // Keep subject when changing IIT Track; only reset topic cascade.
                              handleInputChange('topic', '');
                              handleInputChange('chapter', '');
                              handleInputChange('concept', '');
                              handleInputChange('subTopic', '');
                              return;
                            }
                            handleInputChange(field.name, value);
                          }}
                          disabled={isDisabled}
                        >
                          <SelectTrigger
                            aria-label={field.label}
                            className="overflow-hidden [&>span]:block [&>span]:max-w-full [&>span]:overflow-hidden [&>span]:whitespace-nowrap [&>span]:text-ellipsis"
                          >
                            <SelectValue placeholder={placeholderText} />
                          </SelectTrigger>
                          <SelectContent>
                            {optionsForSelect.length > 0 ? (
                              optionsForSelect.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option === WHOLE_CHAPTER_VALUE
                                    ? 'Whole chapter'
                                    : field.name === 'productCategory'
                                      ? option === 'NONE'
                                        ? 'General'
                                        : `IIT ${formatIitCategoryLabel(option)}`
                                      : option.charAt(0).toUpperCase() + option.slice(1)}
                                </SelectItem>
                              ))
                            ) : (
                              <div className="px-2 py-1.5 text-xs sm:text-sm text-gray-500">
                                {field.isNCERT &&
                                (field.name === 'topic' ||
                                  field.name === 'concept' ||
                                  field.name === 'chapter' ||
                                  field.name === 'projectTopic')
                                  ? 'No data available'
                                  : field.isCascadeSubtopic
                                    ? 'No data available'
                                    : 'No options available'}
                              </div>
                            )}
                          </SelectContent>
                        </Select>
                      ) : field.type === 'textarea' ? (
                        <Textarea
                          id={field.name}
                          value={formParams[field.name] || ''}
                          onChange={(e) => handleInputChange(field.name, e.target.value)}
                          placeholder={field.placeholder}
                          rows={3}
                        />
                      ) : (
                        <Input
                          id={field.name}
                          type={field.type}
                          value={formParams[field.name] || ''}
                          onChange={(e) => handleInputChange(field.name, e.target.value)}
                          placeholder={field.placeholder}
                          required={field.required}
                        />
                      )}
                    </AiToolFormField>
                  );
                })}
          </AiToolGenerateFormCard>

          {/* Generated content — shared mobile-friendly result shell */}
          <AiToolResultShell
            className="w-full"
            toolType={apiToolType || toolType}
            toolName={config.name}
            toolDescription={config.description}
            hideHeader
            meta={{
              board: selectedBoard || formParams.board || '',
              classLabel: String(formParams.gradeLevel || assignedGradeLevel || ''),
              subject: String(formParams.subject || formParams.subjects || ''),
              chapter: String(formParams.topic || formParams.chapter || formParams.concept || ''),
              subtopic: String(formParams.subTopic || ''),
            }}
            inputSummary={
              generatedContent ? <AiToolV2InputSummary rawContent={viewerContextRaw} /> : null
            }
            footer={
              generatedContent ? (
                <p className="text-center text-base text-slate-500">
                  ASLILEARN AI V2 · Regenerate to refresh sections or copy to save your work.
                </p>
              ) : null
            }
            isLoading={isGenerating}
            citations={
              generatedContent && Array.isArray(responseMeta?.citations) && responseMeta.citations.length > 0 ? (
                <div className="mt-2 rounded-lg border border-sky-100 bg-sky-50/50 p-2 max-h-28 overflow-y-auto">
                  <p className="text-mini font-semibold text-sky-700 mb-1">Top Citations</p>
                  <div className="space-y-1">
                    {responseMeta.citations.slice(0, 3).map((c: CitationItem) => (
                      <p key={String(c.index) + '-' + String(c.chapter)} className="text-mini text-gray-600">
                        [{c.index}] {c.subject} / {c.chapter} ({c.score})
                      </p>
                    ))}
                  </div>
                </div>
              ) : null
            }
            actions={
              generatedContent ? (
                <div className="flex w-full flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0 bg-white">
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadWord}
                    disabled={isDownloading}
                    className="shrink-0 bg-white"
                  >
                    {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Download
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleShare} className="shrink-0 bg-white">
                    <Share2 className="h-4 w-4" />
                    Share
                  </Button>
                  <Button size="sm" onClick={handleGenerate} disabled={isGenerating} className="shrink-0">
                    <RotateCcw className="h-4 w-4" />
                    Regenerate
                  </Button>
                </div>
              ) : null
            }
            empty={
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <span
                  className={cn(
                    'mb-4 flex h-14 w-14 items-center justify-center rounded-2xl',
                    !fallbackEmptyMessage || emptyIsContentGap
                      ? 'bg-indigo-blue-50 text-indigo-blue-600'
                      : 'bg-red-50 text-red-600',
                  )}
                >
                  {!fallbackEmptyMessage ? (
                    <Sparkles className="h-7 w-7" aria-hidden="true" />
                  ) : emptyIsContentGap ? (
                    <BookOpen className="h-7 w-7" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="h-7 w-7" aria-hidden="true" />
                  )}
                </span>
                <p
                  className={cn(
                    'max-w-md text-base font-semibold',
                    !fallbackEmptyMessage || emptyIsContentGap ? 'text-ink' : 'text-red-700',
                  )}
                >
                  {fallbackEmptyMessage || 'Fill in the form and generate to see your result'}
                </p>
                {emptyIsContentGap && (
                  <p className="mt-2 max-w-md text-sm text-muted-foreground">
                    Pick a different sub-topic above and generate again.
                  </p>
                )}
              </div>
            }
          >
            {generatedContent ? (
              <GeneratorRecordViewer record={viewerRecord} audience="student" />
            ) : null}
          </AiToolResultShell>
        </div>
      </AiToolGeneratePageChrome>
    </StudentShell>
  );
}

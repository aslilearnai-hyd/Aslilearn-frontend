// Run: node --test src/lib/six-section-print.test.ts  (Node >= 22.18 strips types)
import test from 'node:test';
import assert from 'node:assert/strict';
import { sixSectionToPrintHtml, sixSectionToPrintSections } from './six-section-print.ts';
import { normalizeQuestionNumbering } from './question-numbering.ts';
import type { SixSectionViewerProps } from '@/components/ai-v2/six-section-viewer';

const props = (sections: unknown[]): SixSectionViewerProps =>
  ({ tool: { name: 'Worksheet', icon: null }, sections }) as unknown as SixSectionViewerProps;

const worksheet = props(
  normalizeQuestionNumbering(
    [
      {
        id: 'core', label: 'Worksheet', accent: 'blue', icon: null,
        blocks: [
          { kind: 'mcq', questions: [{ n: '1', stem: '19. What is $\\frac{3}{4}$ of 20?', marks: '1 mark', options: [{ label: 'A', text: '15', correct: true }, { label: 'B', text: '12' }] }] },
          { kind: 'shortAnswer', questions: [{ n: '2', stem: '20. Find \\sqrt{144}', imageUrl: 'https://cdn.example.com/fig.png' }] },
        ],
      },
      { id: 'assessment', label: 'Answer Key', accent: 'green', icon: null, blocks: [{ kind: 'answerKey', items: [{ n: 'Q19', answer: '15' }, { n: 'Q20', answer: '12' }] }] },
    ] as never,
  ),
);

const visibleText = (html: string) =>
  html
    .replace(/<annotation[\s\S]*?<\/annotation>/g, '')
    .replace(/<span class="katex-mathml">[\s\S]*?<\/span>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

test('the PDF numbers questions exactly like the screen and the key follows', () => {
  const text = visibleText(sixSectionToPrintHtml(worksheet));
  assert.match(text, /1\. What is/);
  assert.match(text, /2\. Find/);
  assert.doesNotMatch(text, /19\.|20\./, 'numbers saved inside the text are gone');
  const key = sixSectionToPrintSections(worksheet)[1];
  assert.match(visibleText(key), /1\. 15 .*2\. 12/);
});

test('maths is typeset, with no raw LaTeX or stray dollar signs', () => {
  const html = sixSectionToPrintHtml(worksheet);
  assert.match(html, /class="katex"/);
  const text = visibleText(html);
  assert.doesNotMatch(text, /\$|\\frac|\\sqrt/);
});

test('question figures are printed; unsafe image links are not', () => {
  assert.match(sixSectionToPrintHtml(worksheet), /<img src="https:\/\/cdn\.example\.com\/fig\.png"/);
  const unsafe = props([{ id: 'core', label: 'W', accent: 'blue', icon: null, blocks: [{ kind: 'shortAnswer', questions: [{ n: '1', stem: 'x', imageUrl: 'javascript:alert(1)' }] }] }]);
  assert.doesNotMatch(sixSectionToPrintHtml(unsafe), /<img/);
});

test('hidden parts on screen are written out in the PDF', () => {
  const cards = props([
    { id: 'core', label: 'Cards', accent: 'blue', icon: null, blocks: [{ kind: 'flashcards', cards: [{ front: 'Front side', back: 'Back side' }] }] },
    { id: 'quiz', label: 'Quiz', accent: 'blue', icon: null, blocks: [{ kind: 'mcq', questions: [{ n: '1', stem: 'Pick', options: [{ label: 'A', text: 'Yes', correct: true }] }] }] },
  ]);
  const text = visibleText(sixSectionToPrintHtml(cards));
  assert.match(text, /Front side .*Back side/);
  assert.match(text, /Answer: \(A\) Yes/, 'with no answer-key section, the MCQ answer is printed inline');
});

test('plain-maths mode gives readable text for the text-only fallback', () => {
  const text = visibleText(sixSectionToPrintHtml(worksheet, { plainMath: true }));
  assert.match(text, /What is 3\/4 of 20/);
  assert.match(text, /Find √144/);
});

test('text is escaped, so saved content cannot inject markup', () => {
  const evil = props([{ id: 'core', label: '<b>x</b>', accent: 'blue', icon: null, blocks: [{ kind: 'lead', text: '<img src=x onerror=alert(1)>' }] }]);
  const html = sixSectionToPrintHtml(evil);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

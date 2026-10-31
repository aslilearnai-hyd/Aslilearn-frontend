// Run: node --test src/lib/book-curriculum-status.test.ts  (Node >= 22.18 strips types)
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCurriculumLabel, mappingBadgeInfo, mappingStatusReason } from './book-curriculum-status.ts';

const gates = (mathPass: boolean, mappingPass = true) => [
  { key: 'chapters', label: 'Chapter structure', pass: true },
  { key: 'subtopics', label: 'Subtopic mapping', pass: mappingPass, detail: mappingPass ? '' : '3 teaching chunk(s) have no subtopic' },
  { key: 'math_qa', label: 'Maths notation', pass: mathPass, detail: mathPass ? 'Formulas look intact' : '2 section(s) with damaged formulas' },
];

test('a fully mapped book with only damaged formulas is "Mapped · formula check", not "Needs review"', () => {
  const mapping = { status: 'needs_review', mappedSubtopics: 38, totalSubtopics: 38, gates: gates(false), mathQa: { applicable: true, flaggedSections: 2 } };
  assert.equal(mappingStatusReason(mapping), 'formula_check');
  const info = mappingBadgeInfo(mapping);
  assert.equal(info.text, 'Mapped · 38/38 · 2 formula sections to check');
  assert.equal(info.tone, 'warn');
  assert.match(info.explanation, /Maths notation/);
});

test('mapping problems still read "Needs review" and name the failing gates', () => {
  const mapping = { status: 'needs_review', mappedSubtopics: 30, totalSubtopics: 38, gates: gates(false, false) };
  assert.equal(mappingStatusReason(mapping), 'mapping');
  const info = mappingBadgeInfo(mapping);
  assert.equal(info.text, 'Needs review · 30/38 subtopics');
  assert.match(info.explanation, /Subtopic mapping: 3 teaching chunk/);
  assert.equal(mappingStatusReason({ ...mapping, statusReason: 'formula_check' }), 'formula_check', 'backend reason wins');
});

test('ready and legacy statuses', () => {
  assert.equal(mappingBadgeInfo({ status: 'ready', mappedSubtopics: 5, totalSubtopics: 5, gates: gates(true) }).text, 'Mapped · 5/5 subtopics');
  assert.equal(mappingBadgeInfo(null).text, 'Not mapped');
});

test('mojibake labels are repaired for display', () => {
  assert.equal(cleanCurriculumLabel('Volume 2, 2 - The Baudhāyana�-Pythagoras Theorem'), 'Volume 2, 2 - The Baudhāyana–Pythagoras Theorem');
  assert.equal(cleanCurriculumLabel('Pascal�s Triangle'), 'Pascal’s Triangle');
  assert.equal(cleanCurriculumLabel('Baudhāyana'), 'Baudhāyana');
  assert.equal(cleanCurriculumLabel('Squares and Square Roots'), 'Squares and Square Roots');
});

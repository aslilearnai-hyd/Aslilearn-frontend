// Run: node --test src/lib/exam-text-normalize.test.ts  (Node >= 22.18 strips types)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatClassroomScienceText,
  normalizeDegreeSymbols,
} from './exam-text-normalize.ts';

test('normalizeDegreeSymbols maps LaTeX and OCR lookalikes to °', () => {
  assert.equal(normalizeDegreeSymbols('(1°)'), '(1°)');
  assert.equal(normalizeDegreeSymbols(String.raw`(1^{\circ})`), '(1°)');
  assert.equal(normalizeDegreeSymbols(String.raw`90^\circ`), '90°');
  assert.equal(normalizeDegreeSymbols('90^o'), '90°');
  assert.equal(normalizeDegreeSymbols('90º'), '90°');
  assert.equal(normalizeDegreeSymbols('45° C'), '45° C');
});

test('formatClassroomScienceText preserves pasted and extracted math symbols', () => {
  const cases: Array<[string, string]> = [
    ['(1°)', '(1°)'],
    ['90°', '90°'],
    ['45° C', '45° C'],
    ['x² + y²', 'x² + y²'],
    ['H₂O', 'H₂O'],
    ['A × B', 'A × B'],
    ['√25', '√25'],
    ['90^o', '90°'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(
      formatClassroomScienceText(input),
      expected,
      `${JSON.stringify(input)} → ${JSON.stringify(expected)}`,
    );
  }
});

// Run: node --test src/lib/export-math.test.ts  (Node >= 22.18 strips types)
// Word / TXT downloads: the model sometimes writes LaTeX without $…$ in short fields
// ("A) \frac{7}{2}", "4\alpha\beta"). The app renders it (splitBareLatex); downloads showed
// raw code ("A) \frac{7}{2}", "4\α\β"). Rule: bare LaTeX exports exactly like the same LaTeX in $…$.
import test from 'node:test';
import assert from 'node:assert/strict';
import { exportMathText } from './export-math.ts';

const same = (bare: string, delimited: string) => assert.equal(exportMathText(bare), exportMathText(delimited));

test('bare LaTeX (no $…$) exports like delimited LaTeX', () => {
  same(String.raw`**Answer:** A) \frac{7}{2}`, String.raw`**Answer:** A) $\frac{7}{2}$`);
  same(String.raw`**Answer:** 4\alpha\beta`, String.raw`**Answer:** $4\alpha\beta$`);
  assert.doesNotMatch(exportMathText(String.raw`A) \alpha^{2} + \beta^{2}; C) \alpha^{3} + \beta^{3}`), /\\/);
});

test('delimited LaTeX and plain text are unchanged', () => {
  assert.equal(exportMathText(String.raw`Answer: $\frac{7}{2}$ cm`), 'Answer: ⁷⁄₂ cm');
  assert.equal(exportMathText('Plain sentence with no maths.'), 'Plain sentence with no maths.');
});

test('degree and classroom math symbols survive extraction-to-save conversion', () => {
  const cases: Array<[string, string]> = [
    ['(1°)', '(1°)'],
    ['90°', '90°'],
    ['45° C', '45° C'],
    ['x² + y²', 'x² + y²'],
    ['H₂O', 'H₂O'],
    ['A × B', 'A × B'],
    ['√25', '√25'],
    [String.raw`$(1^{\circ})$`, '(1°)'],
    [String.raw`$90^\circ$`, '90°'],
    [String.raw`(1^{\circ})`, '(1°)'],
    ['90^o', '90°'],
    ['90º', '90°'],
    ['πr²', 'πr²'],
    ['x ≤ y', 'x ≤ y'],
    ['A ÷ B', 'A ÷ B'],
    ['±2', '±2'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(exportMathText(input), expected, `${JSON.stringify(input)} → ${JSON.stringify(expected)}`);
  }
});

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

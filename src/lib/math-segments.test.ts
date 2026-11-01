// Run: node --test src/lib/math-segments.test.ts  (Node >= 22.18 strips types)
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitMathSegments, mathToReadableText } from './math-segments.ts';

const maths = (text: string) => splitMathSegments(text).filter((p) => p.math).map((p) => p.value);
const plain = (text: string) => splitMathSegments(text).filter((p) => !p.math).map((p) => p.value).join('');

test('delimited maths in every style, including maths that wraps a line', () => {
  assert.deepEqual(maths('Find $\\frac{3}{4}$ of 20'), ['\\frac{3}{4}']);
  assert.deepEqual(maths('Area $$\\pi r^2$$ here'), ['\\pi r^2']);
  assert.deepEqual(maths('Value \\(x+1\\) and \\[y=2\\]'), ['x+1', 'y=2']);
  assert.deepEqual(maths('Simplify $\\frac{a}{b} +\n\\frac{c}{d}$ now'), ['\\frac{a}{b} + \\frac{c}{d}']);
});

test('bare LaTeX with no delimiters is rendered as maths, not raw text', () => {
  assert.deepEqual(maths('What is \\frac{3}{4} of 20?'), ['\\frac{3}{4}']);
  assert.deepEqual(maths('Find \\sqrt{144} quickly'), ['\\sqrt{144}']);
  assert.deepEqual(maths('Compute 2\\times 3 = 6'), ['2\\times 3 = 6']);
  assert.deepEqual(maths('Add \\frac{1}{2} + \\frac{1}{3}'), ['\\frac{1}{2} + \\frac{1}{3}']);
  assert.equal(plain('Find \\sqrt{144} quickly'), 'Find  quickly');
});

test('stray dollar signs disappear but money stays', () => {
  assert.equal(plain('The answer is 5$ units'), 'The answer is 5 units');
  assert.equal(plain('Costs $5 and $10 each'), 'Costs $5 and $10 each');
  assert.deepEqual(maths('Costs $5 and $10 each'), []);
  assert.equal(plain('Escaped \\$ sign'), 'Escaped $ sign');
});

test('a blank line ends an unclosed $ instead of swallowing the paragraph', () => {
  const parts = splitMathSegments('Start $x + 1\n\nNext paragraph $y$');
  assert.deepEqual(parts.filter((p) => p.math).map((p) => p.value), ['y']);
  assert.ok(!parts.some((p) => !p.math && p.value.includes('$')));
});

test('readable text for PDFs that cannot draw KaTeX', () => {
  assert.equal(mathToReadableText('Find $\\frac{3}{4}$ of $\\sqrt{144}$'), 'Find 3/4 of √144');
  assert.equal(mathToReadableText('Area $\\pi r^{2}$'), 'Area π r²');
  assert.equal(mathToReadableText('$\\frac{x+1}{2} \\times 3$'), '(x+1)/2 × 3');
});

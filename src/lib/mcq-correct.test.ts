// Run: node --test src/lib/mcq-correct.test.ts  (Node >= 22.18 strips types)
import test from 'node:test';
import assert from 'node:assert/strict';
import { markMcqOptions } from './mcq-correct.ts';

const OPTS = ['A) 2', 'B) 3', 'C) 5', 'D) 7'];
const correct = (r: ReturnType<typeof markMcqOptions>) => r.options.filter((o) => o.correct).map((o) => o.label);

test('single-correct: unchanged behaviour (answer text matches one option)', () => {
  const r = markMcqOptions(OPTS, 'B) 3');
  assert.equal(r.multiCorrect, false);
  assert.deepEqual(correct(r), ['B']);
});

test('multiple-correct: every named option is correct', () => {
  const r = markMcqOptions(OPTS, 'A) 2; C) 5', true);
  assert.equal(r.multiCorrect, true);
  assert.deepEqual(correct(r), ['A', 'C']);
});

test('older records without the flag: an answer naming two options is still multiple-correct', () => {
  assert.deepEqual(correct(markMcqOptions(OPTS, 'A) 2, C) 5')), ['A', 'C']);
});

test('assertion-reason answer mentioning (A) and (R) stays single-correct', () => {
  const ar = ['A) Both (A) and (R) are true, (R) explains (A)', 'B) Both true, R does not explain A', 'C) A true, R false', 'D) A false, R true'];
  const r = markMcqOptions(ar, 'A) Both (A) and (R) are true, (R) explains (A)');
  assert.equal(r.multiCorrect, false);
  assert.deepEqual(correct(r), ['A']);
});

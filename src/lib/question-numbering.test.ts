// Run: node --test src/lib/question-numbering.test.ts  (Node >= 22.18 strips types)
import test from 'node:test';
import assert from 'node:assert/strict';
import { stripSavedStemNumber, answerKeyNumber, normalizeQuestionNumbering } from './question-numbering.ts';
import type { SixSection } from '@/components/ai-v2/six-section-viewer';

const section = (id: string, blocks: SixSection['blocks']) => ({ id, label: id, accent: 'blue', icon: null, blocks }) as unknown as SixSection;

test('numbers saved inside question text are removed; normal text is untouched', () => {
  assert.deepEqual(stripSavedStemNumber('19. Find the value of x'), { stem: 'Find the value of x', saved: 19 });
  assert.deepEqual(stripSavedStemNumber('Q7) Which is prime?'), { stem: 'Which is prime?', saved: 7 });
  assert.deepEqual(stripSavedStemNumber('Question 4: Define force'), { stem: 'Define force', saved: 4 });
  assert.deepEqual(stripSavedStemNumber('3.5 kg of rice costs ₹70'), { stem: '3.5 kg of rice costs ₹70', saved: null });
  assert.deepEqual(stripSavedStemNumber('2 apples and 3 oranges'), { stem: '2 apples and 3 oranges', saved: null });
  assert.deepEqual(stripSavedStemNumber('2 - 3 = ?'), { stem: '2 - 3 = ?', saved: null });
  assert.deepEqual(stripSavedStemNumber('(5) Name the gas'), { stem: 'Name the gas', saved: 5 });
});

test('answer-key labels resolve to displayed numbers, including per-section labels', () => {
  assert.equal(answerKeyNumber('Q12'), 12);
  assert.equal(answerKeyNumber('Question 3'), 3);
  assert.equal(answerKeyNumber('5.'), 5);
  assert.equal(answerKeyNumber('B2', { A: 1, B: 11 }), 12);
  assert.equal(answerKeyNumber('Section C - 1', { C: 21 }), 21);
  assert.equal(answerKeyNumber('Overall'), null);
});

test('a question labelled 19 inside its text shows as its real position, and the key follows it', () => {
  const sections = normalizeQuestionNumbering([
    section('core', [{ kind: 'shortAnswer', questions: [{ n: '1', stem: '19. First' }, { n: '2', stem: '20. Second' }] }]),
    section('assessment', [{ kind: 'answerKey', items: [{ n: 'Q20', answer: 'b' }, { n: 'Q19', answer: 'a' }] }]),
  ]);
  const core = sections[0].blocks[0] as { questions: { n: string; stem: string }[] };
  assert.deepEqual(core.questions.map((q) => `${q.n}. ${q.stem}`), ['1. First', '2. Second']);
  const key = sections[1].blocks[0] as { items: { n: string; answer: string }[] };
  assert.deepEqual(key.items.map((i) => `${i.n}=${i.answer}`), ['2=b', '1=a']);
});

test('section-lettered answer keys map onto the running numbers', () => {
  const sections = normalizeQuestionNumbering([
    section('core', [
      { kind: 'mcq', questions: [{ n: '1', stem: 'A one', options: [] }, { n: '2', stem: 'A two', options: [] }] },
      { kind: 'shortAnswer', questions: [{ n: '3', stem: 'B one' }] },
    ]),
    section('assessment', [{ kind: 'answerKey', items: [{ n: 'A1', answer: 'x' }, { n: 'A2', answer: 'y' }, { n: 'B1', answer: 'z' }] }]),
  ], { A: 1, B: 3 });
  const key = sections[1].blocks[0] as { items: { n: string }[] };
  assert.deepEqual(key.items.map((i) => i.n), ['1', '2', '3']);
});

test('an ambiguous answer key is left exactly as saved', () => {
  const original = [{ n: '1', answer: 'a' }, { n: '1', answer: 'b' }];
  const sections = normalizeQuestionNumbering([
    section('core', [{ kind: 'shortAnswer', questions: [{ n: '1', stem: 'One' }, { n: '2', stem: 'Two' }] }]),
    section('assessment', [{ kind: 'answerKey', items: original }]),
  ]);
  assert.deepEqual((sections[1].blocks[0] as { items: unknown[] }).items, original);
});

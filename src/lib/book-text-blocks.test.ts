// Run: node --test src/lib/book-text-blocks.test.ts  (Node >= 22.18 strips types)
import test from 'node:test';
import assert from 'node:assert/strict';
import { bookTextBlocks } from './book-text-blocks.ts';

test('each line stays its own block, so equations do not run together', () => {
  const blocks = bookTextBlocks('$1 \\times 36 = 36$\n$4 \\times 9 = 36$\nWe know, $30^2 = 900\n. Since 1156 is greater');
  assert.equal(blocks.length, 4);
  assert.deepEqual(blocks[2], { kind: 'line', text: 'We know, $30^2 = 900' });
});

test('markdown tables become header + rows, separator row dropped', () => {
  const blocks = bookTextBlocks(
    'observations are given below: | Number | Factors | Total |\n| :--- | :--- | :--- |\n| 1 | 1 | 1 |\n| 4 | 1, 2, 4 | 3 |\nAfter the table',
  );
  assert.deepEqual(blocks[0], { kind: 'line', text: 'observations are given below:' });
  assert.deepEqual(blocks[1], {
    kind: 'table',
    header: ['Number', 'Factors', 'Total'],
    rows: [['1', '1', '1'], ['4', '1, 2, 4', '3']],
  });
  assert.deepEqual(blocks[2], { kind: 'line', text: 'After the table' });
});

test('rows glued on one line are split using the header width', () => {
  const blocks = bookTextBlocks('|n|T_n|Sum|\n|:---|:---|:---|\n|1|1|3||2|3|9||3|6|16|');
  assert.deepEqual(blocks[0], {
    kind: 'table',
    header: ['n', 'T_n', 'Sum'],
    rows: [['1', '1', '3'], ['2', '3', '9'], ['3', '6', '16']],
  });
});

test('a sentence with a single pipe is not a table', () => {
  assert.deepEqual(bookTextBlocks('|x| is the absolute value'), [{ kind: 'line', text: '|x| is the absolute value' }]);
});

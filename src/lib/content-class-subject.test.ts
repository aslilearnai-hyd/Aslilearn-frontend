// Run: node --test src/lib/content-class-subject.test.ts  (Node >= 22.18 strips types)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classLabelForNumber,
  resolveClassSubjectForSave,
  type ClassSubjectLike,
  type ClassSubjectRules,
} from './content-class-subject.ts';

const norm = (v: string | null | undefined) => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isNaN(n) ? '' : String(n);
};
const nameKey = (s: string) => {
  const k = s.toLowerCase().replace(/[^a-z]/g, '');
  return k === 'maths' || k === 'math' ? 'mathematics' : k;
};
const rules: ClassSubjectRules<ClassSubjectLike> = {
  classOf: (s) => norm(s.classNumber),
  normalizeClass: norm,
  sameName: (a, b) => nameKey(a) === nameKey(b),
  sameBoard: (a, b) => !a || !b || a.toUpperCase() === b.toUpperCase(),
  categoryOf: (s) => (s.productCategory || '').toUpperCase(),
  isActive: (s) => s.isActive !== false && !s.name.includes('__deleted__'),
};

const maths6 = { _id: 'm6', name: 'Mathematics', classNumber: '6', board: 'IIT', productCategory: 'ALPHA' };
const maths8 = { _id: 'm8', name: 'Maths', classNumber: '8', board: 'IIT', productCategory: 'ALPHA' };
const maths8Beta = { ...maths8, _id: 'm8b', productCategory: 'BETA' };

const base = { classNumber: '8', board: 'IIT', productCategory: 'ALPHA' };

test('native row is kept', () => {
  assert.deepEqual(
    resolveClassSubjectForSave({ ...base, rowSubjectId: 'm8', catalog: [maths6, maths8] }, rules),
    { subjectId: 'm8', redirected: false, foreignClass: '', reason: 'ok' },
  );
});

test('Class 8 upload on a Class 6 subject row is redirected to Class 8 Mathematics', () => {
  assert.deepEqual(
    resolveClassSubjectForSave(
      { ...base, rowSubjectId: 'm6', catalog: [maths6, maths8Beta, maths8] },
      rules,
    ),
    { subjectId: 'm8', redirected: true, foreignClass: '6', reason: 'ok' },
  );
});

test('no Class 8 subject on this track: never falls back to Class 6', () => {
  const r = resolveClassSubjectForSave(
    { ...base, rowSubjectId: 'm6', catalog: [maths6, maths8Beta] },
    rules,
  );
  assert.equal(r.subjectId, null);
  assert.equal(r.foreignClass, '6');
  assert.equal(r.reason, 'no-subject-for-class');
});

test('class-less legacy subject is accepted', () => {
  const legacy = { _id: 'x', name: 'Mathematics', board: 'IIT', productCategory: 'ALPHA' };
  assert.equal(
    resolveClassSubjectForSave({ ...base, rowSubjectId: 'x', catalog: [legacy] }, rules).subjectId,
    'x',
  );
});

test('classLabelForNumber reuses the board-scoped option instead of an unscoped label', () => {
  const options = ['Class 6 (IIT)', 'Class 7 (IIT)', 'Class 8 (IIT)'];
  assert.equal(classLabelForNumber(options, '8', 'Class 8'), 'Class 8 (IIT)');
  assert.equal(classLabelForNumber(options, '08', 'Class 8'), 'Class 8 (IIT)');
  assert.equal(classLabelForNumber(options, '9', 'Class 9'), 'Class 9');
});

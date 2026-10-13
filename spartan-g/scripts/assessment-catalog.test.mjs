import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogEntry } from './assessment-catalog-data.mjs';

test('catalog excludes student instances and unpublished definitions', () => {
  const definition = { courseId: 'screening', title: 'Screening', isPublished: true };
  assert.equal(catalogEntry({ ...definition, studentId: 'private-student' }), null);
  assert.equal(catalogEntry({ ...definition, studentId: null }), null);
  assert.equal(catalogEntry({ ...definition, isPublished: false }), null);
  assert.equal(catalogEntry({ ...definition, courseId: '' }), null);
});

test('catalog contains only display metadata, no answers or private fields', () => {
  assert.deepEqual(catalogEntry({ courseId: 'screening', title: 'Screening', isPublished: true,
    questions: [{ correctAnswer: 'secret' }], reviewNotes: 'private', studentAnswers: ['secret'] }), {
    courseId: 'screening', title: 'Screening', description: '', maxAttempts: 0,
    isPublished: true, questionCount: 1,
  });
});

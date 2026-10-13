export function catalogEntry(data) {
  if ('studentId' in data || data.isPublished !== true || typeof data.courseId !== 'string'
      || !data.courseId || typeof data.title !== 'string') return null;
  return {
    courseId: data.courseId, title: data.title,
    description: typeof data.description === 'string' ? data.description : '',
    maxAttempts: typeof data.maxAttempts === 'number' ? data.maxAttempts : 0,
    isPublished: true, questionCount: Array.isArray(data.questions) ? data.questions.length : 0,
  };
}

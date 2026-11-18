import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || '';
const expectedProject = 'spartan-g-a2d80';
const prefix = 'synthetic-analytics-demo-2026';
const allowProduction = process.env.ALLOW_PRODUCTION_SEED === 'true';
const deleteMode = process.argv.includes('--delete');

if (projectId !== expectedProject || !allowProduction) {
  throw new Error(
    `Refusing to modify Firebase. Set FIREBASE_PROJECT_ID=${expectedProject} and ` +
    'ALLOW_PRODUCTION_SEED=true explicitly.',
  );
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const campuses = [
  ['pablo_borbon', 'Pablo Borbon (Main I) – Batangas City'],
  ['alangilan', 'Alangilan (Main II) – Batangas City'],
  ['arasof_nasugbu', 'ARASOF-Nasugbu – Nasugbu'],
  ['jplpc_malvar', 'JPLPC-Malvar – Malvar'],
  ['lipa', 'Lipa Campus – Lipa City'],
];
const assessmentIds = ['synthetic-analytics-assessment-wellbeing'];
const questionIds = ['q1', 'q2', 'q3', 'q4', 'q5'];
const now = new Date();
const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
const months = Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(
  monthStart.getUTCFullYear(),
  monthStart.getUTCMonth() + index,
  1,
)));

function stamp(date) {
  return Timestamp.fromDate(date);
}

function monthDate(month, day) {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), Math.min(day, 28), 8));
}

function syntheticId(kind, campus, index) {
  return `${prefix}-${kind}-${campus}-${index}`;
}

async function taggedReferences() {
  const collections = ['users', 'appointments', 'messages', 'conversations', 'facilitator_student_links', 'assessment_attempts', 'assessments'];
  const references = [];
  for (const collection of collections) {
    const snapshot = await db.collection(collection).where('syntheticSeed', '==', prefix).get();
    snapshot.forEach(document => references.push(document.ref));
  }
  return references;
}

if (deleteMode) {
  const references = await taggedReferences();
  for (let index = 0; index < references.length; index += 400) {
    const batch = db.batch();
    references.slice(index, index + 400).forEach(reference => batch.delete(reference));
    await batch.commit();
  }
  console.log(`Deleted ${references.length} tagged synthetic analytics documents from ${projectId}.`);
  process.exit(0);
}

const writer = db.bulkWriter();
let writes = 0;
const set = (reference, data) => {
  writer.set(reference, { ...data, syntheticSeed: prefix });
  writes++;
};

for (const [campus, label] of campuses) {
  const facilitatorId = syntheticId('facilitator', campus, 0);
  set(db.collection('users').doc(facilitatorId), {
    uid: facilitatorId,
    email: `${facilitatorId}@example.invalid`,
    displayName: `Synthetic facilitator – ${label}`,
    role: 'facilitator',
    campus,
    isActive: true,
    createdAt: stamp(monthStart),
    updatedAt: stamp(now),
  });

  for (let studentIndex = 0; studentIndex < 10; studentIndex++) {
    const studentId = syntheticId('student', campus, studentIndex);
    const createdAt = monthDate(months[Math.min(studentIndex % 8, 7)], 2 + (studentIndex % 10));
    set(db.collection('users').doc(studentId), {
      uid: studentId,
      email: `${studentId}@example.invalid`,
      displayName: `Synthetic student ${studentIndex + 1} – ${label}`,
      role: 'student',
      campus,
      isActive: true,
      createdAt: stamp(createdAt),
      updatedAt: stamp(now),
    });

    const linkId = `${facilitatorId}_${studentId}`;
    set(db.collection('facilitator_student_links').doc(linkId), {
      facilitatorId,
      studentId,
      status: 'accepted',
      requestedAt: stamp(createdAt),
      respondedAt: stamp(createdAt),
    });
    set(db.collection('conversations').doc(linkId), {
      participantIds: [facilitatorId, studentId],
      lastMessageAt: stamp(monthDate(months[11], 10 + (studentIndex % 10))),
      lastMessagePreview: 'Synthetic analytics demo message',
    });

    for (let monthIndex = 0; monthIndex < months.length; monthIndex++) {
      const month = months[monthIndex];
      const active = ((studentIndex * 3 + monthIndex + campus.length) % 7) < 3;
      if (active) {
        const appointmentId = syntheticId('appointment', campus, studentIndex * 12 + monthIndex);
        const eventDate = monthDate(month, 4 + ((studentIndex + monthIndex) % 20));
        set(db.collection('appointments').doc(appointmentId), {
          studentId,
          facilitatorId,
          campus,
          createdAt: stamp(eventDate),
          scheduledAt: stamp(monthDate(month, 6 + ((studentIndex + monthIndex) % 20))),
          durationMinutes: 45,
          status: monthIndex % 5 === 0 ? 'completed' : 'requested',
        });
        const messageId = syntheticId('message', campus, studentIndex * 12 + monthIndex);
        set(db.collection('messages').doc(messageId), {
          conversationId: linkId,
          senderId: studentId,
          createdAt: stamp(monthDate(month, 3 + ((studentIndex + monthIndex) % 20))),
          body: 'Synthetic analytics demo message',
          type: 'text',
          status: 'sent',
          readBy: [studentId, facilitatorId],
        });
      }

      if ((studentIndex + monthIndex + campus.length) % 4 !== 0) {
        for (const [assessmentIndex, assessmentId] of assessmentIds.entries()) {
          const attemptNumber = monthIndex + 1;
          const attemptId = `${assessmentId}_${studentId}_${attemptNumber}`;
          const submittedAt = monthDate(month, 8 + ((studentIndex + assessmentIndex) % 15));
          set(db.collection('assessment_attempts').doc(attemptId), {
            assessmentId,
            studentId,
            campus,
            attemptNumber,
            status: monthIndex % 6 === 0 ? 'submitted' : 'graded',
            startedAt: stamp(monthDate(month, 5 + (studentIndex % 5))),
            submittedAt: stamp(submittedAt),
            score: 55 + ((studentIndex * 7 + monthIndex * 3 + assessmentIndex * 11) % 41),
            answers: questionIds.map((questionId, answerIndex) => ({
              questionId,
              value: String((studentIndex + monthIndex + answerIndex) % 4),
              answeredAt: stamp(submittedAt),
            })),
          });
        }
      }
    }
  }
}

for (const [assessmentIndex, assessmentId] of assessmentIds.entries()) {
  set(db.collection('assessments').doc(assessmentId), {
    title: assessmentIndex === 0 ? 'Synthetic wellbeing check-in' : 'Synthetic student check-in',
    courseId: 'synthetic-analytics-demo',
    analyticsScoringVersion: 'standard-v1',
    isPublished: true,
    questions: questionIds.map((id, order) => ({
      id,
      order,
      type: 'multiple_choice',
      options: ['0', '1', '2', '3'].map(optionId => ({ id: optionId, label: optionId })),
    })),
  });
}

await writer.close();
console.log(`Created ${writes} tagged synthetic analytics documents in ${projectId}.`);
console.log(`To remove only these records: npm run seed:analytics:delete -- --delete`);

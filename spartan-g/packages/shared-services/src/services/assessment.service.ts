import {
  AssessmentDocument,
  AssessmentAttemptDocument,
  AssessmentAnswer,
} from '@spartan-g/shared-types';
import { serverTimestamp, Timestamp, where } from '../firebase/firestore';
import { assessmentRepository } from '../repositories/assessment.repository';
import { assessmentAttemptRepository } from '../repositories/assessment-attempt.repository';

class AssessmentService {
  async getAssessment(assessmentId: string): Promise<(AssessmentDocument & { id: string }) | null> {
    return assessmentRepository.getById(assessmentId);
  }

  async getAttempt(attemptId: string): Promise<(AssessmentAttemptDocument & { id: string }) | null> {
    return assessmentAttemptRepository.getById(attemptId);
  }

  async getStudentAttempts(
    assessmentId: string,
    studentId: string,
  ): Promise<(AssessmentAttemptDocument & { id: string })[]> {
    return assessmentAttemptRepository.getAttemptsForStudent(assessmentId, studentId);
  }

  async getInProgressAttempt(assessmentId: string, studentId: string): Promise<string | null> {
    const attempt = await assessmentAttemptRepository.getInProgressAttempt(assessmentId, studentId);
    return attempt?.id ?? null;
  }

  async getAttemptCount(assessmentId: string, studentId: string): Promise<number> {
    const attempts = await assessmentAttemptRepository.getAll([
      where('assessmentId', '==', assessmentId),
      where('studentId', '==', studentId),
      where('status', 'in', ['submitted', 'graded']),
    ]);
    return attempts.length;
  }

  async startAttempt(assessmentId: string, studentId: string): Promise<string> {
    const assessment = await this.getAssessment(assessmentId);
    if (!assessment) {
      throw new Error('Assessment not found');
    }

    const attemptCount = await this.getAttemptCount(assessmentId, studentId);
    if (attemptCount >= assessment.maxAttempts) {
      throw new Error('Maximum number of attempts reached');
    }

    const now = serverTimestamp() as Timestamp;
    const attemptId = `${assessmentId}_${studentId}_${attemptCount + 1}`;

    await assessmentAttemptRepository.create(attemptId, {
      assessmentId,
      studentId,
      answers: [],
      status: 'in_progress',
      startedAt: now,
      attemptNumber: attemptCount + 1,
    } as AssessmentAttemptDocument);

    return attemptId;
  }

  async saveAnswer(attemptId: string, answer: AssessmentAnswer): Promise<void> {
    const attempt = await this.getAttempt(attemptId);
    if (!attempt) {
      throw new Error('Attempt not found');
    }
    if (attempt.status !== 'in_progress') {
      throw new Error('Cannot modify a submitted or graded attempt');
    }

    // Replace serverTimestamp() sentinel with a plain Date (serverTimestamp() is not supported inside arrays)
    const safeAnswer: AssessmentAnswer = {
      ...answer,
      answeredAt: new Date() as unknown as Timestamp,
    };

    // Upsert: replace answer if question already answered, append if new
    const existingIndex = attempt.answers.findIndex(
      (a: AssessmentAnswer) => a.questionId === answer.questionId,
    );

    let updatedAnswers: AssessmentAnswer[];
    if (existingIndex >= 0) {
      updatedAnswers = [...attempt.answers];
      updatedAnswers[existingIndex] = safeAnswer;
    } else {
      updatedAnswers = [...attempt.answers, safeAnswer];
    }

    await assessmentAttemptRepository.update(attemptId, {
      answers: updatedAnswers,
    } as Partial<AssessmentAttemptDocument>);
  }

  async submitAttempt(
    attemptId: string,
    answers: AssessmentAnswer[],
  ): Promise<void> {
    const attempt = await this.getAttempt(attemptId);
    if (!attempt) {
      throw new Error('Attempt not found');
    }
    if (attempt.status !== 'in_progress') {
      throw new Error('Attempt already submitted or graded');
    }

    const now = serverTimestamp() as Timestamp;

    await assessmentAttemptRepository.update(attemptId, {
      answers,
      status: 'submitted',
      submittedAt: now,
    } as Partial<AssessmentAttemptDocument>);
  }
}

export const assessmentService = new AssessmentService();
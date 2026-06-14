import {
  PERMISSIONS,
  Role,
  PermissionError,
  hasPermission,
  AssessmentResponseDocument,
  AssessmentResponseValue,
} from '@spartan-g/shared-types';
import { assessmentResponseRepository } from '../repositories/assessment-response.repository';
import { assessmentRepository } from '../repositories/assessment.repository';

export interface SaveResponsePayload {
  assessmentId: string;
  questionId: string;
  studentId: string;
  value: AssessmentResponseValue;
}

class AssessmentResponseService {
  /** Get all saved responses for an assessment (used for resume hydration). */
  async getResponsesForAssessment(assessmentId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.TAKE_ASSESSMENTS)) {
      throw new PermissionError();
    }
    return assessmentResponseRepository.getByAssessment(assessmentId);
  }

  /** Save or update a single response (used during auto-save). */
  async saveResponse(payload: SaveResponsePayload, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.TAKE_ASSESSMENTS)) {
      throw new PermissionError();
    }

    // Verify the assessment exists and belongs to this student
    const assessment = await assessmentRepository.getById(payload.assessmentId);
    if (!assessment) throw new Error('Assessment not found');
    if (assessment.studentId !== payload.studentId) {
      throw new Error('You can only respond to your own assessments');
    }
    if (assessment.status !== 'in_progress') {
      throw new Error('This assessment has already been submitted');
    }

    const existing = await assessmentResponseRepository.getByAssessmentAndQuestion(
      payload.assessmentId,
      payload.questionId,
    );

    if (existing) {
      await assessmentResponseRepository.update(existing.id, {
        value: payload.value,
      } as Partial<AssessmentResponseDocument>);
    } else {
      const id = `aresp_${payload.assessmentId}_${payload.questionId}`;
      await assessmentResponseRepository.create(id, {
        assessmentId: payload.assessmentId,
        questionId: payload.questionId,
        studentId: payload.studentId,
        value: payload.value,
      } as AssessmentResponseDocument);
    }

    // Update the assessment's responseCount
    const allResponses = await assessmentResponseRepository.getByAssessment(payload.assessmentId);
    await assessmentRepository.update(payload.assessmentId, {
      responseCount: allResponses.length,
    } as Partial<AssessmentResponseDocument>);
  }

  /** Batch save multiple responses (used by auto-save and submit). */
  async saveResponses(
    assessmentId: string,
    studentId: string,
    responses: SaveResponsePayload[],
    actorRole: Role,
  ) {
    if (!hasPermission(actorRole, PERMISSIONS.TAKE_ASSESSMENTS)) {
      throw new PermissionError();
    }

    const assessment = await assessmentRepository.getById(assessmentId);
    if (!assessment) throw new Error('Assessment not found');
    if (assessment.studentId !== studentId) {
      throw new Error('You can only respond to your own assessments');
    }
    if (assessment.status !== 'in_progress') {
      throw new Error('This assessment has already been submitted');
    }

    const formattedResponses = responses.map((r) => ({
      assessmentId: r.assessmentId,
      questionId: r.questionId,
      studentId: r.studentId,
      value: r.value,
    }));

    await assessmentResponseRepository.upsertResponses(formattedResponses);

    // Update response count
    const allResponses = await assessmentResponseRepository.getByAssessment(assessmentId);
    await assessmentRepository.update(assessmentId, {
      responseCount: allResponses.length,
    } as Partial<AssessmentResponseDocument>);
  }
}

export const assessmentResponseService = new AssessmentResponseService();
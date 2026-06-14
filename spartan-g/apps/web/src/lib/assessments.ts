import {
  assessmentTemplateService,
  assessmentService,
  assessmentResponseService,
  type CreateAssessmentTemplatePayload,
  type UpdateAssessmentTemplatePayload,
  type SaveResponsePayload,
} from "@spartan-g/shared-services";
import type { Role } from "@spartan-g/shared-types";

/**
 * Thin client-side wrappers around the shared services.
 * The web app does not own the service instances — they live in
 * @spartan-g/shared-services so the mobile app can share them — so
 * we re-export them here for convenience and to keep the import
 * surface in pages tidy.
 */
export async function createTemplate(
  payload: CreateAssessmentTemplatePayload,
  actorRole: Role,
) {
  return assessmentTemplateService.createTemplate(payload, actorRole);
}

export async function updateTemplate(
  templateId: string,
  payload: UpdateAssessmentTemplatePayload,
  actorRole: Role,
) {
  return assessmentTemplateService.updateTemplate(templateId, payload, actorRole);
}

export async function disableTemplate(templateId: string, actorRole: Role) {
  return assessmentTemplateService.disableTemplate(templateId, actorRole);
}

export async function reenableTemplate(templateId: string, actorRole: Role) {
  return assessmentTemplateService.reenableTemplate(templateId, actorRole);
}

export async function getTemplateQuestions(templateId: string, actorRole: Role) {
  return assessmentTemplateService.getQuestionsForTemplate(templateId, actorRole);
}

export async function startAssessment(templateId: string, studentId: string, actorRole: Role) {
  return assessmentService.startAssessment(templateId, studentId, actorRole);
}

export async function getMyAssessments(studentId: string, actorRole: Role) {
  return assessmentService.getMyAssessments(studentId, actorRole);
}

export async function getAssessment(assessmentId: string, actorRole: Role) {
  return assessmentService.getAssessment(assessmentId, actorRole);
}

export async function submitAssessment(assessmentId: string, studentId: string, actorRole: Role) {
  return assessmentService.submitAssessment(assessmentId, studentId, actorRole);
}

// ─── Response wrappers ───────────────────────────────────────────

export async function getResponsesForAssessment(assessmentId: string, actorRole: Role) {
  return assessmentResponseService.getResponsesForAssessment(assessmentId, actorRole);
}

export async function saveResponse(payload: SaveResponsePayload, actorRole: Role) {
  return assessmentResponseService.saveResponse(payload, actorRole);
}

export async function saveResponses(
  assessmentId: string,
  studentId: string,
  responses: SaveResponsePayload[],
  actorRole: Role,
) {
  return assessmentResponseService.saveResponses(assessmentId, studentId, responses, actorRole);
}
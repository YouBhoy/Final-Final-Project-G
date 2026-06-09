import {
  assessmentTemplateService,
  assessmentService,
  type CreateAssessmentTemplatePayload,
  type UpdateAssessmentTemplatePayload,
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

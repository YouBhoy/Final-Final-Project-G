import {
  PERMISSIONS,
  ROLES,
  Role,
  PermissionError,
  hasPermission,
  AssessmentTemplateDocument,
  AssessmentQuestionDocument,
} from '@spartan-g/shared-types';
import { Timestamp } from '../firebase/firestore';
import { assessmentTemplateRepository } from '../repositories/assessment-template.repository';
import { assessmentQuestionRepository } from '../repositories/assessment-question.repository';

export interface CreateAssessmentTemplatePayload {
  title: string;
  description: string;
  category: string;
  createdBy: string;
  questions: Omit<
    AssessmentQuestionDocument,
    'id' | 'templateId' | 'createdAt' | 'updatedAt'
  >[];
}

export interface UpdateAssessmentTemplatePayload {
  title?: string;
  description?: string;
  category?: string;
  isActive?: boolean;
  /** If provided, the question set is fully replaced. */
  questions?: Omit<
    AssessmentQuestionDocument,
    'id' | 'templateId' | 'createdAt' | 'updatedAt'
  >[];
}

class AssessmentTemplateService {
  /** Active templates are visible to students. */
  async listActiveTemplates(actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.VIEW_ASSESSMENTS)) {
      throw new PermissionError();
    }
    return assessmentTemplateRepository.getActiveTemplates();
  }

  /** Admins see every template, active or not. */
  async listAllTemplates(actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_ASSESSMENT_TEMPLATES)) {
      throw new PermissionError();
    }
    return assessmentTemplateRepository.getAllTemplates();
  }

  async getTemplate(templateId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.VIEW_ASSESSMENTS)) {
      throw new PermissionError();
    }
    return assessmentTemplateRepository.getById(templateId);
  }

  async getQuestionsForTemplate(templateId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.VIEW_ASSESSMENTS)) {
      throw new PermissionError();
    }
    return assessmentQuestionRepository.getByTemplate(templateId);
  }

  async createTemplate(payload: CreateAssessmentTemplatePayload, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_ASSESSMENT_TEMPLATES)) {
      throw new PermissionError();
    }
    if (actorRole !== ROLES.SUPER_ADMIN) {
      throw new PermissionError('Only Super Admins can create assessment templates');
    }

    const id = `atpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const templateData: Omit<
      AssessmentTemplateDocument,
      'id' | 'createdAt' | 'updatedAt'
    > = {
      title: payload.title.trim(),
      description: payload.description.trim(),
      category: payload.category.trim(),
      version: 1,
      isActive: true,
      createdBy: payload.createdBy,
      questionCount: payload.questions.length,
    };

    await assessmentTemplateRepository.create(id, templateData as AssessmentTemplateDocument);
    await assessmentQuestionRepository.replaceForTemplate(id, payload.questions);

    return id;
  }

  async updateTemplate(
    templateId: string,
    payload: UpdateAssessmentTemplatePayload,
    actorRole: Role,
  ) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_ASSESSMENT_TEMPLATES)) {
      throw new PermissionError();
    }
    if (actorRole !== ROLES.SUPER_ADMIN) {
      throw new PermissionError('Only Super Admins can edit assessment templates');
    }

    const { questions, ...scalar } = payload;
    const update: Partial<AssessmentTemplateDocument> = { ...scalar } as Partial<AssessmentTemplateDocument>;

    if (questions) {
      update.questionCount = questions.length;
    }

    await assessmentTemplateRepository.update(templateId, update);

    if (questions) {
      await assessmentQuestionRepository.replaceForTemplate(templateId, questions);
    }
  }

  /**
   * "Disable" is implemented as a soft delete — the template is kept so
   * historical assessments still reference a valid document, but it
   * no longer appears to students.
   */
  async disableTemplate(templateId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_ASSESSMENT_TEMPLATES)) {
      throw new PermissionError();
    }
    if (actorRole !== ROLES.SUPER_ADMIN) {
      throw new PermissionError('Only Super Admins can disable assessment templates');
    }
    await assessmentTemplateRepository.update(templateId, { isActive: false } as Partial<AssessmentTemplateDocument>);
  }

  async reenableTemplate(templateId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_ASSESSMENT_TEMPLATES)) {
      throw new PermissionError();
    }
    await assessmentTemplateRepository.update(templateId, { isActive: true } as Partial<AssessmentTemplateDocument>);
  }
}

export const assessmentTemplateService = new AssessmentTemplateService();

// Re-export Timestamp for callers that want to type-narrow service return values.
export { Timestamp };

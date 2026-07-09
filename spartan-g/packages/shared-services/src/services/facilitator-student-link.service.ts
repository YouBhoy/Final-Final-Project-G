import {
  Role,
  FacilitatorStudentLinkDocument,
  hasPermission,
  PermissionError,
  PERMISSIONS,
} from '@spartan-g/shared-types';
import { facilitatorStudentLinkRepository } from '../repositories/facilitator-student-link.repository';

/**
 * Facilitator-Student Link Service
 *
 * Links are now created automatically when an appointment is accepted.
 * This service provides read-only access to check existing relationships.
 *
 * @deprecated The requestSupport, acceptRequest, and rejectRequest methods have been removed.
 * Links are now created exclusively through the appointment acceptance flow.
 */
class FacilitatorStudentLinkService {
  /**
   * Get all accepted links for a facilitator.
   * Used to check which students a facilitator has interacted with.
   */
  async getAcceptedLinks(facilitatorId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }
    return facilitatorStudentLinkRepository.getAcceptedLinks(facilitatorId);
  }

  /**
   * Get the conversation ID for a facilitator-student pair.
   * Returns null if no accepted link exists.
   */
  async getConversationId(facilitatorId: string, studentId: string): Promise<string | null> {
    const link = await facilitatorStudentLinkRepository.findLink(
      facilitatorId,
      studentId,
    );
    if (link && link.status === 'accepted') {
      // Conversation ID is deterministic: sorted participant IDs joined with underscore
      return [facilitatorId, studentId].sort().join('_');
    }
    return null;
  }
}

export const facilitatorStudentLinkService = new FacilitatorStudentLinkService();
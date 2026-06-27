import {
  Role,
  FacilitatorStudentLinkDocument,
  hasPermission,
  PermissionError,
} from '@spartan-g/shared-types';
import { PERMISSIONS } from '@spartan-g/shared-types';
import { serverTimestamp } from '../firebase/firestore';
import { facilitatorStudentLinkRepository } from '../repositories/facilitator-student-link.repository';
import { messagingService } from './messaging.service';

class FacilitatorStudentLinkService {
  async requestSupport(
    studentId: string,
    facilitatorId: string,
    actorRole: Role,
    notes?: string,
  ) {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }

    const existingLink = await facilitatorStudentLinkRepository.findLink(
      facilitatorId,
      studentId,
    );

    if (existingLink && existingLink.status === 'accepted') {
      // Link already exists and is accepted, return existing
      return existingLink.id;
    }

    if (existingLink && existingLink.status === 'pending') {
      // Link already pending
      return existingLink.id;
    }

    // Create new link
    const linkId = `${facilitatorId}_${studentId}`;
    await facilitatorStudentLinkRepository.create(linkId, {
      facilitatorId,
      studentId,
      status: 'pending',
      requestedAt: serverTimestamp() as any,
      notes,
    } as FacilitatorStudentLinkDocument);

    return linkId;
  }

  async acceptRequest(
    linkId: string,
    facilitatorId: string,
    actorRole: Role,
  ) {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }

    const link = await facilitatorStudentLinkRepository.getById(linkId);
    if (!link) {
      throw new Error('Link not found');
    }

    if (link.facilitatorId !== facilitatorId) {
      throw new Error('Not authorized to accept this request');
    }

    if (link.status !== 'pending') {
      throw new Error('Link is not in pending status');
    }

    // Update link to accepted
    await facilitatorStudentLinkRepository.update(linkId, {
      status: 'accepted',
      respondedAt: serverTimestamp() as any,
    } as Partial<FacilitatorStudentLinkDocument>);

    // Create conversation
    const conversationId = await messagingService.createConversation(
      [facilitatorId, link.studentId],
      actorRole,
    );

    return { linkId, conversationId };
  }

  async rejectRequest(
    linkId: string,
    facilitatorId: string,
    actorRole: Role,
    notes?: string,
  ) {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }

    const link = await facilitatorStudentLinkRepository.getById(linkId);
    if (!link) {
      throw new Error('Link not found');
    }

    if (link.facilitatorId !== facilitatorId) {
      throw new Error('Not authorized to reject this request');
    }

    if (link.status !== 'pending') {
      throw new Error('Link is not in pending status');
    }

    await facilitatorStudentLinkRepository.update(linkId, {
      status: 'rejected',
      respondedAt: serverTimestamp() as any,
      notes,
    } as Partial<FacilitatorStudentLinkDocument>);

    return linkId;
  }

  async getPendingRequests(facilitatorId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }
    return facilitatorStudentLinkRepository.getPendingByFacilitator(facilitatorId);
  }

  async getStudentRequests(studentId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }
    return facilitatorStudentLinkRepository.getByStudent(studentId);
  }

  async getAcceptedLinks(facilitatorId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }
    return facilitatorStudentLinkRepository.getAcceptedLinks(facilitatorId);
  }

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
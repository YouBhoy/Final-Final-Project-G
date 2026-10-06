import {
  PERMISSIONS,
  AUDIT_ACTIONS,
  Role,
  PermissionError,
  AppError,
  hasPermission,
  ResourceDocument,
  ResourceAudience,
  ResourceCategory,
  STORAGE_PATHS,
} from '@spartan-g/shared-types';
import { resourceRepository } from '../repositories/resource.repository';
import { auditService } from './audit.service';
import { storageService } from './storage.service';

export interface CreateResourcePayload {
  title: string;
  description?: string;
  category: ResourceCategory;
  tags?: string[];
  url?: string;
  audience: ResourceAudience;
  isActive: boolean;
  /** Optional uploaded file (uploaded as part of create). */
  file?: { blob: Blob; fileName: string };
}

export interface UpdateResourcePayload {
  title?: string;
  description?: string;
  category?: ResourceCategory;
  tags?: string[];
  url?: string;
  audience?: ResourceAudience;
  isActive?: boolean;
  /** Replace the stored file. */
  file?: { blob: Blob; fileName: string };
  /** Remove the stored file without removing the resource entry. */
  removeFile?: boolean;
}

type ResourceWriterContext = {
  actorRole: Role;
  actorUid: string;
  actorEmail?: string | null;
};

/**
 * Shared resource library — the single data source behind every portal's
 * `/resources` page.
 *
 * Reads: any active user (rules restrict non-admins to published entries).
 * Writes: Super Admin only (MANAGE_RESOURCES client check + Firestore rules).
 * Every mutation is recorded in the existing `audit_logs` collection.
 */
class ResourceService {
  /** Published resources — Students, Facilitators and Super Admin. */
  async listPublished(actorRole: Role): Promise<(ResourceDocument & { id: string })[]> {
    if (!hasPermission(actorRole, PERMISSIONS.VIEW_OWN_PROFILE)) {
      throw new PermissionError();
    }
    const audiences: ResourceAudience[] =
      actorRole === 'student'
        ? ['all', 'students']
        : actorRole === 'facilitator'
          ? ['all', 'facilitators']
          : ['all', 'students', 'facilitators'];
    return resourceRepository.getPublished(audiences);
  }

  /** Every resource including drafts — Super Admin management view. */
  async listAll(actorRole: Role): Promise<(ResourceDocument & { id: string })[]> {
    this.assertCanManage(actorRole);
    return resourceRepository.getAllForAdmin();
  }

  async getResource(
    id: string,
    actorRole: Role,
  ): Promise<(ResourceDocument & { id: string }) | null> {
    if (!hasPermission(actorRole, PERMISSIONS.VIEW_OWN_PROFILE)) {
      throw new PermissionError();
    }
    return resourceRepository.getById(id);
  }

  async createResource(
    payload: CreateResourcePayload,
    ctx: ResourceWriterContext,
  ): Promise<string> {
    this.assertCanManage(ctx.actorRole);

    const id = `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    let fileUrl: string | undefined;
    let filePath: string | undefined;
    if (payload.file) {
      filePath = `${STORAGE_PATHS.RESOURCES}/${id}/${payload.file.fileName}`;
      fileUrl = await storageService.uploadFile(filePath, payload.file.blob);
    }

    const data: Omit<ResourceDocument, 'id' | 'createdAt' | 'updatedAt'> = {
      title: payload.title.trim(),
      description: payload.description?.trim() || null,
      category: payload.category,
      tags: payload.tags?.map((t) => t.trim()).filter(Boolean) ?? [],
      url: payload.url?.trim() || null,
      fileUrl: fileUrl ?? null,
      filePath: filePath ?? null,
      audience: payload.audience,
      isActive: payload.isActive,
      createdBy: ctx.actorUid,
    };

    try {
      await resourceRepository.create(id, data as ResourceDocument);
    } catch (error) {
      if (filePath) await this.deleteStorageFile(filePath);
      throw error;
    }

    await auditService.record({
      actorId: ctx.actorUid,
      actorEmail: ctx.actorEmail,
      action: AUDIT_ACTIONS.SUPERADMIN_CREATED_RESOURCE,
      resource: 'resources',
      resourceId: id,
      metadata: { resourceName: payload.title.trim(), changedFields: Object.keys(data) },
    });

    return id;
  }

  async updateResource(
    id: string,
    payload: UpdateResourcePayload,
    ctx: ResourceWriterContext,
  ): Promise<void> {
    this.assertCanManage(ctx.actorRole);

    const existing = await resourceRepository.getById(id);
    if (!existing) {
      throw new AppError('Resource not found', 'resource/not-found');
    }

    const update: Partial<ResourceDocument> = {};
    if (payload.title !== undefined) update.title = payload.title.trim();
    if (payload.description !== undefined)
      update.description = payload.description.trim() || null;
    if (payload.category !== undefined) update.category = payload.category;
    if (payload.tags !== undefined)
      update.tags = payload.tags.map((t) => t.trim()).filter(Boolean);
    if (payload.url !== undefined) update.url = payload.url.trim() || null;
    if (payload.audience !== undefined) update.audience = payload.audience;
    if (payload.isActive !== undefined) update.isActive = payload.isActive;

    // File replacement / removal — keep fileUrl + filePath consistent.
    // NOTE: null (not undefined) is used to clear fields because
    // BaseRepository.update() strips undefined values before writing.
    let replacedFilePath: string | undefined;
    if (payload.removeFile) {
      update.fileUrl = null;
      update.filePath = null;
    } else if (payload.file) {
      const filePath = `${STORAGE_PATHS.RESOURCES}/${id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${payload.file.fileName}`;
      update.fileUrl = await storageService.uploadFile(filePath, payload.file.blob);
      update.filePath = filePath;
      replacedFilePath = filePath;
    }

    try {
      await resourceRepository.update(id, update);
    } catch (error) {
      if (replacedFilePath && replacedFilePath !== existing.filePath) {
        await this.deleteStorageFile(replacedFilePath);
      }
      throw error;
    }

    if (existing.filePath && existing.filePath !== replacedFilePath && (payload.removeFile || payload.file)) {
      await this.deleteStorageFile(existing.filePath);
    }

    await auditService.record({
      actorId: ctx.actorUid,
      actorEmail: ctx.actorEmail,
      action: AUDIT_ACTIONS.SUPERADMIN_UPDATED_RESOURCE,
      resource: 'resources',
      resourceId: id,
      metadata: {
        resourceName: payload.title?.trim() ?? existing.title,
        changedFields: Object.keys(update),
      },
    });
  }

  async deleteResource(id: string, ctx: ResourceWriterContext): Promise<void> {
    this.assertCanManage(ctx.actorRole);

    const existing = await resourceRepository.getById(id);
    if (!existing) return;

    await resourceRepository.delete(id);
    if (existing.filePath) {
      await this.deleteStorageFile(existing.filePath);
    }

    await auditService.record({
      actorId: ctx.actorUid,
      actorEmail: ctx.actorEmail,
      action: AUDIT_ACTIONS.SUPERADMIN_DELETED_RESOURCE,
      resource: 'resources',
      resourceId: id,
      metadata: { resourceName: existing.title },
    });
  }

  private assertCanManage(actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_RESOURCES)) {
      throw new PermissionError();
    }
  }

  private async deleteStorageFile(path: string): Promise<void> {
    try {
      await storageService.deleteFile(path);
    } catch {
      // The file may already be gone — the Firestore record is what matters.
    }
  }
}

export const resourceService = new ResourceService();

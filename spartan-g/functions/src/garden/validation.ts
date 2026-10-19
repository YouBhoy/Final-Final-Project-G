import type {
  AssessmentRewardRequest, GardenDocument, GardenState, StoredTimestamp, WateringRequest,
} from './types';
import { parseUtcDay } from './dates';

export class GardenValidationError extends Error {
  constructor(readonly field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = 'GardenValidationError';
  }
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new GardenValidationError(field, 'expected a record');
  }
  return value as Record<string, unknown>;
}

export function parseDocumentId(value: unknown, field: string): string {
  // Conservative ID validation, without rewriting or trimming stored identities.
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('/')
      || value === '.' || value === '..') {
    throw new GardenValidationError(field, 'expected a nonempty single document ID');
  }
  return value;
}

export function nonnegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new GardenValidationError(field, 'expected a nonnegative safe integer');
  }
  return value;
}

function storedDay(value: unknown, field: string) {
  if (value === '') return '' as const;
  try { return parseUtcDay(value); }
  catch { throw new GardenValidationError(field, 'expected YYYY-MM-DD or empty string'); }
}

/** A validated projection, not a replacement document: extra legacy fields survive in storage. */
export function parseGardenState(value: unknown, expectedStudentId: string): GardenState {
  const data = record(value, 'garden');
  const expected = parseDocumentId(expectedStudentId, 'expectedStudentId');
  const studentId = parseDocumentId(data.studentId, 'studentId');
  if (studentId !== expected || (data.id !== undefined && data.id !== expected)) {
    throw new GardenValidationError('studentId', 'does not match the Garden document owner');
  }
  const level = nonnegativeInteger(data.level, 'level');
  if (level < 1) throw new GardenValidationError('level', 'must be at least one');
  return {
    studentId, level,
    xp: nonnegativeInteger(data.xp, 'xp'),
    seeds: nonnegativeInteger(data.seeds, 'seeds'),
    streakCount: nonnegativeInteger(data.streakCount, 'streakCount'),
    lastCheckInDate: storedDay(data.lastCheckInDate, 'lastCheckInDate'),
    lastWateredDate: storedDay(data.lastWateredDate, 'lastWateredDate'),
  };
}

function timestamp(value: unknown, field: string): StoredTimestamp {
  const data = record(value, field);
  if (typeof data.seconds !== 'number' || !Number.isSafeInteger(data.seconds)) {
    throw new GardenValidationError(field, 'expected integer timestamp seconds');
  }
  const nanoseconds = nonnegativeInteger(data.nanoseconds, `${field}.nanoseconds`);
  if (nanoseconds >= 1_000_000_000) {
    throw new GardenValidationError(field, 'nanoseconds must be below one billion');
  }
  return { seconds: data.seconds, nanoseconds };
}

export function parseGardenDocument(value: unknown, expectedStudentId: string): GardenDocument {
  const data = record(value, 'garden');
  return {
    ...parseGardenState(data, expectedStudentId),
    createdAt: timestamp(data.createdAt, 'createdAt'),
    updatedAt: timestamp(data.updatedAt, 'updatedAt'),
  };
}

function identityRequest(value: unknown, field: 'attemptId' | 'requestId'): string {
  const data = record(value, 'request');
  if (Object.keys(data).length !== 1 || !Object.hasOwn(data, field)) {
    throw new GardenValidationError('request', `only ${field} is accepted`);
  }
  return parseDocumentId(data[field], field);
}

export function parseAssessmentRewardRequest(value: unknown): AssessmentRewardRequest {
  return { attemptId: identityRequest(value, 'attemptId') };
}

export function parseWateringRequest(value: unknown): WateringRequest {
  return { requestId: identityRequest(value, 'requestId') };
}

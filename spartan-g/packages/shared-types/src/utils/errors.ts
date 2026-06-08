export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class AuthError extends AppError {
  constructor(message: string, code = 'auth/error', cause?: unknown) {
    super(message, code, cause);
    this.name = 'AuthError';
  }
}

export class PermissionError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 'permission/denied');
    this.name = 'PermissionError';
  }
}

export class PlatformAccessError extends AppError {
  constructor(message = 'This role is not available on this platform') {
    super(message, 'platform/access-denied');
    this.name = 'PlatformAccessError';
  }
}

export class RepositoryError extends AppError {
  constructor(message: string, code = 'repository/error', cause?: unknown) {
    super(message, code, cause);
    this.name = 'RepositoryError';
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}

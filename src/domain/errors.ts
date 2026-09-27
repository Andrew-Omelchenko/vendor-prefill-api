export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class PrefillAlreadyExistsError extends Error {
  constructor(public readonly id: string) {
    super(`Prefill record "${id}" already exists`);
    this.name = 'PrefillAlreadyExistsError';
  }
}

export class NotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Prefill record "${id}" not found`);
    this.name = 'NotFoundError';
  }
}

export class VersionConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Prefill record "${id}" was modified by someone else`);
    this.name = 'VersionConflictError';
  }
}

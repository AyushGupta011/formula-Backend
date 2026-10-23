export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export class ValidationError extends AppError {
  constructor(message, details, code = 'VALIDATION_ERROR') { super(400, code, message, details); }
}
export class NotFoundError extends AppError {
  constructor(message) { super(404, 'NOT_FOUND', message); }
}
export class ConflictError extends AppError {

  constructor(current) {
    super(409, 'VERSION_CONFLICT', 'A newer version of this record already exists', { current });
  }
}
export class CycleError extends AppError {
  constructor(path) {
    super(400, 'DEPENDENCY_CYCLE', `Dependency loop: ${path.join(' → ')}`, { path });
  }
}

export default { AppError, ValidationError, NotFoundError, ConflictError, CycleError };

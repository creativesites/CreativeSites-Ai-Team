// Shared error classes. The API layer maps these to HTTP statuses (400, 404, 409, 403).
export class InputError extends Error {}
export class NotFoundError extends Error {}
export class ConflictError extends Error {}
export class ForbiddenError extends Error {}

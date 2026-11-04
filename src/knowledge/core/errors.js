'use strict';

/** Typed, machine-readable errors so tools/UI can react without parsing prose. */
class KiError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'KiError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
const notFound = (what, id) => new KiError('NOT_FOUND', `${what} not found: ${id}`, { what, id });
const invalid = (message, details) => new KiError('INVALID_INPUT', message, details);
const forbidden = (message, details) => new KiError('FORBIDDEN', message, details);
const conflict = (message, details) => new KiError('CONFLICT', message, details);
const illegalState = (message, details) => new KiError('ILLEGAL_STATE', message, details);

module.exports = { KiError, notFound, invalid, forbidden, conflict, illegalState };

'use strict';
/** Tiny JSON-Schema-subset validator (type, required, enum, bounds, items, properties, additionalProperties). */
const { invalid } = require('../core/errors');

function check(schema, value, path, errs) {
  if (value === undefined) return;
  const types = [].concat(schema.type || []);
  if (types.length) {
    const t = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value === 'number' && Number.isInteger(value) && types.includes('integer') ? 'integer' : typeof value;
    if (!types.includes(t)) { errs.push(`${path}: expected ${types.join('|')}, got ${t}`); return; }
  }
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${path}: must be one of ${schema.enum.join(', ')}`);
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errs.push(`${path}: too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errs.push(`${path}: too long (max ${schema.maxLength})`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(`${path}: invalid format`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${path}: below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${path}: above maximum ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errs.push(`${path}: too many items`);
    if (schema.items) value.forEach((v, i) => check(schema.items, v, `${path}[${i}]`, errs));
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && schema.properties) {
    for (const r of schema.required || []) if (value[r] === undefined) errs.push(`${path}.${r}: required`);
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties[k]) check(schema.properties[k], v, `${path}.${k}`, errs);
      else if (schema.additionalProperties === false) errs.push(`${path}.${k}: not an allowed field`);
    }
  }
}
function validate(schema, input) {
  const errs = [];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw invalid('Tool input must be an object');
  check({ ...schema, type: 'object' }, input, 'input', errs);
  if (errs.length) throw invalid(`Invalid input: ${errs.join('; ')}`, { errors: errs });
}
module.exports = { validate };

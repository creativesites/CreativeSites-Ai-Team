/** A small JSON Schema subset validator: enough for tool inputs, no dependencies. */
export interface JsonSchema {
  type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array';
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  enum?: readonly (string | number)[];
  items?: JsonSchema;
  maxLength?: number;
  minLength?: number;
  minimum?: number;
  maximum?: number;
  maxItems?: number;
  description?: string;
}

export function validate(schema: JsonSchema, value: unknown, at = 'arguments'): string[] {
  const errs: string[] = [];
  const t = schema.type;
  if (t === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${at} must be an object`];
    const obj = value as Record<string, unknown>;
    for (const k of schema.required ?? []) if (obj[k] === undefined || obj[k] === null) errs.push(`${at}.${k} is required`);
    for (const [k, v] of Object.entries(obj)) {
      const sub = schema.properties?.[k];
      if (!sub) {
        if (schema.additionalProperties === false) errs.push(`${at}.${k} is not allowed`);
        continue;
      }
      if (v !== undefined && v !== null) errs.push(...validate(sub, v, `${at}.${k}`));
    }
    return errs;
  }
  if (t === 'string') {
    if (typeof value !== 'string') return [`${at} must be a string`];
    if (schema.minLength !== undefined && value.length < schema.minLength) errs.push(`${at} is too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errs.push(`${at} is longer than ${schema.maxLength}`);
  } else if (t === 'number' || t === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (t === 'integer' && !Number.isInteger(value))) return [`${at} must be ${t === 'integer' ? 'an integer' : 'a number'}`];
    if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${at} must be ≥ ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${at} must be ≤ ${schema.maximum}`);
  } else if (t === 'boolean') {
    if (typeof value !== 'boolean') return [`${at} must be a boolean`];
  } else if (t === 'array') {
    if (!Array.isArray(value)) return [`${at} must be an array`];
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errs.push(`${at} has more than ${schema.maxItems} items`);
    if (schema.items) value.forEach((v, i) => errs.push(...validate(schema.items!, v, `${at}[${i}]`)));
  }
  if (schema.enum && !schema.enum.includes(value as string | number)) errs.push(`${at} must be one of ${schema.enum.join(', ')}`);
  return errs;
}

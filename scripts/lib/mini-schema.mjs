// Small JSON-Schema subset validator for OpenAPI component schemas (no ajv installed).
// Supports $ref, type, required, properties, additionalProperties, enum, minimum, maximum,
// minLength, minItems, maxItems, items, format (uuid, date-time).
const FORMATS = {
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "date-time": /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
};
const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function deref(root, ref) {
  const node = ref.slice(2).split("/").reduce((n, k) => (isObj(n) ? n[k] : undefined), root);
  if (!isObj(node)) throw new Error(`$ref tidak ditemukan: ${ref}`);
  return node;
}

/** Returns a list of error strings (empty when value conforms). */
export function validate(value, schema, root, at = "payload") {
  if (typeof schema.$ref === "string") {
    try {
      return validate(value, deref(root, schema.$ref), root, at);
    } catch (e) {
      return [e.message];
    }
  }
  const errors = [];
  const t = typeOf(value);
  if (schema.type && !(schema.type === t || (schema.type === "number" && t === "integer"))) {
    return [`${at}: tipe harus ${schema.type}, ditemukan ${t}`];
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: nilai di luar enum`);
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: kurang dari minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at}: melebihi maksimum ${schema.maximum}`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${at}: terlalu pendek`);
    const fmt = FORMATS[schema.format];
    if (fmt && !fmt.test(value)) errors.push(`${at}: format ${schema.format} tidak valid`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at}: kurang dari ${schema.minItems} item`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${at}: lebih dari ${schema.maxItems} item`);
    if (isObj(schema.items)) value.forEach((v, i) => errors.push(...validate(v, schema.items, root, `${at}[${i}]`)));
  }
  if (isObj(value)) errors.push(...validateObject(value, schema, root, at));
  return errors;
}

function validateObject(value, schema, root, at) {
  const errors = [];
  const props = isObj(schema.properties) ? schema.properties : {};
  for (const k of schema.required ?? []) if (!(k in value)) errors.push(`${at}.${k}: field wajib hilang`);
  for (const [k, v] of Object.entries(value)) {
    if (props[k]) errors.push(...validate(v, props[k], root, `${at}.${k}`));
    else if (schema.additionalProperties === false) errors.push(`${at}.${k}: field tidak dikenal`);
    else if (isObj(schema.additionalProperties)) errors.push(...validate(v, schema.additionalProperties, root, `${at}.${k}`));
  }
  return errors;
}

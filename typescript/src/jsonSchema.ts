import type { DtoMember, DtoShape, DtoSpec } from "./dto.js";

/** JSON Schema dialect the emitted document declares. */
export const kJsonSchemaDialect =
  "https://json-schema.org/draft/2020-12/schema";

/**
 * Roles describing payloads the server **accepts**. Those are closed
 * (`additionalProperties: false`) so an unexpected key is an error; response
 * roles stay open so a backend may add fields without breaking readers.
 */
const STRICT_ROLES = new Set(["request", "queryParams", "pathParams", "child"]);

/** Constraint keys that belong on the schema for a value. */
const CONSTRAINT_KEYS = [
  "maxLength",
  "minLength",
  "minimum",
  "maximum",
  "pattern",
  "format",
] as const;

function withConstraints(
  base: Record<string, unknown>,
  member: DtoMember,
): Record<string, unknown> {
  const out = { ...base };
  for (const key of CONSTRAINT_KEYS) {
    if (member.constraints[key] !== undefined) {
      out[key] = member.constraints[key];
    }
  }
  return out;
}

/** The schema for one member's value. */
function memberSchema(member: DtoMember): Record<string, unknown> {
  if (member.type === "array") {
    // An array's constraints describe its elements, not the array itself.
    const items: Record<string, unknown> =
      member.itemType === "object" && member.shape
        ? { $ref: `#/$defs/${member.shape}` }
        : withConstraints({ type: member.itemType ?? "string" }, member);
    return { type: "array", items };
  }
  if (member.type === "object" && member.shape) {
    return { $ref: `#/$defs/${member.shape}` };
  }
  return withConstraints({ type: member.type }, member);
}

function shapeSchema(shape: DtoShape): Record<string, unknown> {
  const out: Record<string, unknown> = { type: "object" };
  if (STRICT_ROLES.has(shape.role)) out.additionalProperties = false;

  const required = shape.members.filter((m) => !m.optional).map((m) => m.name);
  if (required.length > 0) out.required = required;

  const properties: Record<string, unknown> = {};
  for (const member of shape.members) {
    properties[member.name] = memberSchema(member);
  }
  out.properties = properties;
  return out;
}

/**
 * Emits a [DtoSpec] as a single JSON Schema 2020-12 document: every shape lands
 * under `$defs` so shapes can `$ref` each other (a list response points at its
 * row, a request at its child rows).
 *
 * Returns a plain object — serializing it is the caller's business, so hatake
 * stays dependency-free (same arrangement as `QuerySpec` → adapters).
 */
export function toJsonSchema(spec: DtoSpec): Record<string, unknown> {
  const defs: Record<string, unknown> = {};
  for (const shape of spec.shapes) {
    defs[shape.name] = shapeSchema(shape);
  }
  return {
    $schema: kJsonSchemaDialect,
    title: spec.page,
    $defs: defs,
  };
}

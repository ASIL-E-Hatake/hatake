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

/**
 * 「この値はサーバが決める／画面が計算する」を契約に出す（`readOnly`）。
 *
 * 定義には書いてあるのに、契約には**ただの任意の項目**として出ていた＝サーバ側を書く
 * 人は「送られてくるのか、送っていいのか、無視していいのか」を定義から読めない。
 * JSON Schema の `readOnly` は「持ち主が決める値で、書き換えは無視されて構わない」と
 * いう注記なので、`readOnly` の項目と**計算項目**にそのまま当たる。
 *
 * 注記なので判定は変わらない（枠組みの client は下書きごと送るので、送れなくなると
 * 困る）。サーバは受け取った値を無視して**定義から計算し直してよい**、が意味。
 */
const managedByServer = (member: DtoMember): boolean =>
  member.readOnly || member.computed;

/** The schema for one member's value. [refBase] prefixes `$ref` pointers. */
function memberSchema(
  member: DtoMember,
  refBase: string,
): Record<string, unknown> {
  const managed = managedByServer(member) ? { readOnly: true } : {};
  if (member.type === "array") {
    // An array's constraints describe its elements, not the array itself.
    const items: Record<string, unknown> =
      member.itemType === "object" && member.shape
        ? { $ref: `${refBase}${member.shape}` }
        : withConstraints({ type: member.itemType ?? "string" }, member);
    return { type: "array", items, ...managed };
  }
  if (member.type === "object" && member.shape) {
    return { $ref: `${refBase}${member.shape}`, ...managed };
  }
  return { ...withConstraints({ type: member.type }, member), ...managed };
}

function shapeSchema(
  shape: DtoShape,
  refBase: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { type: "object" };
  if (STRICT_ROLES.has(shape.role)) out.additionalProperties = false;

  const required = shape.members.filter((m) => !m.optional).map((m) => m.name);
  if (required.length > 0) out.required = required;

  const properties: Record<string, unknown> = {};
  for (const member of shape.members) {
    properties[member.name] = memberSchema(member, refBase);
  }
  out.properties = properties;
  return out;
}

/**
 * Every shape as a name → schema map, with `$ref` pointers rooted at [refBase].
 * Shared by the JSON Schema and OpenAPI emitters, which differ only in where
 * schemas live in the document (`#/$defs/` vs `#/components/schemas/`).
 */
export function schemasOf(
  spec: DtoSpec,
  refBase: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const shape of spec.shapes) {
    out[shape.name] = shapeSchema(shape, refBase);
  }
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
  return {
    $schema: kJsonSchemaDialect,
    title: spec.page,
    $defs: schemasOf(spec, "#/$defs/"),
  };
}

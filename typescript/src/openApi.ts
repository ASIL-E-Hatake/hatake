import type { DtoShape, DtoSpec } from "./dto.js";
import { schemasOf } from "./jsonSchema.js";

/** OpenAPI version the emitted document declares. */
export const kOpenApiVersion = "3.1.0";

/** Where OpenAPI keeps its schemas, and therefore what `$ref` must point at. */
const REF_BASE = "#/components/schemas/";

/** Schema name for the framework's validation failure payload. */
export const kValidationErrorSchema = "ValidationErrorResponse";

export interface OpenApiOptions {
  /**
   * Route the operations hang off, e.g. `/api/customers`. **Omit it to emit
   * `components.schemas` only** — the DSL deliberately knows nothing about URLs
   * (a definition must not depend on transport), so the path has to come from
   * the caller rather than be guessed from a page id or repository key.
   */
  basePath?: string;
  /** `info.title`. Defaults to the page id. */
  title?: string;
  /** `info.version`. Defaults to `1.0.0`. */
  version?: string;
}

/** Paging and sorting parameters, fixed by the `RepositoryQuery` contract. */
const QUERY_CONTRACT: Array<[string, string]> = [
  ["page", "integer"],
  ["pageSize", "integer"],
  ["sortField", "string"],
  ["sortAscending", "boolean"],
];

function byRole(spec: DtoSpec, role: string): DtoShape | undefined {
  return spec.shapes.find((s) => s.role === role);
}

/** `customer_master` -> `customerMaster`, for operationIds. */
function camel(id: string): string {
  const parts = id.split(/[_\-\s]+/).filter((p) => p.length > 0);
  return parts
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("");
}

function ref(name: string): Record<string, unknown> {
  return { $ref: `${REF_BASE}${name}` };
}

function jsonBody(name: string, description: string): Record<string, unknown> {
  return {
    description,
    content: { "application/json": { schema: ref(name) } },
  };
}

/** The framework reports validation failures as ValidationResult. */
function validationErrorSchema(): Record<string, unknown> {
  return {
    type: "object",
    description:
      "Validation failure as reported by FormValidator (ValidationResult).",
    required: ["valid", "errors"],
    properties: {
      valid: { type: "boolean" },
      errors: {
        type: "array",
        items: {
          type: "object",
          required: ["field", "message"],
          properties: { field: { type: "string" }, message: { type: "string" } },
        },
      },
    },
  };
}

const BAD_REQUEST = {
  400: jsonBody(kValidationErrorSchema, "Validation failed."),
} as const;

const NOT_FOUND = { 404: { description: "Not found." } } as const;

/**
 * Emits a [DtoSpec] as an OpenAPI 3.1 document.
 *
 * 3.1 rather than 3.0 because its Schema Object **is** JSON Schema 2020-12, so
 * the Phase 2 output drops in unchanged — no `nullable` / `exclusiveMinimum`
 * rewriting, and `$ref` / `format` / `additionalProperties` keep their meaning.
 *
 * Operations are emitted only when the shapes they need exist, so a read-only
 * `search` page yields just the list operation while a `form` page yields no
 * list at all. Returns a plain object; serializing is the caller's business.
 */
export function toOpenApi(
  spec: DtoSpec,
  options: OpenApiOptions = {},
): Record<string, unknown> {
  const schemas = schemasOf(spec, REF_BASE);

  const request = byRole(spec, "request");
  const response = byRole(spec, "response");
  const listResponse = byRole(spec, "listResponse");
  const queryParams = byRole(spec, "queryParams");
  const pathParams = byRole(spec, "pathParams");

  const doc: Record<string, unknown> = {
    openapi: kOpenApiVersion,
    info: {
      title: options.title ?? spec.page,
      version: options.version ?? "1.0.0",
    },
  };

  const basePath = options.basePath;
  if (basePath === undefined) {
    // Schemas only — the caller wires the routes.
    doc.components = { schemas };
    return doc;
  }

  if (request) schemas[kValidationErrorSchema] = validationErrorSchema();

  const op = camel(spec.page);
  const paths: Record<string, Record<string, unknown>> = {};

  const collection: Record<string, unknown> = {};
  if (listResponse) {
    collection.get = {
      operationId: `${op}List`,
      summary: `List ${spec.page}`,
      parameters: [
        ...(queryParams?.members ?? []).map((m) => ({
          name: m.name,
          in: "query",
          required: false,
          schema: (schemas[queryParams!.name] as any).properties[m.name],
        })),
        ...QUERY_CONTRACT.map(([name, type]) => ({
          name,
          in: "query",
          required: false,
          schema: { type },
        })),
      ],
      responses: { 200: jsonBody(listResponse.name, "A page of results.") },
    };
  }
  if (request) {
    collection.post = {
      operationId: `${op}Create`,
      summary: `Create ${spec.page}`,
      requestBody: { required: true, ...jsonBody(request.name, "The record to create.") },
      responses: {
        201: jsonBody((response ?? request).name, "The created record."),
        ...BAD_REQUEST,
      },
    };
  }
  if (Object.keys(collection).length > 0) paths[basePath] = collection;

  // Single-record route. `pathParams` always has exactly the key field.
  const keyName = pathParams?.members[0]?.name;
  if (keyName !== undefined) {
    const keyParam = {
      name: keyName,
      in: "path",
      required: true,
      schema: { type: "string" },
    };
    const item: Record<string, unknown> = {};
    if (response) {
      item.get = {
        operationId: `${op}Get`,
        summary: `Fetch one ${spec.page}`,
        parameters: [keyParam],
        responses: {
          200: jsonBody(response.name, "The record."),
          ...NOT_FOUND,
        },
      };
    }
    if (request) {
      item.put = {
        operationId: `${op}Update`,
        summary: `Update ${spec.page}`,
        parameters: [keyParam],
        requestBody: { required: true, ...jsonBody(request.name, "The new values.") },
        responses: {
          200: jsonBody((response ?? request).name, "The updated record."),
          ...BAD_REQUEST,
          ...NOT_FOUND,
        },
      };
      item.delete = {
        operationId: `${op}Delete`,
        summary: `Delete ${spec.page}`,
        parameters: [keyParam],
        responses: { 204: { description: "Deleted." }, ...NOT_FOUND },
      };
    }
    if (Object.keys(item).length > 0) {
      paths[`${basePath}/{${keyName}}`] = item;
    }
  }

  doc.paths = paths;
  doc.components = { schemas };
  return doc;
}

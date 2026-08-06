import {
  FieldTypes,
  formFields,
  wizardForm,
  type FieldDefinition,
  type FilterDefinition,
  type PageDefinition,
} from "./definition.js";

/**
 * A framework-neutral description of one API payload shape, derived from a page
 * definition. Emit JSON Schema / OpenAPI / native types from this in your own
 * adapter; hatake itself stays dependency-free (same arrangement as QuerySpec).
 */
export interface DtoShape {
  name: string;
  /** request | row | listResponse | queryParams | pathParams | child */
  role: string;
  members: DtoMember[];
}

export interface DtoMember {
  name: string;
  /** string | number | boolean | object | array — an open string. */
  type: string;
  /** Whether the payload may omit this member. */
  optional: boolean;
  /** Element type when `type` is `array`. */
  itemType?: string;
  /** Referenced shape name when this member is an object / array of objects. */
  shape?: string;
  /** Derived from `validators` (maxLength / minimum / maximum / pattern / format). */
  constraints: Record<string, unknown>;
}

export interface DtoSpec {
  /** Page id this spec was derived from. */
  page: string;
  shapes: DtoShape[];
}

/** `customer_master` -> `CustomerMaster`. */
function pascal(id: string): string {
  return id
    .split(/[_\-\s]+/)
    .filter((p) => p.length > 0)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

/** Maps a field/filter `type` onto a DTO member type. */
function memberType(type: string): string {
  switch (type) {
    case FieldTypes.number:
      return "number";
    case FieldTypes.checkbox:
      return "boolean";
    case FieldTypes.multiSelect:
    case FieldTypes.subTable:
      return "array";
    default:
      // text / textarea / select / radio / date / dateTime / time and any
      // plugin type fall back to string.
      return "string";
  }
}

/** `date` / `dateTime` / `time` carry their shape in a `format` constraint. */
function formatOf(type: string): string | undefined {
  switch (type) {
    case FieldTypes.date:
      return "date";
    case FieldTypes.dateTime:
      return "date-time";
    case FieldTypes.time:
      return "time";
    default:
      return undefined;
  }
}

/** Translates a field's validators into JSON-Schema-flavoured constraints. */
function constraintsOf(field: FieldDefinition): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const format = formatOf(field.type);
  if (format !== undefined) out.format = format;

  for (const rule of field.validators) {
    switch (rule.type) {
      case "maxLength":
        out.maxLength = rule.params.value;
        break;
      case "minLength":
        out.minLength = rule.params.value;
        break;
      case "min":
        out.minimum = rule.params.value;
        break;
      case "max":
        out.maximum = rule.params.value;
        break;
      case "pattern":
        out.pattern = rule.params.pattern;
        break;
      case "email":
        out.format = "email";
        break;
      case "postalCode":
        out.pattern = "^[0-9]{3}-?[0-9]{4}$";
        break;
      default:
        // Plugin validators carry no schema meaning here; ignore them.
        break;
    }
  }
  return out;
}

/** Child shape name for a `subTable` field: `<Page><Field>Row`. */
function childShapeName(page: string, field: string): string {
  return `${pascal(page)}${pascal(field)}Row`;
}

function requestMember(
  pageId: string,
  field: FieldDefinition,
): DtoMember | undefined {
  // Derived and read-only values are not something the server accepts.
  if (field.computed || field.readOnly) return undefined;
  // Repository-backed child rows travel on their own endpoint.
  if (field.type === FieldTypes.subTable && field.source) return undefined;

  const member: DtoMember = {
    name: field.field,
    type: memberType(field.type),
    optional: !field.required,
    constraints: constraintsOf(field),
  };
  if (field.type === FieldTypes.subTable) {
    member.itemType = "object";
    member.shape = childShapeName(pageId, field.field);
  } else if (field.type === FieldTypes.multiSelect) {
    member.itemType = "string";
  }
  return member;
}

function queryMember(filter: FilterDefinition): DtoMember {
  const base = memberType(filter.type);
  const format = formatOf(filter.type);
  const constraints: Record<string, unknown> = {};
  if (format !== undefined) constraints.format = format;

  // `between` arrives as a two-element [from, to] list.
  if (filter.operator === "between") {
    return {
      name: filter.field,
      type: "array",
      optional: true,
      itemType: base,
      constraints,
    };
  }
  return { name: filter.field, type: base, optional: true, constraints };
}

/** Every field that contributes a request member, for any page kind. */
function requestFields(page: PageDefinition): FieldDefinition[] {
  if (page.kind === "wizard") return formFields(wizardForm(page));
  if (page.kind === "crud" || page.kind === "form") return formFields(page.form);
  return [];
}

/**
 * Derives the API payload shapes a page implies.
 *
 * Shape order is fixed so the output is comparable across languages: request,
 * row, listResponse, queryParams, pathParams, then child (`subTable`) shapes in
 * field-declaration order, deduped by name.
 */
export function deriveDto(page: PageDefinition): DtoSpec {
  const name = pascal(page.id);
  const shapes: DtoShape[] = [];
  const children: DtoShape[] = [];
  const seen = new Set<string>();

  const collectChild = (field: FieldDefinition): void => {
    if (field.type !== FieldTypes.subTable) return;
    const shapeName = childShapeName(page.id, field.field);
    if (seen.has(shapeName)) return;
    seen.add(shapeName);
    children.push({
      name: shapeName,
      role: "child",
      members: field.rowFields
        .map((f) => requestMember(page.id, f))
        .filter((m): m is DtoMember => m !== undefined),
    });
  };

  const fields = requestFields(page);
  if (fields.length > 0) {
    const members = fields
      .map((f) => requestMember(page.id, f))
      .filter((m): m is DtoMember => m !== undefined);
    if (members.length > 0) {
      shapes.push({ name: `${name}Request`, role: "request", members });
    }
  }
  for (const field of fields) collectChild(field);

  const columns = "table" in page ? page.table.columns : [];
  if (columns.length > 0) {
    shapes.push({
      name: `${name}Row`,
      role: "row",
      members: columns.map((c) => ({
        name: c.field,
        type: memberType(c.type),
        optional: false,
        constraints: {},
      })),
    });
    // Matches the Repository contract: search() returns items + totalCount.
    shapes.push({
      name: `${name}ListResponse`,
      role: "listResponse",
      members: [
        {
          name: "items",
          type: "array",
          optional: false,
          itemType: "object",
          shape: `${name}Row`,
          constraints: {},
        },
        { name: "totalCount", type: "number", optional: false, constraints: {} },
      ],
    });
  }

  const filters = "search" in page ? (page.search?.filters ?? []) : [];
  if (filters.length > 0) {
    shapes.push({
      name: `${name}Query`,
      role: "queryParams",
      members: filters.map(queryMember),
    });
  }

  // The DSL carries no type for the key, so it is described as a string.
  shapes.push({
    name: `${name}Key`,
    role: "pathParams",
    members: [
      { name: page.keyField, type: "string", optional: false, constraints: {} },
    ],
  });

  return { page: page.id, shapes: [...shapes, ...children] };
}

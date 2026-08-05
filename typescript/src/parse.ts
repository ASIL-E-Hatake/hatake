import { parse as parseYamlText } from "yaml";
import {
  kDslVersion,
  type ActionDefinition,
  type ColumnDefinition,
  type FieldDefinition,
  type FilterDefinition,
  type FormDefinition,
  type OptionItem,
  type PageDefinition,
  type PaginationDefinition,
  type SearchDefinition,
  type SectionDefinition,
  type TableDefinition,
  type ValidatorDefinition,
} from "./definition.js";

export class DefinitionParseError extends Error {
  constructor(
    message: string,
    readonly path?: string,
  ) {
    super(path ? `${message} (at ${path})` : message);
    this.name = "DefinitionParseError";
  }
}

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function reqString(m: Dict, key: string, at: string): string {
  const v = m[key];
  if (typeof v === "string" && v.length > 0) return v;
  throw new DefinitionParseError(`Missing or empty required string "${key}"`, at);
}

const optString = (m: Dict, key: string): string | undefined =>
  typeof m[key] === "string" ? (m[key] as string) : undefined;

const optBool = (m: Dict, key: string, orElse = false): boolean =>
  typeof m[key] === "boolean" ? (m[key] as boolean) : orElse;

function optNumber(m: Dict, key: string): number | undefined {
  const v = m[key];
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return undefined;
}

const optDict = (m: Dict, key: string): Dict | undefined =>
  isDict(m[key]) ? (m[key] as Dict) : undefined;

const optList = (m: Dict, key: string): unknown[] =>
  Array.isArray(m[key]) ? (m[key] as unknown[]) : [];

function asDict(v: unknown, at: string): Dict {
  if (isDict(v)) return v;
  throw new DefinitionParseError("Expected a mapping", at);
}

/** Parse a YAML definition document into a PageDefinition. */
export function parsePageYaml(source: string): PageDefinition {
  let decoded: unknown;
  try {
    decoded = parseYamlText(source);
  } catch (e) {
    throw new DefinitionParseError(`Invalid YAML: ${(e as Error).message}`);
  }
  return fromDecoded(decoded, "YAML");
}

/** Parse a JSON definition document into a PageDefinition. */
export function parsePageJson(source: string): PageDefinition {
  let decoded: unknown;
  try {
    decoded = JSON.parse(source);
  } catch (e) {
    throw new DefinitionParseError(`Invalid JSON: ${(e as Error).message}`);
  }
  return fromDecoded(decoded, "JSON");
}

function fromDecoded(decoded: unknown, format: string): PageDefinition {
  if (!isDict(decoded)) {
    throw new DefinitionParseError(`Top-level ${format} must be a mapping/object`);
  }
  return parsePageMap(decoded);
}

/** The single convergence point shared by the YAML and JSON entry points. */
export function parsePageMap(root: Dict): PageDefinition {
  const dslVersion = optString(root, "dsl_version") ?? kDslVersion;
  const page = optDict(root, "page") ?? root;
  const type = reqString(page, "type", "page.type");

  switch (type) {
    case "crud":
      return {
        kind: "crud",
        ...common(page, dslVersion),
        search: parseSearch(optDict(page, "search")),
        table: parseTable(optDict(page, "table")),
        form: parseForm(optDict(page, "form")),
        actions: parseActions(page),
      };
    case "search":
      return {
        kind: "search",
        ...common(page, dslVersion),
        search: parseSearch(optDict(page, "search")),
        table: parseTable(optDict(page, "table")),
        actions: parseActions(page),
      };
    case "form":
      return {
        kind: "form",
        ...common(page, dslVersion),
        form: parseForm(optDict(page, "form")),
        actions: parseActions(page),
      };
    default:
      throw new DefinitionParseError(
        `Unsupported page type "${type}" (supported: crud, search, form)`,
        "page.type",
      );
  }
}

function common(page: Dict, dslVersion: string) {
  return {
    id: reqString(page, "id", "page.id"),
    title: reqString(page, "title", "page.title"),
    dslVersion,
    repository: reqString(page, "repository", "page.repository"),
    keyField: optString(page, "key") ?? "id",
  };
}

function parseActions(page: Dict): ActionDefinition[] {
  return optList(page, "actions").map((a, i) =>
    parseAction(asDict(a, `page.actions[${i}]`)),
  );
}

function parseSearch(m: Dict | undefined): SearchDefinition | undefined {
  if (!m) return undefined;
  return {
    columns: optNumber(optDict(m, "layout") ?? {}, "columns") ?? 1,
    filters: optList(m, "filters").map((f, i) =>
      parseFilter(asDict(f, `page.search.filters[${i}]`)),
    ),
  };
}

function parseFilter(m: Dict): FilterDefinition {
  return {
    field: reqString(m, "field", "filter.field"),
    label: reqString(m, "label", "filter.label"),
    type: optString(m, "type") ?? "text",
    operator: optString(m, "operator") ?? "contains",
    options: parseOptions(optList(m, "options")),
    config: optDict(m, "config") ?? {},
  };
}

function parseTable(m: Dict | undefined): TableDefinition {
  if (!m) return { columns: [], pagination: { pageSize: 50, enabled: true }, rowActions: [] };
  return {
    pagination: parsePagination(optDict(m, "pagination")),
    rowActions: optList(m, "rowActions").map(String),
    columns: optList(m, "columns").map((c, i) =>
      parseColumn(asDict(c, `page.table.columns[${i}]`)),
    ),
  };
}

function parseColumn(m: Dict): ColumnDefinition {
  return {
    field: reqString(m, "field", "column.field"),
    label: reqString(m, "label", "column.label"),
    type: optString(m, "type") ?? "text",
    width: optNumber(m, "width"),
    sortable: optBool(m, "sortable"),
    format: optString(m, "format"),
    config: optDict(m, "config") ?? {},
    roles: optList(m, "roles").map(String),
  };
}

function parsePagination(m: Dict | undefined): PaginationDefinition {
  return {
    pageSize: m ? (optNumber(m, "pageSize") ?? 50) : 50,
    enabled: m ? optBool(m, "enabled", true) : true,
  };
}

function parseForm(m: Dict | undefined): FormDefinition {
  if (!m) return { sections: [] };
  return {
    sections: optList(m, "sections").map((s, i) =>
      parseSection(asDict(s, `page.form.sections[${i}]`)),
    ),
  };
}

function parseSection(m: Dict): SectionDefinition {
  return {
    title: optString(m, "title"),
    columns: optNumber(optDict(m, "layout") ?? {}, "columns") ?? 1,
    fields: optList(m, "fields").map((f, i) =>
      parseField(asDict(f, `section.fields[${i}]`)),
    ),
  };
}

function parseField(m: Dict): FieldDefinition {
  return {
    field: reqString(m, "field", "field.field"),
    label: reqString(m, "label", "field.label"),
    type: optString(m, "type") ?? "text",
    required: optBool(m, "required"),
    readOnly: optBool(m, "readOnly"),
    defaultValue: m["defaultValue"],
    validators: optList(m, "validators").map((v, i) =>
      parseValidator(asDict(v, `field.validators[${i}]`)),
    ),
    options: parseOptions(optList(m, "options")),
    format: optString(m, "format"),
    normalize: optList(m, "normalize").map(String),
    config: optDict(m, "config") ?? {},
    visibleWhen: optDict(m, "visibleWhen"),
    enabledWhen: optDict(m, "enabledWhen"),
    computed: optDict(m, "computed"),
    roles: optList(m, "roles").map(String),
    // Child-row grid (type: subTable). `columns` describes the grid, the
    // nested `fields` the row editor — both reuse the existing shapes.
    columns: optList(m, "columns").map((c, i) =>
      parseColumn(asDict(c, `field.columns[${i}]`)),
    ),
    rowFields: optList(m, "fields").map((f, i) =>
      parseField(asDict(f, `field.fields[${i}]`)),
    ),
  };
}

function parseValidator(m: Dict): ValidatorDefinition {
  const params: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) {
    if (k !== "type" && k !== "message") params[k] = v;
  }
  return {
    type: reqString(m, "type", "validator.type"),
    message: optString(m, "message"),
    params,
  };
}

function parseOptions(raw: unknown[]): OptionItem[] {
  return raw.map((o, i) => {
    const m = asDict(o, `options[${i}]`);
    return { value: m["value"], label: reqString(m, "label", "option.label") };
  });
}

function parseAction(m: Dict): ActionDefinition {
  return {
    id: reqString(m, "id", "action.id"),
    type: reqString(m, "type", "action.type"),
    label: reqString(m, "label", "action.label"),
    plugin: optString(m, "plugin"),
    config: optDict(m, "config") ?? {},
    roles: optList(m, "roles").map(String),
  };
}

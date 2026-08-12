import { parse as parseYamlText } from "yaml";
import { findUnknownKeys, type UnknownKey } from "./strictKeys.js";
import {
  kDslVersion,
  type ActionDefinition,
  type ActionSuccessDefinition,
  type ConfirmDefinition,
  type OptionsSource,
  type ChartDefinition,
  type ColumnDefinition,
  type DashboardItemDefinition,
  type DashboardPageDefinition,
  type DashboardValueDefinition,
  type FieldDefinition,
  type FilterDefinition,
  type FormDefinition,
  type OptionItem,
  type PageDefinition,
  type PaginationDefinition,
  type ReportDefinition,
  type SearchDefinition,
  type SectionDefinition,
  type SubTableSource,
  type TableDefinition,
  type WizardStepDefinition,
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

/**
 * Thrown by a strict parse when the document contains keys the DSL does not
 * know. It carries **every** offending key, so one round trip is enough to fix
 * them all.
 */
export class UnknownKeysError extends DefinitionParseError {
  constructor(readonly keys: UnknownKey[]) {
    super(
      `知らないキーが ${keys.length} 件あります:\n` +
        keys.map((k) => `  - ${describeUnknownKey(k)}`).join("\n"),
      keys.length > 0 ? keys[0].path : undefined,
    );
    this.name = "UnknownKeysError";
  }
}

/** 人にも AI にも読める1行。 */
export function describeUnknownKey(key: UnknownKey): string {
  const at = key.path === "" ? "ドキュメント直下" : key.path;
  const hint = key.suggestion === null ? "" : `（${key.suggestion} の間違い？）`;
  return `${at}: 知らないキー "${key.key}"${hint}`;
}

/** How a parse should treat keys the DSL does not know. */
export interface ParseOptions {
  /** Reject unknown keys instead of ignoring them (see findUnknownKeys). */
  strict?: boolean;
}

function checkKeys(root: Dict, options?: ParseOptions): void {
  if (options?.strict !== true) return;
  const unknown = findUnknownKeys(root);
  if (unknown.length > 0) throw new UnknownKeysError(unknown);
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
export function parsePageYaml(
  source: string,
  options?: ParseOptions,
): PageDefinition {
  let decoded: unknown;
  try {
    decoded = parseYamlText(source);
  } catch (e) {
    throw new DefinitionParseError(`Invalid YAML: ${(e as Error).message}`);
  }
  return fromDecoded(decoded, "YAML", options);
}

/** Parse a JSON definition document into a PageDefinition. */
export function parsePageJson(
  source: string,
  options?: ParseOptions,
): PageDefinition {
  let decoded: unknown;
  try {
    decoded = JSON.parse(source);
  } catch (e) {
    throw new DefinitionParseError(`Invalid JSON: ${(e as Error).message}`);
  }
  return fromDecoded(decoded, "JSON", options);
}

function fromDecoded(
  decoded: unknown,
  format: string,
  options?: ParseOptions,
): PageDefinition {
  if (!isDict(decoded)) {
    throw new DefinitionParseError(`Top-level ${format} must be a mapping/object`);
  }
  // Parse first: a missing `type` is the more fundamental problem.
  const page = parsePageMap(decoded);
  checkKeys(decoded, options);
  return page;
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
    // master is crud with a different name; detail is a read-only form.
    case "master":
      return {
        kind: "master",
        ...common(page, dslVersion),
        search: parseSearch(optDict(page, "search")),
        table: parseTable(optDict(page, "table")),
        form: parseForm(optDict(page, "form")),
        actions: parseActions(page),
      };
    case "detail":
      return {
        kind: "detail",
        ...common(page, dslVersion),
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
    case "wizard":
      return {
        kind: "wizard",
        ...common(page, dslVersion),
        steps: parseWizardSteps(page),
        actions: parseActions(page),
      };
    case "dashboard":
      return parseDashboardPage(page, dslVersion);
    case "report":
      return {
        kind: "report",
        id: reqString(page, "id", "page.id"),
        title: reqString(page, "title", "page.title"),
        dslVersion,
        repository: reqString(page, "repository", "page.repository"),
        search: parseSearch(optDict(page, "search")),
        table: parseTable(optDict(page, "table")),
        report: parseReport(optDict(page, "report")),
        actions: parseActions(page),
      };
    default:
      throw new DefinitionParseError(
        `Unsupported page type "${type}" (supported: crud, master, search, ` +
          `detail, form, wizard, dashboard, report)`,
        "page.type",
      );
  }
}

/** Wizard steps reuse the section shape (`layout` / `fields`) plus id + title. */
function parseWizardSteps(page: Dict): WizardStepDefinition[] {
  const steps = optList(page, "steps");
  if (steps.length === 0) {
    throw new DefinitionParseError(
      "A wizard page needs at least one step",
      "page.steps",
    );
  }
  return steps.map((raw, i) => {
    const m = asDict(raw, `page.steps[${i}]`);
    return {
      id: reqString(m, "id", `page.steps[${i}].id`),
      title: reqString(m, "title", `page.steps[${i}].title`),
      description: optString(m, "description"),
      columns: optNumber(optDict(m, "layout") ?? {}, "columns") ?? 1,
      fields: optList(m, "fields").map((f, j) =>
        parseField(asDict(f, `page.steps[${i}].fields[${j}]`)),
      ),
    };
  });
}

/** The printing structure of a report page (`report`). */
function parseReport(m: Dict | undefined): ReportDefinition {
  const paper = m ? optDict(m, "paper") : undefined;
  const sort = m ? optDict(m, "sort") : undefined;
  return {
    sortField: sort ? optString(sort, "field") : undefined,
    sortAscending: sort ? optBool(sort, "ascending", true) : true,
    paper: {
      size: paper ? (optString(paper, "size") ?? "A4") : "A4",
      orientation: paper
        ? (optString(paper, "orientation") ?? "portrait")
        : "portrait",
    },
    rowsPerPage: (m ? optNumber(m, "rowsPerPage") : undefined) ?? 40,
    limit: (m ? optNumber(m, "limit") : undefined) ?? 1000,
    groups: (m ? optList(m, "groupBy") : []).map((raw, i) => {
      const g = asDict(raw, `page.report.groupBy[${i}]`);
      return {
        field: reqString(g, "field", `page.report.groupBy[${i}].field`),
        label: reqString(g, "label", `page.report.groupBy[${i}].label`),
        pageBreak: optBool(g, "pageBreak"),
      };
    }),
    totals: (m ? optList(m, "totals") : []).map((raw, i) => {
      const t = asDict(raw, `page.report.totals[${i}]`);
      return {
        field: reqString(t, "field", `page.report.totals[${i}].field`),
        aggregate: optString(t, "aggregate") ?? "sum",
      };
    }),
  };
}

/**
 * A dashboard is a grid of card queries. Unlike the other kinds `repository` is
 * optional (it is only the default for items) and there is no `key`.
 */
function parseDashboardPage(
  page: Dict,
  dslVersion: string,
): DashboardPageDefinition {
  const items = optList(page, "items");
  if (items.length === 0) {
    throw new DefinitionParseError(
      "A dashboard page needs at least one item",
      "page.items",
    );
  }
  return {
    kind: "dashboard",
    id: reqString(page, "id", "page.id"),
    title: reqString(page, "title", "page.title"),
    dslVersion,
    repository: optString(page, "repository"),
    columns: optNumber(optDict(page, "layout") ?? {}, "columns") ?? 2,
    search: parseSearch(optDict(page, "search")),
    items: items.map((raw, i) =>
      parseDashboardItem(asDict(raw, `page.items[${i}]`), i),
    ),
    actions: parseActions(page),
  };
}

function parseDashboardItem(m: Dict, index: number): DashboardItemDefinition {
  const at = `page.items[${index}]`;
  const sort = optDict(m, "sort");
  return {
    id: reqString(m, "id", `${at}.id`),
    title: reqString(m, "title", `${at}.title`),
    type: optString(m, "type") ?? "metric",
    repository: optString(m, "repository"),
    span: optNumber(m, "span") ?? 1,
    filters: optDict(m, "filters") ?? {},
    limit: optNumber(m, "limit") ?? 100,
    sortField: sort ? optString(sort, "field") : undefined,
    sortAscending: sort ? optBool(sort, "ascending", true) : true,
    value: parseDashboardValue(optDict(m, "value")),
    format: optString(m, "format"),
    config: optDict(m, "config") ?? {},
    columns: optList(m, "columns").map((c, i) =>
      parseColumn(asDict(c, `${at}.columns[${i}]`)),
    ),
    chart: parseChart(optDict(m, "chart"), at),
    action: optString(m, "action"),
    roles: optList(m, "roles").map(String),
  };
}

function parseDashboardValue(
  m: Dict | undefined,
): DashboardValueDefinition | undefined {
  if (!m) return undefined;
  return {
    aggregate: optString(m, "aggregate") ?? "count",
    field: optString(m, "field"),
  };
}

function parseChart(
  m: Dict | undefined,
  at: string,
): ChartDefinition | undefined {
  if (!m) return undefined;
  return {
    kind: optString(m, "kind") ?? "bar",
    labelField: reqString(m, "labelField", `${at}.chart.labelField`),
    valueField: optString(m, "valueField"),
    aggregate: optString(m, "aggregate"),
  };
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
    optionsFrom: optString(m, "optionsFrom"),
    optionsSource: parseOptionsSource(optDict(m, "optionsSource")),
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
    source: parseSubTableSource(optDict(m, "source")),
  };
}

/** Parses a `subTable`'s `source`. Undefined keeps rows embedded in the parent. */
function parseSubTableSource(m: Dict | undefined): SubTableSource | undefined {
  if (!m) return undefined;
  return {
    repository: reqString(m, "repository", "field.source.repository"),
    parentKey: reqString(m, "parentKey", "field.source.parentKey"),
    keyField: optString(m, "key") ?? "id",
    pageSize: optNumber(m, "pageSize") ?? 20,
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
    return {
      value: m["value"],
      label: reqString(m, "label", "option.label"),
      when: m["when"],
    };
  });
}

/** `optionsSource`（選択肢を Repository から引く）。 */
function parseOptionsSource(m: Dict | undefined): OptionsSource | undefined {
  if (m === undefined) return undefined;
  return {
    repository: reqString(m, "repository", "optionsSource.repository"),
    value: optString(m, "value") ?? "code",
    label: optString(m, "label") ?? "name",
    parentKey: optString(m, "parentKey"),
    limit: optNumber(m, "limit") ?? 200,
  };
}

function parseAction(m: Dict): ActionDefinition {
  return {
    id: reqString(m, "id", "action.id"),
    type: reqString(m, "type", "action.type"),
    label: reqString(m, "label", "action.label"),
    plugin: optString(m, "plugin"),
    confirm: parseConfirm(optDict(m, "confirm")),
    onSuccess: parseActionSuccess(optDict(m, "onSuccess")),
    config: optDict(m, "config") ?? {},
    roles: optList(m, "roles").map(String),
  };
}

/** `message` is required: a confirmation with nothing to read is not one. */
function parseConfirm(m: Dict | undefined): ConfirmDefinition | undefined {
  if (m === undefined) return undefined;
  return {
    title: optString(m, "title"),
    message: reqString(m, "message", "action.confirm.message"),
    okLabel: optString(m, "okLabel"),
    cancelLabel: optString(m, "cancelLabel"),
    danger: m["danger"] === true,
  };
}

function parseActionSuccess(
  m: Dict | undefined,
): ActionSuccessDefinition | undefined {
  if (m === undefined) return undefined;
  return {
    message: optString(m, "message"),
    page: optString(m, "page"),
    params: optDict(m, "params") ?? {},
  };
}

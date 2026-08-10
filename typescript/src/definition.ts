// hatake DSL — language-agnostic definition model (TypeScript edition).
// Mirrors the shared spec/ (see spec/dsl-spec.md). Consumed on the backend for
// validation / query building, not for rendering UI.

export const kDslVersion = "1.0";

export interface OptionItem {
  value: unknown;
  label: string;
}

export interface ValidatorDefinition {
  type: string;
  params: Record<string, unknown>;
  message?: string;
}

export interface FieldDefinition {
  field: string;
  label: string;
  type: string;
  required: boolean;
  readOnly: boolean;
  defaultValue?: unknown;
  validators: ValidatorDefinition[];
  options: OptionItem[];
  /** Display formatter name (see FormatterRegistry). */
  format?: string;
  /** Input converters applied before validation (see ConverterRegistry). */
  normalize: string[];
  config: Record<string, unknown>;
  /** Show only when this condition matches the record (see evaluateCondition). */
  visibleWhen?: Record<string, unknown>;
  /** Enable only when this condition matches (see evaluateCondition). */
  enabledWhen?: Record<string, unknown>;
  /** Derive the value from the record (see ComputedRegistry). */
  computed?: Record<string, unknown>;
  /** Roles allowed to see this field (see isAllowed). Empty = everyone. */
  roles: string[];
  /** Child-row grid columns, for `type: subTable` (master-detail). The field's
   * value is then a list of records, one per row. DSL key: `columns`. */
  columns: ColumnDefinition[];
  /** Editor fields for one child row, for `type: subTable`. When empty the
   * renderer derives inputs from `columns`. DSL key: `fields`. */
  rowFields: FieldDefinition[];
  /** Where child rows come from, for `type: subTable`. Undefined (the default)
   * keeps them embedded in the parent record. DSL key: `source`. */
  source?: SubTableSource;
}

/**
 * Where a `subTable`'s child rows come from when they are not embedded in the
 * parent record: their own repository, paged and linked by a foreign key.
 *
 * On the backend this mainly means one thing: the parent record does not carry
 * the rows, so `FormValidator` skips the field entirely.
 */
export interface SubTableSource {
  /** Repository key for the child rows. */
  repository: string;
  /** Child field holding the parent key. */
  parentKey: string;
  /** Primary-key field of a child row. DSL key: `key`. */
  keyField: string;
  /** Rows per page. */
  pageSize: number;
}

export interface FilterDefinition {
  field: string;
  label: string;
  type: string;
  operator: string;
  options: OptionItem[];
  config: Record<string, unknown>;
}

export interface ColumnDefinition {
  field: string;
  label: string;
  type: string;
  width?: number;
  sortable: boolean;
  /** Display formatter name (see FormatterRegistry). Options from config. */
  format?: string;
  config: Record<string, unknown>;
  /** Roles allowed to see this column (see isAllowed). Empty = everyone. */
  roles: string[];
}

export interface SectionDefinition {
  title?: string;
  columns: number;
  fields: FieldDefinition[];
}

export interface SearchDefinition {
  columns: number;
  filters: FilterDefinition[];
}

export interface PaginationDefinition {
  pageSize: number;
  enabled: boolean;
}

export interface TableDefinition {
  columns: ColumnDefinition[];
  pagination: PaginationDefinition;
  rowActions: string[];
}

export interface FormDefinition {
  sections: SectionDefinition[];
}

/**
 * Ask before running an action. A `delete` asks even without this; declaring it
 * replaces the wording. Written on the action because "delete asks first" is a
 * rule about that button, not a rendering detail.
 */
export interface ConfirmDefinition {
  title?: string;
  /** The question itself. */
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  /** Style the confirming button as destructive (`delete` is by default). */
  danger: boolean;
}

/** What happens once the action succeeded. Never runs when it failed. */
export interface ActionSuccessDefinition {
  /** Shown briefly to the user. */
  message?: string;
  /** Page id to move to afterwards. */
  page?: string;
  /** Route params for `page`; `$row.id` / `$record.id` are interpolated. */
  params: Record<string, unknown>;
}

export interface ActionDefinition {
  id: string;
  type: string;
  label: string;
  plugin?: string;
  /** Ask before running. */
  confirm?: ConfirmDefinition;
  /** What to do once it succeeded. */
  onSuccess?: ActionSuccessDefinition;
  config: Record<string, unknown>;
  /** Roles allowed to use this action (see isAllowed). Empty = everyone. */
  roles: string[];
}

export interface CrudPageDefinition {
  kind: "crud";
  id: string;
  title: string;
  dslVersion: string;
  repository: string;
  keyField: string;
  search?: SearchDefinition;
  table: TableDefinition;
  form: FormDefinition;
  actions: ActionDefinition[];
}

/**
 * A master-maintenance page. Structurally identical to `crud`; a distinct kind
 * so a renderer or an API can treat master screens specially without changing
 * the DSL.
 */
export interface MasterPageDefinition {
  kind: "master";
  id: string;
  title: string;
  dslVersion: string;
  repository: string;
  keyField: string;
  search?: SearchDefinition;
  table: TableDefinition;
  form: FormDefinition;
  actions: ActionDefinition[];
}

/**
 * A read-only single-record page. It carries the same `form` as an editing page
 * but nothing is written through it, so it implies no request payload.
 */
export interface DetailPageDefinition {
  kind: "detail";
  id: string;
  title: string;
  dslVersion: string;
  repository: string;
  keyField: string;
  form: FormDefinition;
  actions: ActionDefinition[];
}

export interface SearchPageDefinition {
  kind: "search";
  id: string;
  title: string;
  dslVersion: string;
  repository: string;
  keyField: string;
  search?: SearchDefinition;
  table: TableDefinition;
  actions: ActionDefinition[];
}

export interface FormPageDefinition {
  kind: "form";
  id: string;
  title: string;
  dslVersion: string;
  repository: string;
  keyField: string;
  form: FormDefinition;
  actions: ActionDefinition[];
}

/** One step of a wizard page — a section with an id and a heading. */
export interface WizardStepDefinition {
  id: string;
  title: string;
  description?: string;
  /** Fields per row on wide layouts (DSL: `layout.columns`). */
  columns: number;
  fields: FieldDefinition[];
}

/**
 * A stepped-input page. The form arrives pre-sliced into `steps`; advancing
 * validates one step, saving validates them all (see `wizardStepForm` /
 * `wizardForm`).
 */
export interface WizardPageDefinition {
  kind: "wizard";
  id: string;
  title: string;
  dslVersion: string;
  repository: string;
  keyField: string;
  steps: WizardStepDefinition[];
  actions: ActionDefinition[];
}

/** One step as a standalone form, so `FormValidator` can check just that step. */
export function wizardStepForm(step: WizardStepDefinition): FormDefinition {
  return {
    sections: [{ title: step.title, columns: step.columns, fields: step.fields }],
  };
}

/** Every step as one form (a section per step) — what a save must satisfy. */
export function wizardForm(page: WizardPageDefinition): FormDefinition {
  return {
    sections: page.steps.map((s) => ({
      title: s.title,
      columns: s.columns,
      fields: s.fields,
    })),
  };
}

/** How a `metric` card reduces the rows it fetched to one number. */
export interface DashboardValueDefinition {
  /** Aggregate operation name (see AggregateOps / AggregateRegistry). */
  aggregate: string;
  /** Field to reduce. Not needed by `count`. */
  field?: string;
}

/** How a `chart` card plots the rows it fetched. */
export interface ChartDefinition {
  /** Chart kind: bar / line / pie, or a plugin's. */
  kind: string;
  /** Field holding each point's label. */
  labelField: string;
  /** Field holding each point's value. */
  valueField?: string;
  /** Aggregate applied per label, or undefined to plot rows as they are. */
  aggregate?: string;
}

/** One dashboard card: a small read-only query plus how to display it. */
export interface DashboardItemDefinition {
  id: string;
  /** Item kind: metric / table / chart, or a plugin's. */
  type: string;
  title: string;
  /** Repository key, or undefined to use the page's default. */
  repository?: string;
  /** Grid columns this card occupies. */
  span: number;
  /** Fixed filters merged into the query. */
  filters: Record<string, unknown>;
  /** Rows to fetch (the query's pageSize). */
  limit: number;
  sortField?: string;
  sortAscending: boolean;
  /** Reduction for a `metric` card. Undefined means `count`. */
  value?: DashboardValueDefinition;
  /** Display formatter for a `metric` value. */
  format?: string;
  config: Record<string, unknown>;
  /** Columns for a `table` card. */
  columns: ColumnDefinition[];
  /** Plot for a `chart` card. */
  chart?: ChartDefinition;
  /** Id of a page action to run when the card is tapped. */
  action?: string;
  /** Roles allowed to see this card (see isAllowed). Empty = everyone. */
  roles: string[];
}

/**
 * A dashboard page: a grid of read-only cards. It has no single record and no
 * single repository — `repository` is only the default for items that omit one,
 * and there is no `keyField`. An optional `search` applies to every card.
 */
export interface DashboardPageDefinition {
  kind: "dashboard";
  id: string;
  title: string;
  dslVersion: string;
  repository?: string;
  items: DashboardItemDefinition[];
  /** Card grid width (DSL: `layout.columns`). */
  columns: number;
  search?: SearchDefinition;
  actions: ActionDefinition[];
}

/** The sheet a report is laid out on. */
export interface PaperDefinition {
  /** Paper size name (see PaperSizes). */
  size: string;
  /** `portrait` or `landscape`. */
  orientation: string;
}

/** A control break: rows whose `field` value changes start a new group. */
export interface ReportGroup {
  field: string;
  /** Heading label shown next to the group's value. */
  label: string;
  /** Start a new sheet whenever this group changes. */
  pageBreak: boolean;
}

/**
 * One figure on the subtotal / grand-total lines. Reuses the aggregate
 * vocabulary (see AggregateOps); two totals may share a `field`.
 */
export interface ReportTotal {
  field: string;
  aggregate: string;
}

/** The printing side of a report page: paper, lines per sheet, groups, totals. */
export interface ReportDefinition {
  paper: PaperDefinition;
  /** Lines per sheet. Group headings and total lines count as lines. */
  rowsPerPage: number;
  /** Control breaks, outermost first (DSL: `groupBy`). */
  groups: ReportGroup[];
  totals: ReportTotal[];
  /** Rows to fetch for one run — a report is printed, not paged. */
  limit: number;
  /** Print order (DSL: `sort`). Groups are control breaks, so it matters. */
  sortField?: string;
  sortAscending: boolean;
}

/**
 * A report page (帳票): the printable counterpart of a list. Detail columns come
 * from `table`, so the report and the list of the same data cannot drift apart.
 * It addresses no single record, so it has no `keyField`.
 */
export interface ReportPageDefinition {
  kind: "report";
  id: string;
  title: string;
  dslVersion: string;
  repository: string;
  /** Output conditions, passed to the repository as filters. */
  search?: SearchDefinition;
  /** Detail columns. */
  table: TableDefinition;
  report: ReportDefinition;
  actions: ActionDefinition[];
}

export type PageDefinition =
  | CrudPageDefinition
  | MasterPageDefinition
  | DetailPageDefinition
  | SearchPageDefinition
  | FormPageDefinition
  | WizardPageDefinition
  | DashboardPageDefinition
  | ReportPageDefinition;

/** A node in an app's navigation menu. Either a leaf (opens `page`) or a group
 * (has `children`). `isGroup` distinguishes them (see menuIsGroup). */
export interface MenuItem {
  /** Route key for a leaf (defaults to `page` when omitted). Undefined for groups. */
  id?: string;
  /** Display label. For a group this is the group heading. */
  label: string;
  /** Optional icon name; the renderer maps it to an actual icon. */
  icon?: string;
  /** Page id this leaf opens. Undefined for groups. */
  page?: string;
  /** Child items when this is a group. */
  children: MenuItem[];
  /** Roles allowed to see this item (see isAllowed). Empty = everyone. */
  roles: string[];
}

/** True when this node groups `children` rather than opening a `page`. */
export const menuIsGroup = (item: MenuItem): boolean => item.children.length > 0;

/** Shallow page inventory entry (backends do not parse full page models). */
export interface PageRef {
  id: string;
  type: string;
  title: string;
  /** Undefined only for a `dashboard`, whose cards each name their own. */
  repository?: string;
}

/**
 * How an app looks: brand colour, brightness, density and shape. Renderer
 * neutral and behaviour-free — a backend only carries it (it is parsed so that
 * `hatake validate` does not have to ignore it), a frontend renderer applies it.
 */
export interface ThemeDefinition {
  /** Brand colour as `#RRGGBB` / `#AARRGGBB`; the seed of the palette. */
  primaryColor?: string;
  /** Accent colour; derived from the primary when omitted. */
  secondaryColor?: string;
  /** `light` | `dark` | `system` (follow the device). */
  brightness: string;
  /** `comfortable` | `standard` | `compact`. */
  density: string;
  fontFamily?: string;
  /** Corner radius in logical pixels. */
  radius?: number;
  /** Renderer specific extras. */
  config: Record<string, unknown>;
}

export const Brightnesses = {
  light: "light",
  dark: "dark",
  system: "system",
} as const;

export const Densities = {
  comfortable: "comfortable",
  standard: "standard",
  compact: "compact",
} as const;

/** An application: a set of pages composed by a navigation menu. Backends read
 * navigation metadata + a shallow page inventory; rendering/routing is a
 * frontend concern. */
export interface AppDefinition {
  id: string;
  title: string;
  dslVersion: string;
  /** Initial route (menu item id or page id). Undefined = the first leaf. */
  home?: string;
  /** Look and feel. Undefined = the renderer's default. */
  theme?: ThemeDefinition;
  menu: MenuItem[];
  pages: PageRef[];
}

/** All fields across all sections of a form, in declaration order. */
export function formFields(form: FormDefinition): FieldDefinition[] {
  return form.sections.flatMap((s) => s.fields);
}

export const FieldTypes = {
  text: "text",
  textarea: "textarea",
  number: "number",
  select: "select",
  multiSelect: "multiSelect",
  checkbox: "checkbox",
  radio: "radio",
  date: "date",
  dateTime: "dateTime",
  time: "time",
  /** Master-detail child rows. The value is a list of records (see rowFields). */
  subTable: "subTable",
} as const;

/** Built-in table column render types. Open strings — extensible via plugins. */
export const ColumnTypes = {
  text: "text",
  number: "number",
  badge: "badge",
  boolean: "boolean",
  date: "date",
  dateTime: "dateTime",
} as const;

/**
 * Built-in search filter operators. Open strings — the repository (or an ORM
 * adapter) is what finally honours them; hatake only carries the name.
 * `isEmpty` / `isNotEmpty` take no value and are used by conditions.
 */
export const FilterOperators = {
  equals: "equals",
  notEquals: "notEquals",
  contains: "contains",
  startsWith: "startsWith",
  endsWith: "endsWith",
  gt: "gt",
  gte: "gte",
  lt: "lt",
  lte: "lte",
  between: "between",
  in: "in",
  isEmpty: "isEmpty",
  isNotEmpty: "isNotEmpty",
} as const;

/** Built-in action types. Open strings — extensible via plugins. */
export const ActionTypes = {
  create: "create",
  edit: "edit",
  delete: "delete",
  plugin: "plugin",
  /** Build the page's rows as a document (CSV); writing it out is the app's. */
  export: "export",
  navigate: "navigate",
} as const;

/** Built-in dashboard card kinds. Open strings — extensible via plugins. */
export const DashboardItemTypes = {
  /** A single aggregated number (KPI card). */
  metric: "metric",
  /** A short list of rows. */
  table: "table",
  /** A chart (see ChartDefinition). */
  chart: "chart",
} as const;

/** Built-in chart kinds. Open strings — extensible via plugins. */
export const ChartKinds = {
  bar: "bar",
  line: "line",
  pie: "pie",
} as const;

/** Built-in paper sizes. Open strings — a renderer may know more. */
export const PaperSizes = {
  a4: "A4",
  a3: "A3",
  b5: "B5",
  letter: "letter",
} as const;

/** Paper orientations. */
export const Orientations = {
  portrait: "portrait",
  landscape: "landscape",
} as const;

/** Built-in aggregate operations (see AggregateRegistry). */
export const AggregateOps = {
  /** Number of rows; ignores the field. */
  count: "count",
  sum: "sum",
  avg: "avg",
  min: "min",
  max: "max",
} as const;

export const ValidatorTypes = {
  required: "required",
  maxLength: "maxLength",
  minLength: "minLength",
  pattern: "pattern",
  min: "min",
  max: "max",
  email: "email",
  postalCode: "postalCode",
} as const;

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

export interface ActionDefinition {
  id: string;
  type: string;
  label: string;
  plugin?: string;
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

export type PageDefinition =
  | CrudPageDefinition
  | SearchPageDefinition
  | FormPageDefinition;

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
  repository: string;
}

/** An application: a set of pages composed by a navigation menu. Backends read
 * navigation metadata + a shallow page inventory; rendering/routing is a
 * frontend concern. */
export interface AppDefinition {
  id: string;
  title: string;
  dslVersion: string;
  /** Initial route (menu item id or page id). Undefined = the first leaf. */
  home?: string;
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

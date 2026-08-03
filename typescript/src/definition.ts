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

export type PageDefinition = CrudPageDefinition | SearchPageDefinition;

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

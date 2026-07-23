import { ConverterRegistry } from "./converter.js";
import { formFields, type FormDefinition } from "./definition.js";

/**
 * Applies each field's `normalize` converter chain to a record — run before
 * validation / persistence so input is cleaned consistently on the backend.
 */
export function normalizeRecord(
  form: FormDefinition,
  record: Record<string, unknown>,
  registry: ConverterRegistry = new ConverterRegistry(),
): Record<string, unknown> {
  const out = { ...record };
  for (const f of formFields(form)) {
    if (f.normalize.length === 0) continue;
    if (!(f.field in out)) continue;
    out[f.field] = registry.convertAll(f.normalize, out[f.field]);
  }
  return out;
}

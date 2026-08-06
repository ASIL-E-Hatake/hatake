import {
  FieldTypes,
  formFields,
  ValidatorTypes,
  type FormDefinition,
  type ValidatorDefinition,
} from "./definition.js";
import { ValidatorRegistry } from "./validators.js";

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Validates a data record against a form's rules — the backend counterpart to
 * the Flutter form validation, driven by the same definition. Reports at most
 * one error per field.
 *
 * Child rows of a `subTable` field are validated too: each row is checked
 * against the field's `rowFields`, and errors are reported with an indexed
 * path — `lines[0].qty`. Nested sub-tables recurse with the same convention.
 *
 * A `subTable` with a `source` (repository-backed rows) is skipped entirely:
 * its rows live in another repository, not in this record, so validating them
 * here — including the field's own `required` — would be meaningless.
 */
export class FormValidator {
  constructor(private readonly registry: ValidatorRegistry = new ValidatorRegistry()) {}

  validate(form: FormDefinition, record: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];
    for (const field of formFields(form)) {
      // Repository-backed child rows are not part of this record.
      if (field.type === FieldTypes.subTable && field.source) continue;

      const value = record[field.field];
      const rules: ValidatorDefinition[] = [
        ...(field.required
          ? [{ type: ValidatorTypes.required, params: {} } as ValidatorDefinition]
          : []),
        ...field.validators,
      ];
      for (const rule of rules) {
        const message = this.registry.run(value, rule);
        if (message !== null) {
          errors.push({ field: field.field, message: rule.message ?? message });
          break; // one error per field
        }
      }

      // Child rows (master-detail): validate each row against rowFields.
      if (field.type === FieldTypes.subTable && field.rowFields.length > 0) {
        const rowForm: FormDefinition = {
          sections: [{ columns: 1, fields: field.rowFields }],
        };
        const rows = Array.isArray(value) ? value : [];
        rows.forEach((row, index) => {
          if (!isRecord(row)) return;
          for (const error of this.validate(rowForm, row).errors) {
            errors.push({
              field: `${field.field}[${index}].${error.field}`,
              message: error.message,
            });
          }
        });
      }
    }
    return { valid: errors.length === 0, errors };
  }
}

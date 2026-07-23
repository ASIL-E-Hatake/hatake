import {
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

/**
 * Validates a data record against a form's rules — the backend counterpart to
 * the Flutter form validation, driven by the same definition.
 */
export class FormValidator {
  constructor(private readonly registry: ValidatorRegistry = new ValidatorRegistry()) {}

  validate(form: FormDefinition, record: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];
    for (const field of formFields(form)) {
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
    }
    return { valid: errors.length === 0, errors };
  }
}

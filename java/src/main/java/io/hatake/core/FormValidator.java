package io.hatake.core;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Validates a data record against a form's rules — the backend counterpart to
 * the Flutter form validation, driven by the same definition.
 */
public final class FormValidator {

    public record ValidationError(String field, String message) {
    }

    public record ValidationResult(boolean valid, List<ValidationError> errors) {
    }

    private final ValidatorRegistry registry;

    public FormValidator() {
        this(new ValidatorRegistry());
    }

    public FormValidator(ValidatorRegistry registry) {
        this.registry = registry;
    }

    public ValidationResult validate(FormDefinition form, Map<String, Object> record) {
        List<ValidationError> errors = new ArrayList<>();
        for (FieldDefinition field : form.fields()) {
            Object value = record.get(field.field());
            List<ValidatorDefinition> rules = new ArrayList<>();
            if (field.required()) {
                rules.add(new ValidatorDefinition("required", Map.of(), null));
            }
            rules.addAll(field.validators());
            for (ValidatorDefinition rule : rules) {
                String message = registry.run(value, rule);
                if (message != null) {
                    errors.add(new ValidationError(
                            field.field(),
                            rule.message() != null ? rule.message() : message));
                    break; // one error per field
                }
            }
        }
        return new ValidationResult(errors.isEmpty(), errors);
    }
}

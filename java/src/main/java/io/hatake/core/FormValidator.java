package io.hatake.core;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Validates a data record against a form's rules — the backend counterpart to
 * the Flutter form validation, driven by the same definition.
 *
 * <p>明細（{@code type: subTable}）の子行も検証する。各行は項目の {@code rowFields}
 * から組み立てたフォームで検証し、エラーは添字付きパス（{@code lines[0].qty}）で報告する。
 * 入れ子の明細も同じ規約で再帰する。
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

            // 明細（master-detail）: 各行を rowFields で検証する。
            if (field.isSubTable() && !field.rowFields().isEmpty()) {
                errors.addAll(validateRows(field, value));
            }
        }
        return new ValidationResult(errors.isEmpty(), errors);
    }

    @SuppressWarnings("unchecked")
    private List<ValidationError> validateRows(FieldDefinition field, Object value) {
        List<ValidationError> errors = new ArrayList<>();
        if (!(value instanceof Iterable<?> rows)) {
            return errors;
        }
        FormDefinition rowForm = new FormDefinition(
                List.of(new SectionDefinition(null, field.rowFields())));
        int index = 0;
        for (Object row : rows) {
            if (row instanceof Map<?, ?> map) {
                for (ValidationError e : validate(rowForm, (Map<String, Object>) map).errors()) {
                    errors.add(new ValidationError(
                            field.field() + "[" + index + "]." + e.field(),
                            e.message()));
                }
            }
            index++;
        }
        return errors;
    }
}

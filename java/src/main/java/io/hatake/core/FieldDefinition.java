package io.hatake.core;

import java.util.List;

public record FieldDefinition(
        String field,
        String label,
        String type,
        boolean required,
        boolean readOnly,
        List<ValidatorDefinition> validators,
        String format,
        List<String> normalize) {
}

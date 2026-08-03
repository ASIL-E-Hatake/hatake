package io.hatake.core;

import java.util.List;
import java.util.Map;

public record FieldDefinition(
        String field,
        String label,
        String type,
        boolean required,
        boolean readOnly,
        List<ValidatorDefinition> validators,
        String format,
        List<String> normalize,
        Map<String, Object> visibleWhen,
        Map<String, Object> enabledWhen,
        Map<String, Object> computed,
        List<String> roles) {
}

package io.hatake.core;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Applies each field's {@code normalize} converter chain to a record — run
 * before validation / persistence so input is cleaned consistently.
 */
public final class FormNormalizer {

    private final ConverterRegistry registry;

    public FormNormalizer() {
        this(new ConverterRegistry());
    }

    public FormNormalizer(ConverterRegistry registry) {
        this.registry = registry;
    }

    public Map<String, Object> normalize(FormDefinition form, Map<String, Object> record) {
        Map<String, Object> out = new LinkedHashMap<>(record);
        for (FieldDefinition f : form.fields()) {
            if (f.normalize().isEmpty() || !out.containsKey(f.field())) {
                continue;
            }
            out.put(f.field(), registry.convertAll(f.normalize(), out.get(f.field())));
        }
        return out;
    }
}

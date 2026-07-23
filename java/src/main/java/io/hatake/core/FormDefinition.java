package io.hatake.core;

import java.util.List;

public record FormDefinition(List<SectionDefinition> sections) {

    /** All fields across all sections, in declaration order. */
    public List<FieldDefinition> fields() {
        return sections.stream().flatMap(s -> s.fields().stream()).toList();
    }
}

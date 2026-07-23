package io.hatake.core;

import java.util.List;

public record SectionDefinition(String title, List<FieldDefinition> fields) {
}

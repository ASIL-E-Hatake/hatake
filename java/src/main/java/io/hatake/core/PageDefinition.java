package io.hatake.core;

/**
 * A hatake page definition (Java edition). Mirrors the shared DSL spec.
 *
 * <p>On the backend a definition drives API logic (validation, query building)
 * rather than rendering UI, so this scaffold models page identity, the search
 * area, and the form; presentation-only parts of the DSL are ignored.
 */
public record PageDefinition(
        String id,
        String title,
        String dslVersion,
        String type,
        String repository,
        String keyField,
        SearchDefinition search,
        FormDefinition form) {
}

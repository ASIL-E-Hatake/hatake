package io.hatake.core;

/**
 * Shallow page inventory entry (Java edition). Backends need only page
 * identity from an {@link AppDefinition}; full page models are not parsed here.
 */
public record PageRef(
        String id,
        String type,
        String title,
        String repository) {
}

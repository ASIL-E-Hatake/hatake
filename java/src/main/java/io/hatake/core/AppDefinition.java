package io.hatake.core;

import java.util.List;

/**
 * An application (Java edition): a set of pages composed by a navigation
 * {@code menu}. Mirrors the shared DSL spec.
 *
 * <p>Backends read navigation metadata and a shallow page inventory
 * ({@link PageRef}); rendering and routing are a frontend concern.
 */
public record AppDefinition(
        String id,
        String title,
        String dslVersion,
        String home,
        List<MenuItem> menu,
        List<PageRef> pages) {
}

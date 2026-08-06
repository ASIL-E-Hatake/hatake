package io.hatake.core;

/**
 * Shallow page inventory entry (Java edition). Backends need only page
 * identity from an {@link AppDefinition}; full page models are not parsed here.
 *
 * <p>{@code repository} は {@code dashboard} だけ null になり得る（カードが
 * それぞれ Repository を持つため）。
 */
public record PageRef(
        String id,
        String type,
        String title,
        String repository) {
}

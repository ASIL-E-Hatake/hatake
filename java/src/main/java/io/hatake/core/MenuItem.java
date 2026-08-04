package io.hatake.core;

import java.util.List;

/**
 * A node in an app's navigation menu (see {@link AppDefinition}).
 *
 * <p>Either a <b>leaf</b> (opens {@code page}) or a <b>group</b> (has
 * {@code children}); {@link #isGroup()} distinguishes them.
 */
public record MenuItem(
        String id,
        String label,
        String icon,
        String page,
        List<MenuItem> children,
        List<String> roles) {

    /** True when this node groups {@code children} rather than opening a page. */
    public boolean isGroup() {
        return children != null && !children.isEmpty();
    }
}

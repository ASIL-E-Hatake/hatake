package io.hatake.core;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.yaml.snakeyaml.Yaml;

/**
 * Parses hatake app documents (YAML or JSON) into an {@link AppDefinition}.
 * JSON is a subset of YAML, so both go through the same loader and converge on
 * an identical definition.
 *
 * <p>Menu nodes are parsed recursively; pages are read as a shallow
 * {@link PageRef} inventory (full page models are not parsed here).
 */
public final class AppParser {

    private AppParser() {
    }

    public static AppDefinition parseAppYaml(String source) {
        return fromDecoded(new Yaml().load(source), false);
    }

    /** {@code strict} なら知らないキーを1つも許さない（{@link StrictKeys}）。 */
    public static AppDefinition parseAppYaml(String source, boolean strict) {
        return fromDecoded(new Yaml().load(source), strict);
    }

    public static AppDefinition parseAppJson(String source) {
        return fromDecoded(new Yaml().load(source), false);
    }

    public static AppDefinition parseAppJson(String source, boolean strict) {
        return fromDecoded(new Yaml().load(source), strict);
    }

    /** 先に解析する（id / title の欠落のほうが根本的な問題なので）。 */
    @SuppressWarnings("unchecked")
    private static AppDefinition fromDecoded(Object decoded, boolean strict) {
        AppDefinition app = parseDecoded(decoded);
        if (strict && decoded instanceof Map) {
            List<StrictKeys.UnknownKey> unknown =
                    StrictKeys.find((Map<String, Object>) decoded);
            if (!unknown.isEmpty()) {
                throw new UnknownKeysException(unknown);
            }
        }
        return app;
    }

    @SuppressWarnings("unchecked")
    private static AppDefinition parseDecoded(Object decoded) {
        if (!(decoded instanceof Map)) {
            throw new IllegalArgumentException("Top-level document must be a mapping/object");
        }
        Map<String, Object> root = (Map<String, Object>) decoded;
        String dslVersion = root.get("dsl_version") instanceof String v ? v : "1.0";
        Map<String, Object> app = root.get("app") instanceof Map
                ? (Map<String, Object>) root.get("app")
                : root;

        List<MenuItem> menu = new ArrayList<>();
        if (app.get("menu") instanceof List<?> list) {
            for (Object m : list) {
                menu.add(parseMenu((Map<String, Object>) m));
            }
        }
        List<PageRef> pages = new ArrayList<>();
        if (app.get("pages") instanceof List<?> list) {
            for (Object p : list) {
                pages.add(parsePageRef((Map<String, Object>) p));
            }
        }
        return new AppDefinition(
                reqStr(app, "id"),
                reqStr(app, "title"),
                dslVersion,
                app.get("home") instanceof String h ? h : null,
                menu,
                pages);
    }

    /** A node with {@code group}/{@code items} is a group; otherwise a leaf. */
    @SuppressWarnings("unchecked")
    private static MenuItem parseMenu(Map<String, Object> m) {
        List<String> roles = strList(m.get("roles"));
        Object items = m.get("items");
        if (items instanceof List<?> list && !list.isEmpty() || m.get("group") != null) {
            List<MenuItem> children = new ArrayList<>();
            if (items instanceof List<?> list) {
                for (Object it : list) {
                    children.add(parseMenu((Map<String, Object>) it));
                }
            }
            String label = m.get("group") instanceof String g ? g
                    : m.get("label") instanceof String l ? l : "";
            return new MenuItem(null, label, null, null, children, roles);
        }
        String id = m.get("id") instanceof String i ? i
                : m.get("page") instanceof String p ? p : null;
        return new MenuItem(
                id,
                reqStr(m, "label"),
                m.get("icon") instanceof String ic ? ic : null,
                m.get("page") instanceof String pg ? pg : null,
                List.of(),
                roles);
    }

    private static PageRef parsePageRef(Map<String, Object> m) {
        String type = reqStr(m, "type");
        // ダッシュボードはカードごとに Repository を持つので、ページ側は任意。
        String repository = PageDefinition.DASHBOARD.equals(type)
                ? (m.get("repository") instanceof String r ? r : null)
                : reqStr(m, "repository");
        return new PageRef(
                reqStr(m, "id"),
                type,
                reqStr(m, "title"),
                repository);
    }

    private static List<String> strList(Object o) {
        List<String> result = new ArrayList<>();
        if (o instanceof List<?> list) {
            for (Object e : list) {
                result.add(String.valueOf(e));
            }
        }
        return result;
    }

    private static String reqStr(Map<String, Object> m, String key) {
        Object v = m.get(key);
        if (v instanceof String s && !s.isEmpty()) {
            return s;
        }
        throw new IllegalArgumentException("Missing or empty required string \"" + key + "\"");
    }
}

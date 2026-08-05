package io.hatake.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.yaml.snakeyaml.Yaml;

/**
 * Parses hatake definition documents (YAML or JSON) into a {@link PageDefinition}.
 * JSON is a subset of YAML, so both go through the same loader and converge on
 * an identical definition.
 */
public final class DefinitionParser {

    private DefinitionParser() {
    }

    public static PageDefinition parsePageYaml(String source) {
        return fromDecoded(new Yaml().load(source));
    }

    public static PageDefinition parsePageJson(String source) {
        return fromDecoded(new Yaml().load(source));
    }

    /**
     * すでにデコード済みのマップから解析する（Dart 版 {@code parsePageMap} と同じ）。
     * ドキュメント全体（{@code {dsl_version, page: {...}}}）でも page マップ直接でもよい。
     */
    public static PageDefinition parsePageMap(Map<String, Object> root) {
        return fromDecoded(root);
    }

    @SuppressWarnings("unchecked")
    private static PageDefinition fromDecoded(Object decoded) {
        if (!(decoded instanceof Map)) {
            throw new IllegalArgumentException("Top-level document must be a mapping/object");
        }
        Map<String, Object> root = (Map<String, Object>) decoded;
        String dslVersion = root.get("dsl_version") instanceof String v ? v : "1.0";
        Map<String, Object> page = root.get("page") instanceof Map
                ? (Map<String, Object>) root.get("page")
                : root;

        return new PageDefinition(
                reqStr(page, "id"),
                reqStr(page, "title"),
                dslVersion,
                reqStr(page, "type"),
                reqStr(page, "repository"),
                page.get("key") instanceof String k ? k : "id",
                parseSearch(page.get("search")),
                parseForm(page.get("form")));
    }

    @SuppressWarnings("unchecked")
    private static SearchDefinition parseSearch(Object o) {
        if (!(o instanceof Map)) {
            return null;
        }
        Object filters = ((Map<String, Object>) o).get("filters");
        List<FilterDefinition> result = new ArrayList<>();
        if (filters instanceof List<?> list) {
            for (Object f : list) {
                result.add(parseFilter((Map<String, Object>) f));
            }
        }
        return new SearchDefinition(result);
    }

    private static FilterDefinition parseFilter(Map<String, Object> m) {
        return new FilterDefinition(
                reqStr(m, "field"),
                reqStr(m, "label"),
                m.get("type") instanceof String t ? t : "text",
                m.get("operator") instanceof String op ? op : "contains");
    }

    @SuppressWarnings("unchecked")
    private static FormDefinition parseForm(Object o) {
        if (!(o instanceof Map)) {
            return new FormDefinition(List.of());
        }
        Object sections = ((Map<String, Object>) o).get("sections");
        List<SectionDefinition> result = new ArrayList<>();
        if (sections instanceof List<?> list) {
            for (Object s : list) {
                result.add(parseSection((Map<String, Object>) s));
            }
        }
        return new FormDefinition(result);
    }

    @SuppressWarnings("unchecked")
    private static SectionDefinition parseSection(Map<String, Object> m) {
        String title = m.get("title") instanceof String s ? s : null;
        List<FieldDefinition> fields = new ArrayList<>();
        if (m.get("fields") instanceof List<?> list) {
            for (Object f : list) {
                fields.add(parseField((Map<String, Object>) f));
            }
        }
        return new SectionDefinition(title, fields);
    }

    @SuppressWarnings("unchecked")
    private static FieldDefinition parseField(Map<String, Object> m) {
        List<ValidatorDefinition> validators = new ArrayList<>();
        if (m.get("validators") instanceof List<?> list) {
            for (Object v : list) {
                validators.add(parseValidator((Map<String, Object>) v));
            }
        }
        List<String> normalize = new ArrayList<>();
        if (m.get("normalize") instanceof List<?> list) {
            for (Object n : list) {
                normalize.add(String.valueOf(n));
            }
        }
        List<String> roles = new ArrayList<>();
        if (m.get("roles") instanceof List<?> list) {
            for (Object r : list) {
                roles.add(String.valueOf(r));
            }
        }
        // 明細（type: subTable）。columns はグリッド形状、入れ子の fields は行の入力項目。
        List<ColumnDefinition> columns = new ArrayList<>();
        if (m.get("columns") instanceof List<?> list) {
            for (Object c : list) {
                columns.add(parseColumn((Map<String, Object>) c));
            }
        }
        List<FieldDefinition> rowFields = new ArrayList<>();
        if (m.get("fields") instanceof List<?> list) {
            for (Object f : list) {
                rowFields.add(parseField((Map<String, Object>) f));
            }
        }
        return new FieldDefinition(
                reqStr(m, "field"),
                reqStr(m, "label"),
                m.get("type") instanceof String t ? t : "text",
                Boolean.TRUE.equals(m.get("required")),
                Boolean.TRUE.equals(m.get("readOnly")),
                validators,
                m.get("format") instanceof String f ? f : null,
                normalize,
                optMap(m.get("visibleWhen")),
                optMap(m.get("enabledWhen")),
                optMap(m.get("computed")),
                roles,
                columns,
                rowFields);
    }

    private static ColumnDefinition parseColumn(Map<String, Object> m) {
        return new ColumnDefinition(
                reqStr(m, "field"),
                reqStr(m, "label"),
                m.get("type") instanceof String t ? t : "text",
                m.get("format") instanceof String f ? f : null);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> optMap(Object o) {
        return o instanceof Map ? (Map<String, Object>) o : null;
    }

    private static ValidatorDefinition parseValidator(Map<String, Object> m) {
        Map<String, Object> params = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : m.entrySet()) {
            if (!e.getKey().equals("type") && !e.getKey().equals("message")) {
                params.put(e.getKey(), e.getValue());
            }
        }
        String message = m.get("message") instanceof String s ? s : null;
        return new ValidatorDefinition(reqStr(m, "type"), params, message);
    }

    private static String reqStr(Map<String, Object> m, String key) {
        Object v = m.get(key);
        if (v instanceof String s && !s.isEmpty()) {
            return s;
        }
        throw new IllegalArgumentException("Missing or empty required string \"" + key + "\"");
    }
}

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

    /**
     * {@code strict} なら知らないキーを1つも許さない（{@link StrictKeys}）。
     * 綴り間違いが「黙って効かない」ではなく {@link UnknownKeysException} になる。
     */
    public static PageDefinition parsePageYaml(String source, boolean strict) {
        return fromDecoded(new Yaml().load(source), strict);
    }

    public static PageDefinition parsePageJson(String source) {
        return fromDecoded(new Yaml().load(source));
    }

    public static PageDefinition parsePageJson(String source, boolean strict) {
        return fromDecoded(new Yaml().load(source), strict);
    }

    /**
     * すでにデコード済みのマップから解析する（Dart 版 {@code parsePageMap} と同じ）。
     * ドキュメント全体（{@code {dsl_version, page: {...}}}）でも page マップ直接でもよい。
     */
    public static PageDefinition parsePageMap(Map<String, Object> root) {
        return fromDecoded(root);
    }

    private static PageDefinition fromDecoded(Object decoded) {
        return fromDecoded(decoded, false);
    }

    /** 先に解析する（type / id の欠落のほうが根本的な問題なので）。 */
    @SuppressWarnings("unchecked")
    private static PageDefinition fromDecoded(Object decoded, boolean strict) {
        PageDefinition page = parseDecoded(decoded);
        if (strict && decoded instanceof Map) {
            List<StrictKeys.UnknownKey> unknown =
                    StrictKeys.find((Map<String, Object>) decoded);
            if (!unknown.isEmpty()) {
                throw new UnknownKeysException(unknown);
            }
        }
        return page;
    }

    @SuppressWarnings("unchecked")
    private static PageDefinition parseDecoded(Object decoded) {
        if (!(decoded instanceof Map)) {
            throw new IllegalArgumentException("Top-level document must be a mapping/object");
        }
        Map<String, Object> root = (Map<String, Object>) decoded;
        String dslVersion = root.get("dsl_version") instanceof String v ? v : "1.0";
        Map<String, Object> page = root.get("page") instanceof Map
                ? (Map<String, Object>) root.get("page")
                : root;

        String type = reqStr(page, "type");
        List<WizardStepDefinition> steps = parseWizardSteps(page, type);
        // ウィザードは form を持たないので、全ステップを畳んだものを form とする。
        FormDefinition form = steps.isEmpty()
                ? parseForm(page.get("form"))
                : new FormDefinition(steps.stream()
                        .map(s -> new SectionDefinition(s.title(), s.fields(), null))
                        .toList());
        boolean dashboard = PageDefinition.DASHBOARD.equals(type);

        return new PageDefinition(
                reqStr(page, "id"),
                reqStr(page, "title"),
                dslVersion,
                type,
                // ダッシュボードの repository はカードの既定値なので任意。
                dashboard
                        ? (page.get("repository") instanceof String r ? r : null)
                        : reqStr(page, "repository"),
                page.get("key") instanceof String k ? k : "id",
                parseSearch(page.get("search")),
                parseTable(page.get("table")),
                form,
                steps,
                parseDashboardItems(page, dashboard),
                PageDefinition.REPORT.equals(type)
                        ? parseReport(optMap(page.get("report")))
                        : null);
    }

    /** 帳票の「紙の構造」。無ければ既定（A4 縦・40行・グループ無し）。 */
    @SuppressWarnings("unchecked")
    private static ReportDefinition parseReport(Map<String, Object> m) {
        if (m == null) {
            return ReportDefinition.DEFAULT;
        }
        Map<String, Object> paper = optMap(m.get("paper"));
        List<ReportGroup> groups = new ArrayList<>();
        if (m.get("groupBy") instanceof List<?> list) {
            for (Object o : list) {
                Map<String, Object> g = (Map<String, Object>) o;
                groups.add(new ReportGroup(
                        reqStr(g, "field"),
                        reqStr(g, "label"),
                        Boolean.TRUE.equals(g.get("pageBreak"))));
            }
        }
        List<ReportTotal> totals = new ArrayList<>();
        if (m.get("totals") instanceof List<?> list) {
            for (Object o : list) {
                Map<String, Object> t = (Map<String, Object>) o;
                totals.add(new ReportTotal(
                        reqStr(t, "field"),
                        t.get("aggregate") instanceof String a ? a : "sum"));
            }
        }
        Map<String, Object> sort = optMap(m.get("sort"));
        return new ReportDefinition(
                paper != null && paper.get("size") instanceof String s ? s : "A4",
                paper != null && paper.get("orientation") instanceof String o
                        ? o
                        : ReportDefinition.PORTRAIT,
                m.get("rowsPerPage") instanceof Number n ? n.intValue() : 40,
                List.copyOf(groups),
                List.copyOf(totals),
                m.get("limit") instanceof Number n ? n.intValue() : 1000,
                sort == null || !(sort.get("field") instanceof String f) ? null : f,
                sort == null || !(sort.get("ascending") instanceof Boolean a) || a);
    }

    /** ダッシュボードのカード。1枚＝小さな読み取りクエリ + 見せ方。 */
    @SuppressWarnings("unchecked")
    private static List<DashboardItemDefinition> parseDashboardItems(
            Map<String, Object> page, boolean dashboard) {
        if (!dashboard) {
            return List.of();
        }
        if (!(page.get("items") instanceof List<?> raw) || raw.isEmpty()) {
            throw new IllegalArgumentException("A dashboard page needs at least one item");
        }
        List<DashboardItemDefinition> items = new ArrayList<>();
        for (Object o : raw) {
            Map<String, Object> m = (Map<String, Object>) o;
            Map<String, Object> sort = optMap(m.get("sort"));
            List<ColumnDefinition> columns = new ArrayList<>();
            if (m.get("columns") instanceof List<?> list) {
                for (Object c : list) {
                    columns.add(parseColumn((Map<String, Object>) c));
                }
            }
            List<String> roles = new ArrayList<>();
            if (m.get("roles") instanceof List<?> list) {
                for (Object r : list) {
                    roles.add(String.valueOf(r));
                }
            }
            Map<String, Object> filters = optMap(m.get("filters"));
            items.add(new DashboardItemDefinition(
                    reqStr(m, "id"),
                    m.get("type") instanceof String t ? t : DashboardItemDefinition.METRIC,
                    reqStr(m, "title"),
                    m.get("repository") instanceof String r ? r : null,
                    filters == null ? Map.of() : Map.copyOf(filters),
                    m.get("limit") instanceof Number n ? n.intValue() : 100,
                    sort == null || !(sort.get("field") instanceof String f) ? null : f,
                    sort == null || !(sort.get("ascending") instanceof Boolean a) || a,
                    parseDashboardValue(optMap(m.get("value"))),
                    m.get("format") instanceof String f ? f : null,
                    List.copyOf(columns),
                    parseChart(optMap(m.get("chart"))),
                    List.copyOf(roles)));
        }
        return List.copyOf(items);
    }

    /** {@code metric} の畳み込み。無ければ null（＝件数）。 */
    private static DashboardValueDefinition parseDashboardValue(Map<String, Object> m) {
        if (m == null || m.isEmpty()) {
            return null;
        }
        return new DashboardValueDefinition(
                m.get("aggregate") instanceof String a ? a : "count",
                m.get("field") instanceof String f ? f : null);
    }

    /** {@code chart} のプロット。 */
    private static ChartDefinition parseChart(Map<String, Object> m) {
        if (m == null || m.isEmpty()) {
            return null;
        }
        return new ChartDefinition(
                m.get("kind") instanceof String k ? k : "bar",
                reqStr(m, "labelField"),
                m.get("valueField") instanceof String v ? v : null,
                m.get("aggregate") instanceof String a ? a : null);
    }

    /** 一覧テーブルの列。レスポンス形の導出に使う。 */
    @SuppressWarnings("unchecked")
    private static TableDefinition parseTable(Object o) {
        if (!(o instanceof Map)) {
            return TableDefinition.EMPTY;
        }
        Map<String, Object> m = (Map<String, Object>) o;
        if (!(m.get("columns") instanceof List<?> list)) {
            return TableDefinition.EMPTY;
        }
        List<ColumnDefinition> columns = new ArrayList<>();
        for (Object c : list) {
            columns.add(parseColumn((Map<String, Object>) c));
        }
        return new TableDefinition(List.copyOf(columns));
    }

    /** ステップは section の形（{@code fields}）＋ id / title。 */
    @SuppressWarnings("unchecked")
    private static List<WizardStepDefinition> parseWizardSteps(
            Map<String, Object> page, String type) {
        if (!PageDefinition.WIZARD.equals(type)) {
            return List.of();
        }
        if (!(page.get("steps") instanceof List<?> raw) || raw.isEmpty()) {
            throw new IllegalArgumentException("A wizard page needs at least one step");
        }
        List<WizardStepDefinition> steps = new ArrayList<>();
        for (Object o : raw) {
            Map<String, Object> m = (Map<String, Object>) o;
            List<FieldDefinition> fields = new ArrayList<>();
            if (m.get("fields") instanceof List<?> list) {
                for (Object f : list) {
                    fields.add(parseField((Map<String, Object>) f));
                }
            }
            steps.add(new WizardStepDefinition(
                    reqStr(m, "id"), reqStr(m, "title"), List.copyOf(fields)));
        }
        return List.copyOf(steps);
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
        return new SectionDefinition(title, fields, optMap(m.get("visibleWhen")));
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
                optMap(m.get("requiredWhen")),
                Boolean.TRUE.equals(m.get("readOnly")),
                optMap(m.get("readOnlyWhen")),
                validators,
                m.get("format") instanceof String f ? f : null,
                normalize,
                optMap(m.get("visibleWhen")),
                optMap(m.get("enabledWhen")),
                optMap(m.get("computed")),
                roles,
                columns,
                rowFields,
                parseSubTableSource(optMap(m.get("source"))));
    }

    /** 明細の {@code source}。無ければ null（＝子行は親レコード埋め込み）。 */
    private static SubTableSource parseSubTableSource(Map<String, Object> m) {
        if (m == null || m.isEmpty()) {
            return null;
        }
        return new SubTableSource(
                reqStr(m, "repository"),
                reqStr(m, "parentKey"),
                m.get("key") instanceof String k ? k : "id",
                m.get("pageSize") instanceof Number n ? n.intValue() : 20);
    }

    private static ColumnDefinition parseColumn(Map<String, Object> m) {
        Map<String, Object> config = optMap(m.get("config"));
        return new ColumnDefinition(
                reqStr(m, "field"),
                reqStr(m, "label"),
                m.get("type") instanceof String t ? t : "text",
                m.get("format") instanceof String f ? f : null,
                config == null ? Map.of() : Map.copyOf(config));
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

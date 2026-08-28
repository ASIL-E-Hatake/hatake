package io.hatake.core;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * 未知キーの検出（strict パース）。Dart / TypeScript 版と同結果。
 *
 * <p>既定のパーサは知らないキーを黙って捨てる。人間には「書いたのに効かない」、
 * AI には「間違いに気づけない」形で刺さるので、機械で言えるようにする。
 *
 * <p>厳しさは {@code spec/hatake-page.schema.json} と完全に同じ:
 * {@code additionalProperties: false} のノードだけを閉じ、{@code config} /
 * {@code validators} / {@code computed} / {@code visibleWhen} のような<b>自由な
 * 入れ物の中は見ない</b>。この対応は {@code StrictKeysSchemaTest} が確認している。
 */
public final class StrictKeys {

    private StrictKeys() {
    }

    /**
     * 定義の中で見つかった知らないキー1つ。
     *
     * @param path そのキーを持つノードまでのパス（ドキュメント直下は空文字）
     * @param key 知らないキー
     * @param suggestion 一番近い既知キー（無ければ null）
     */
    public record UnknownKey(String path, String key, String suggestion) {

        /** 人にも AI にも読める1行。 */
        public String describe() {
            String at = path.isEmpty() ? "ドキュメント直下" : path;
            String hint = suggestion == null ? "" : "（" + suggestion + " の間違い？）";
            return at + ": 知らないキー \"" + key + "\"" + hint;
        }
    }

    /**
     * 閉じたノードごとの既知キー。名前は JSON Schema の {@code $defs} と揃えている
     * （{@code <親>.<キー>} はスキーマ側で入れ子に直接書かれているもの）。
     */
    public static final Map<String, Set<String>> TABLE = Map.ofEntries(
            Map.entry("", keys("dsl_version", "page", "app")),
            Map.entry("app", keys("id", "title", "home", "navigation", "theme", "menu",
                    "pages")),
            Map.entry("theme", keys("primaryColor", "secondaryColor", "brightness",
                    "density", "fontFamily", "radius", "config")),
            Map.entry("menuItem", keys("id", "label", "group", "icon", "page", "items", "roles")),
            Map.entry("crudPage", keys("type", "id", "title", "repository", "key", "search",
                    "table", "form", "actions")),
            Map.entry("masterPage", keys("type", "id", "title", "repository", "key", "search",
                    "table", "form", "actions")),
            Map.entry("searchPage", keys("type", "id", "title", "repository", "key", "search",
                    "table", "actions")),
            Map.entry("detailPage", keys("type", "id", "title", "repository", "key", "form",
                    "actions")),
            Map.entry("formPage", keys("type", "id", "title", "repository", "key", "form",
                    "actions")),
            Map.entry("wizardPage", keys("type", "id", "title", "repository", "key", "steps",
                    "actions")),
            Map.entry("wizardStep", keys("id", "title", "description", "layout", "fields")),
            Map.entry("dashboardPage", keys("type", "id", "title", "repository", "layout",
                    "search", "items", "actions")),
            Map.entry("dashboardItem", keys("id", "title", "type", "repository", "span",
                    "filters", "limit", "sort", "value", "format", "config", "columns", "chart",
                    "action", "roles")),
            Map.entry("dashboardItem.sort", keys("field", "ascending")),
            Map.entry("dashboardValue", keys("aggregate", "field")),
            Map.entry("chart", keys("kind", "labelField", "valueField", "aggregate")),
            Map.entry("reportPage", keys("type", "id", "title", "repository", "search", "table",
                    "report", "actions")),
            Map.entry("report", keys("paper", "rowsPerPage", "limit", "sort", "groupBy",
                    "totals")),
            Map.entry("report.sort", keys("field", "ascending")),
            Map.entry("paper", keys("size", "orientation")),
            Map.entry("reportGroup", keys("field", "label", "pageBreak")),
            Map.entry("reportTotal", keys("field", "aggregate")),
            Map.entry("search", keys("layout", "filters")),
            Map.entry("filter", keys("field", "label", "type", "operator", "options",
                    "optionsFrom", "optionsSource", "config")),
            Map.entry("table", keys("columns", "pagination", "rowActions")),
            Map.entry("column", keys("field", "label", "type", "width", "sortable", "format",
                    "config", "roles")),
            Map.entry("pagination", keys("pageSize", "enabled")),
            Map.entry("form", keys("sections")),
            Map.entry("section", keys("title", "layout", "fields", "visibleWhen")),
            Map.entry("field", keys("field", "label", "type", "required", "requiredWhen",
                    "readOnly", "readOnlyWhen",
                    "defaultValue", "validators", "options", "optionsFrom", "optionsSource",
                    "format", "normalize", "config", "visibleWhen", "enabledWhen", "computed",
                    "roles", "columns", "fields", "source")),
            Map.entry("subTableSource", keys("repository", "parentKey", "key", "pageSize")),
            Map.entry("action", keys("id", "type", "label", "scope", "plugin", "page", "params",
                    "confirm", "onSuccess", "onError", "prompt", "maxRows", "batchSize",
                    "enabledWhen", "open", "config", "roles")),
            Map.entry("maxRows", keys("default", "byRole")),
            Map.entry("batchSize", keys("default", "byRole")),
            Map.entry("confirm", keys("title", "message", "okLabel", "cancelLabel", "danger")),
            Map.entry("actionSuccess", keys("message", "page", "params")),
            Map.entry("actionError", keys("message")),
            Map.entry("actionPrompt", keys("title", "okLabel", "cancelLabel", "fields")),
            Map.entry("option", keys("value", "label", "when")),
            Map.entry("optionsSource", keys("repository", "value", "label", "parentKey",
                    "limit")),
            Map.entry("layout", keys("columns")));

    /** 子ノードへの道。{@code []} 付きはそのノードの配列。無いキーは葉／自由な入れ物。 */
    private static final Map<String, Map<String, String>> CHILDREN = Map.ofEntries(
            Map.entry("", Map.of("app", "app", "page", "page")),
            Map.entry("app", Map.of("theme", "theme", "menu", "menuItem[]", "pages", "page[]")),
            Map.entry("menuItem", Map.of("items", "menuItem[]")),
            // byRole の中は役割名（自由な入れ物）なので降りない。
            Map.entry("action", Map.of("confirm", "confirm", "onSuccess", "actionSuccess",
                    "onError", "actionError", "prompt", "actionPrompt",
                    "maxRows", "maxRows", "batchSize", "batchSize")),
            Map.entry("crudPage", Map.of("search", "search", "table", "table", "form", "form",
                    "actions", "action[]")),
            Map.entry("masterPage", Map.of("search", "search", "table", "table", "form", "form",
                    "actions", "action[]")),
            Map.entry("searchPage", Map.of("search", "search", "table", "table",
                    "actions", "action[]")),
            Map.entry("detailPage", Map.of("form", "form", "actions", "action[]")),
            Map.entry("formPage", Map.of("form", "form", "actions", "action[]")),
            Map.entry("wizardPage", Map.of("steps", "wizardStep[]", "actions", "action[]")),
            Map.entry("wizardStep", Map.of("layout", "layout", "fields", "field[]")),
            Map.entry("dashboardPage", Map.of("layout", "layout", "search", "search",
                    "items", "dashboardItem[]", "actions", "action[]")),
            Map.entry("dashboardItem", Map.of("sort", "dashboardItem.sort",
                    "value", "dashboardValue", "chart", "chart", "columns", "column[]")),
            Map.entry("reportPage", Map.of("search", "search", "table", "table",
                    "report", "report", "actions", "action[]")),
            Map.entry("report", Map.of("paper", "paper", "sort", "report.sort",
                    "groupBy", "reportGroup[]", "totals", "reportTotal[]")),
            Map.entry("search", Map.of("layout", "layout", "filters", "filter[]")),
            Map.entry("filter", Map.of("options", "option[]",
                    "optionsSource", "optionsSource")),
            Map.entry("table", Map.of("columns", "column[]", "pagination", "pagination")),
            Map.entry("form", Map.of("sections", "section[]")),
            Map.entry("section", Map.of("layout", "layout", "fields", "field[]")),
            Map.entry("actionPrompt", Map.of("fields", "field[]")),
            Map.entry("field", Map.of("options", "option[]", "optionsSource", "optionsSource",
                    "columns", "column[]", "fields", "field[]", "source", "subTableSource")));

    /** {@code page.type} → 閉じたページノード名。未知の種別は null（種別エラーの領分）。 */
    private static final Map<String, String> PAGE_NODES = Map.of(
            "crud", "crudPage",
            "master", "masterPage",
            "search", "searchPage",
            "detail", "detailPage",
            "form", "formPage",
            "wizard", "wizardPage",
            "dashboard", "dashboardPage",
            "report", "reportPage");

    private static Set<String> keys(String... values) {
        return Set.of(values);
    }

    /**
     * {@code document} の中の未知キーを全部返す。1件目で止めない（1往復で直せるように）。
     * 並びは {@code (path, key)} の昇順。
     */
    public static List<UnknownKey> find(Map<String, Object> document) {
        List<UnknownKey> found = new ArrayList<>();
        walk("", document, "", found);
        found.sort(Comparator.comparing(UnknownKey::path).thenComparing(UnknownKey::key));
        return List.copyOf(found);
    }

    @SuppressWarnings("unchecked")
    private static void walk(String node, Object value, String path, List<UnknownKey> found) {
        if (!(value instanceof Map)) {
            return;
        }
        Map<String, Object> map = (Map<String, Object>) value;
        String resolved = "page".equals(node)
                ? PAGE_NODES.get(String.valueOf(map.get("type")))
                : node;
        if (resolved == null) {
            return; // 未知のページ種別
        }
        Set<String> known = TABLE.get(resolved);
        if (known == null) {
            return;
        }

        for (Map.Entry<String, Object> entry : map.entrySet()) {
            String key = entry.getKey();
            if (!known.contains(key)) {
                found.add(new UnknownKey(path, key, closest(key, known)));
                continue;
            }
            String target = CHILDREN.getOrDefault(resolved, Map.of()).get(key);
            if (target == null) {
                continue; // 葉、または自由な入れ物
            }
            String childPath = path.isEmpty() ? key : path + "." + key;
            if (target.endsWith("[]")) {
                String childNode = target.substring(0, target.length() - 2);
                if (entry.getValue() instanceof List<?> list) {
                    for (int i = 0; i < list.size(); i++) {
                        walk(childNode, list.get(i), childPath + "[" + i + "]", found);
                    }
                }
            } else {
                walk(target, entry.getValue(), childPath, found);
            }
        }
    }

    /**
     * {@code key} に一番近い既知キー。大文字小文字を無視した編集距離が2以下のものだけ。
     * 同点はアルファベット順（言語をまたいで同じ答えにするため）。
     */
    public static String closest(String key, Collection<String> known) {
        String lower = key.toLowerCase();
        String best = null;
        int bestDistance = 3;
        for (String candidate : new TreeSet<>(known)) {
            int distance = editDistance(lower, candidate.toLowerCase());
            if (distance < bestDistance) {
                bestDistance = distance;
                best = candidate;
            }
        }
        return best;
    }

    /** Levenshtein 距離（2行だけ持つ素直な実装）。 */
    private static int editDistance(String a, String b) {
        if (a.equals(b)) {
            return 0;
        }
        if (a.isEmpty()) {
            return b.length();
        }
        if (b.isEmpty()) {
            return a.length();
        }
        int[] previous = new int[b.length() + 1];
        int[] current = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) {
            previous[j] = j;
        }
        for (int i = 1; i <= a.length(); i++) {
            current[0] = i;
            for (int j = 1; j <= b.length(); j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                current[j] = Math.min(
                        Math.min(previous[j] + 1, current[j - 1] + 1),
                        previous[j - 1] + cost);
            }
            int[] swap = previous;
            previous = current;
            current = swap;
        }
        return previous[b.length()];
    }
}

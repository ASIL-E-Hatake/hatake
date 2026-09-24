package io.hatake.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * <b>アプリ全体の語彙</b>（{@code app.vocabularies}）を、書いてある所へ展開する。
 *
 * <p>業務のコード表（{@code shipped} → 出荷済）は、一覧・検索・詳細・帳票と
 * <b>同じものが何度も出てきます</b>。見本2本を数えたら、同じ並びを 3回・2回・3回
 * 書いていました。片方だけ直すと画面ごとに違う字が出て、しかも直すまで誰も
 * 気づきません。
 *
 * <pre>
 * app:
 *   vocabularies:
 *     - name: orderStatus
 *       options:
 *         - { value: shipped, label: 出荷済 }
 *   pages:
 *     - table:
 *         columns:
 *           - { field: status, label: 受注状態, optionsOf: orderStatus }
 * </pre>
 *
 * <p><b>解決は読み込み時</b>です。生の定義を書き換えてから解析器に渡すので、
 * この先（検証・CSV・DTO）は語彙を知らないまま正しく動きます。
 *
 * <p>Dart / TypeScript 版と同じ判断をすること（3版で同じ定義から同じ字が出る）:
 * <ul>
 *   <li>その場に書いた {@code options} が勝つ
 *   <li>引けない名前は<b>そのまま残す</b>（空の並びを置くと、検証にも出なくなる）
 *   <li>同じ名前が2回あれば、<b>先に書いたほう</b>が残る
 * </ul>
 */
public final class Vocabularies {

    private Vocabularies() {}

    /** {@code app.vocabularies} を名前で引ける形にする。 */
    @SuppressWarnings("unchecked")
    public static Map<String, List<Object>> of(Map<String, Object> document) {
        Map<String, Object> app = document.get("app") instanceof Map
                ? (Map<String, Object>) document.get("app")
                : document;
        Map<String, List<Object>> found = new LinkedHashMap<>();
        if (!(app.get("vocabularies") instanceof List<?> list)) {
            return found;
        }
        for (Object one : list) {
            if (!(one instanceof Map<?, ?> map)) {
                continue;
            }
            Object name = ((Map<String, Object>) map).get("name");
            if (!(name instanceof String key) || found.containsKey(key)) {
                continue;
            }
            Object options = ((Map<String, Object>) map).get("options");
            found.put(key, options instanceof List<?> l
                    ? List.copyOf((List<Object>) l)
                    : List.of());
        }
        return found;
    }

    /** {@code optionsOf} を実体の並びに置き換えた定義を返す（<b>元は変えない</b>）。 */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> expand(Map<String, Object> document) {
        Map<String, List<Object>> found = of(document);
        if (found.isEmpty()) {
            return document;
        }
        return (Map<String, Object>) walk(document, found);
    }

    @SuppressWarnings("unchecked")
    private static Object walk(Object node, Map<String, List<Object>> found) {
        if (node instanceof List<?> list) {
            List<Object> out = new ArrayList<>(list.size());
            for (Object one : list) {
                out.add(walk(one, found));
            }
            return out;
        }
        if (!(node instanceof Map<?, ?> map)) {
            return node;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : ((Map<String, Object>) map).entrySet()) {
            out.put(e.getKey(), walk(e.getValue(), found));
        }
        if (!(out.get("optionsOf") instanceof String name)) {
            return out;
        }
        // その場に書いた並びが勝つ（両方書いてあるのは書き間違い）。
        if (out.get("options") instanceof List) {
            return out;
        }
        List<Object> options = found.get(name);
        if (options != null) {
            out.put("options", options);
        }
        return out;
    }
}

package io.hatake.core;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * サーバが<b>画面と同じ判断</b>をする口（0.9.22）。
 *
 * <p>画面は {@code roles} で列・項目・ボタン・画面そのものを隠す。しかし API を直接叩けば
 * 全部通るので、隠しただけでは「見えないだけ」になる。0.9.21 までは見本がここを手で書いて
 * いて（列の roles だけ見て項目の roles を忘れる・画面の権限を役割名で決め打ち）、定義と
 * 食い違っていた。
 *
 * <p>どれも<b>素の document と画面の id</b> を受ける（{@link BulkLimits} と同じ）。この版の
 * {@link PageDefinition} はボタンも画面の roles も持たない（持たせると record の構築子が
 * 変わる＝壊れる）。TypeScript 版（{@code canOpenPageIn} ほか）と同じ答えになることは
 * 共有フィクスチャ {@code spec/conformance/server_access.json} で縛る。
 *
 * <p><b>やらないこと</b>: 空文字を null にする・{@code normalize} を当てる・
 * {@code readOnlyWhen} のような条件つきの判定・明細の子行の roles・行の範囲（「自分の拠点の
 * 行だけ」）。最後のは認可なので枠組みの外。
 */
public final class ServerAccess {

    private ServerAccess() {}

    private static final Set<String> BUILT_IN = Set.of("create", "edit", "delete");
    private static final Set<String> LISTS = Set.of("crud", "master");
    private static final Set<String> INPUTS = Set.of("form", "wizard");

    /**
     * {@link #acceptRecord} の答え。
     *
     * @param accepted 受け取ってよい項目だけのレコード（届いた順）
     * @param dropped  落とした項目の名前（届いた順）。黙って捨てないために返す
     */
    public record Accepted(Map<String, Object> accepted, List<String> dropped) {}

    /**
     * その人がこの画面を開けるか（画面自身の {@code roles}）。<b>知らない画面は閉じている</b>。
     */
    public static boolean canOpenPage(
            Map<String, Object> document, String pageId, Set<String> roles) {
        return opens(pageIn(document, pageId), roles);
    }

    /**
     * その人がこの画面のボタンを押せるか。{@code actionId} は宣言の id か、組み込みの
     * {@code create} / {@code edit} / {@code delete}。
     *
     * <ul>
     *   <li>開けない画面では何も押せない
     *   <li>宣言したボタン（id が合うもの）はその {@code roles}
     *   <li>{@code create} は {@code type: create} を宣言したときだけ
     *   <li>{@code edit} / {@code delete} は {@code table.rowActions} に並べたときだけで、
     *       宣言（{@code type} で引く）が在ればその {@code roles}
     *   <li>form / wizard は画面そのものが入力なので、{@code create} / {@code edit} は開ければ可
     *   <li>それ以外は押せない
     * </ul>
     */
    public static boolean canRunAction(
            Map<String, Object> document, String pageId, String actionId, Set<String> roles) {
        Map<String, Object> page = pageIn(document, pageId);
        if (!opens(page, roles)) {
            return false;
        }
        List<Map<String, Object>> actions = dicts(page.get("actions"));
        String kind = page.get("type") instanceof String s ? s : "";

        for (Map<String, Object> action : actions) {
            if (actionId.equals(action.get("id"))) {
                return Access.isAllowed(strings(action.get("roles")), roles);
            }
        }
        if (!BUILT_IN.contains(actionId)) {
            return false;
        }
        if (INPUTS.contains(kind)) {
            return !"delete".equals(actionId);
        }
        if (!LISTS.contains(kind)) {
            return false;
        }
        Map<String, Object> byType = null;
        for (Map<String, Object> action : actions) {
            if (actionId.equals(action.get("type"))) {
                byType = action;
                break;
            }
        }
        if ("create".equals(actionId)) {
            return byType != null && Access.isAllowed(strings(byType.get("roles")), roles);
        }
        Map<String, Object> table = dict(page.get("table"));
        if (!strings(table.get("rowActions")).contains(actionId)) {
            return false;
        }
        return byType == null || Access.isAllowed(strings(byType.get("roles")), roles);
    }

    /**
     * その人に<b>見せてよい形</b>にしたレコード（元は変えない）。
     *
     * <p>見せないのは、その画面の列か入力欄の<b>どこか一つでも</b> {@code roles} から外れて
     * いる項目（守る側なので一番厳しく倒す）。定義に出てこない項目は触らない。開けない画面
     * では何も見せない（空のレコード）。
     */
    public static Map<String, Object> visibleRecord(
            Map<String, Object> document,
            String pageId,
            Map<String, Object> record,
            Set<String> roles) {
        Map<String, Object> page = pageIn(document, pageId);
        Map<String, Object> out = new LinkedHashMap<>();
        if (!opens(page, roles)) {
            return out;
        }
        Set<String> hidden = hidden(page, roles);
        for (Map.Entry<String, Object> entry : record.entrySet()) {
            if (!hidden.contains(entry.getKey())) {
                out.put(entry.getKey(), entry.getValue());
            }
        }
        return out;
    }

    /**
     * 届いた body のうち、その人が<b>この画面から書いてよい項目</b>だけを残す。
     *
     * <p>残すのは、その画面の入力欄に在って・その人に見えて・{@code readOnly} でも
     * {@code computed} でもない項目。開けない画面からは何も受け取らない。
     */
    public static Accepted acceptRecord(
            Map<String, Object> document,
            String pageId,
            Map<String, Object> body,
            Set<String> roles) {
        Map<String, Object> page = pageIn(document, pageId);
        Set<String> writable = new HashSet<>();
        if (opens(page, roles)) {
            Set<String> hidden = hidden(page, roles);
            for (Map<String, Object> field : formFields(page)) {
                if (!(field.get("field") instanceof String name)) {
                    continue;
                }
                if (Boolean.TRUE.equals(field.get("readOnly")) || field.get("computed") != null) {
                    continue;
                }
                if (hidden.contains(name)) {
                    continue;
                }
                writable.add(name);
            }
        }
        Map<String, Object> accepted = new LinkedHashMap<>();
        List<String> dropped = new ArrayList<>();
        for (Map.Entry<String, Object> entry : body.entrySet()) {
            if (writable.contains(entry.getKey())) {
                accepted.put(entry.getKey(), entry.getValue());
            } else {
                dropped.add(entry.getKey());
            }
        }
        return new Accepted(accepted, List.copyOf(dropped));
    }

    // ── 素の定義を読む ────────────────────────────────────────────────

    private static boolean opens(Map<String, Object> page, Set<String> roles) {
        return page != null && Access.isAllowed(strings(page.get("roles")), roles);
    }

    /** 画面を1枚引く（単票でも app でも）。無ければ null。 */
    private static Map<String, Object> pageIn(Map<String, Object> document, String pageId) {
        Map<String, Object> single = dict(document.get("page"));
        if (pageId.equals(single.get("id"))) {
            return single;
        }
        for (Map<String, Object> page : dicts(dict(document.get("app")).get("pages"))) {
            if (pageId.equals(page.get("id"))) {
                return page;
            }
        }
        return null;
    }

    /** 列か入力欄のどこか一つでも roles から外れる項目。 */
    private static Set<String> hidden(Map<String, Object> page, Set<String> roles) {
        List<Map<String, Object>> nodes = new ArrayList<>(dicts(dict(page.get("table")).get("columns")));
        nodes.addAll(formFields(page));
        Set<String> out = new HashSet<>();
        for (Map<String, Object> node : nodes) {
            if (node.get("field") instanceof String name
                    && !Access.isAllowed(strings(node.get("roles")), roles)) {
                out.add(name);
            }
        }
        return out;
    }

    /** 入力欄を全部（枠の中とステップの中を区別しない）。 */
    private static List<Map<String, Object>> formFields(Map<String, Object> page) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> section : dicts(dict(page.get("form")).get("sections"))) {
            out.addAll(dicts(section.get("fields")));
        }
        for (Map<String, Object> step : dicts(page.get("steps"))) {
            out.addAll(dicts(step.get("fields")));
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> dict(Object value) {
        return value instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> dicts(Object value) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (value instanceof List<?> list) {
            for (Object one : list) {
                if (one instanceof Map<?, ?> map) {
                    out.add((Map<String, Object>) map);
                }
            }
        }
        return out;
    }

    private static List<String> strings(Object value) {
        List<String> out = new ArrayList<>();
        if (value instanceof List<?> list) {
            for (Object one : list) {
                if (one instanceof String s) {
                    out.add(s);
                }
            }
        }
        return out;
    }
}

package io.hatake.core;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 1回で動かせる行数の上限（{@code action.maxRows}）を、<b>素の定義から</b>解く。
 *
 * <p>画面はもう止めている（上限を超えて選んでいる間ボタンが押せない）。しかし API を
 * 直接叩けば通るので、上限は<b>守る側でも同じ数</b>で判定できないと意味がない。検証
 * （{@link FormValidator}）を画面とバックエンドの両方で回すのと同じ理由。
 *
 * <p>解析済みの {@link PageDefinition} ではなく素の Map を受けるのは、アクションが UI の
 * 話で、この版のモデルが持っていないから。持たせるより、必要な1つ（件数の上限）だけを
 * ここで読む方が小さい。Dart / TypeScript 版と同じ答えになることは共有フィクスチャ
 * {@code spec/conformance/bulk_limits.json} で縛る。
 */
public final class BulkLimits {

    private BulkLimits() {}

    /** 上限なしを表す（{@code all} と、そもそも書いていない場合）。 */
    private static final Integer NO_LIMIT = null;

    /**
     * {@code actionId} のボタンを {@code roles} の人が押したとき、<b>1回で何件まで</b>か。
     *
     * @return 件数。<b>null は上限なし</b>（書いていない / {@code all} / そのアクションが無い）
     */
    public static Integer limitFor(
            Map<String, Object> document, String actionId, Set<String> roles) {
        return limitFor(document, actionId, roles, null);
    }

    /**
     * {@code pageId} の画面に絞って上限を読む。
     *
     * <p>同じ id のボタンは別の画面にも在り得る（{@code csv} はどの画面にも置く）。画面が
     * 分かっているなら渡す。渡さないときは<b>一番厳しい上限</b>を採る（守る側なので、
     * 緩い方に倒すと画面で押せない操作が API で通る）。
     */
    public static Integer limitFor(
            Map<String, Object> document, String actionId, Set<String> roles, String pageId) {
        Integer strictest = NO_LIMIT;
        for (Map<String, Object> action : findActions(document, actionId, pageId)) {
            Integer found = limitOf(action, roles);
            if (found == null) {
                continue; // このボタンは上限なし
            }
            if (strictest == null || found < strictest) {
                strictest = found;
            }
        }
        return strictest;
    }

    private static Integer limitOf(Map<String, Object> action, Set<String> roles) {
        Object raw = action.get("maxRows");
        if (raw instanceof Number n) {
            return n.intValue();
        }
        if (!(raw instanceof Map<?, ?> limit)) {
            return NO_LIMIT;
        }
        // 当てはまる役割が複数あれば一番ゆるい方（roles が「どれか1つ当てはまれば見える」
        // なのと同じ考え方＝役割は持っているほど広がる）。
        Object byRole = limit.get("byRole");
        boolean matched = false;
        int widest = 0;
        if (byRole instanceof Map<?, ?> perRole) {
            for (Object role : roles) {
                Object found = perRole.get(role);
                if (found == null && !perRole.containsKey(role)) {
                    continue;
                }
                if (!(found instanceof Number n)) {
                    return NO_LIMIT; // all
                }
                matched = true;
                widest = Math.max(widest, n.intValue());
            }
        }
        if (matched) {
            return widest;
        }
        Object fallback = limit.get("default");
        return fallback instanceof Number n ? n.intValue() : NO_LIMIT;
    }

    /**
     * 届いた件数が上限を超えていないか。<b>超えていなければ null</b>（＝通す）。
     *
     * <p>バックエンドはこれを1行で挟める。画面が止めているのは「早く気づかせるため」で、
     * こちらは「守るため」＝同じ定義から同じ数を読む。
     */
    public static String check(
            Map<String, Object> document,
            String actionId,
            int count,
            Set<String> roles,
            MessageResolver messages) {
        Integer limit = limitFor(document, actionId, roles);
        if (limit == null || count <= limit) {
            return null;
        }
        return messages.resolve("bulk.tooMany", Map.of("value", limit, "count", count));
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> findActions(
            Map<String, Object> document, String actionId, String pageId) {
        List<Map<String, Object>> pages = new ArrayList<>();
        if (document.get("page") instanceof Map<?, ?> page) {
            pages.add((Map<String, Object>) page);
        }
        if (document.get("app") instanceof Map<?, ?> app
                && ((Map<String, Object>) app).get("pages") instanceof List<?> list) {
            for (Object page : list) {
                if (page instanceof Map<?, ?> one) {
                    pages.add((Map<String, Object>) one);
                }
            }
        }
        List<Map<String, Object>> found = new ArrayList<>();
        for (Map<String, Object> page : pages) {
            if (pageId != null && !pageId.equals(page.get("id"))) {
                continue;
            }
            if (!(page.get("actions") instanceof List<?> actions)) {
                continue;
            }
            for (Object raw : actions) {
                if (raw instanceof Map<?, ?> action && actionId.equals(action.get("id"))) {
                    found.add((Map<String, Object>) action);
                }
            }
        }
        return found;
    }
}

package io.hatake.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 画面1枚を1行で言ったもの（「受注照会（order_search）… 照会（読み取り専用）。条件 5、列 5」）。
 *
 * <p>全文の説明はレビューには要るが、画面の一覧には重い。一覧は1画面1行でないと読まれない。
 * 言い方は TypeScript 版の {@code hatake explain --brief} と同じ（同じ画面が2つの呼び方を
 * 持つと、現場と実装で話が合わなくなる）。
 *
 * <p><b>バックエンド版はボタン（actions）を持たない</b>ので、要約にも「ボタン n」は出ない。
 * この版が定義を読むのは検証とクエリのためで、画面の操作は持たないという方針のまま。
 *
 * @param id ページ id
 * @param title 画面名
 * @param kind {@code page.type}
 * @param what 種別の見出し語
 * @param parts 規模の内訳（「条件 5」「列 5」）
 * @param counts 同じ数字（並べ替え・表を作る用）
 * @param line そのまま貼れる1行
 */
public record ScreenBrief(
        String id,
        String title,
        String kind,
        String what,
        List<String> parts,
        Map<String, Integer> counts,
        String line) {

    /** {@code page} を1行にする。 */
    public static ScreenBrief of(PageDefinition page) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        List<String> parts = new ArrayList<>();

        if (page.search() != null && !page.search().filters().isEmpty()) {
            int filters = page.search().filters().size();
            counts.put("filters", filters);
            parts.add("条件 " + filters);
        }
        if (page.table() != null && !page.table().columns().isEmpty()) {
            int columns = page.table().columns().size();
            counts.put("columns", columns);
            parts.add("列 " + columns);
        }
        // ステップ入力は form に「全ステップを畳んだもの」が入っているので、steps があれば
        // そちらだけを数える（両方数えると項目が2倍になる）。
        if (!page.steps().isEmpty()) {
            counts.put("steps", page.steps().size());
            List<FieldDefinition> fields = new ArrayList<>();
            for (WizardStepDefinition step : page.steps()) {
                fields.addAll(step.fields());
            }
            counts.put("fields", fields.size());
            countControlled(counts, fields);
            parts.add("ステップ " + page.steps().size() + "（項目 " + fields.size() + "）");
        } else if (page.form() != null && !page.form().sections().isEmpty()) {
            List<FieldDefinition> fields = fieldsOf(page.form());
            int sections = page.form().sections().size();
            long required = fields.stream().filter(FieldDefinition::required).count();
            counts.put("sections", sections);
            counts.put("fields", fields.size());
            if (required > 0) {
                counts.put("required", (int) required);
            }
            countControlled(counts, fields);
            parts.add((sections > 1 ? sections + " 枠に" : "") + "項目 " + fields.size()
                    + (required > 0 ? "（必須 " + required + "）" : ""));
        }
        if (!page.items().isEmpty()) {
            counts.put("cards", page.items().size());
            parts.add("カード " + page.items().size());
        }
        if (counts.containsKey("controlled")) {
            parts.add("条件で出し分け " + counts.get("controlled") + " 項目");
        }
        if (hasRoles(page)) {
            parts.add("権限で出し分けあり");
        }
        if (page.repository() != null) {
            parts.add(page.repository() + " から");
        }

        String what = PageKindWords.shortOf(page.type());
        String line = page.title() + "（" + page.id() + "）… " + what
                + (parts.isEmpty() ? "" : "。" + String.join("、", parts));
        return new ScreenBrief(
                page.id(),
                page.title(),
                page.type(),
                what,
                List.copyOf(parts),
                Map.copyOf(counts),
                line);
    }

    /** 全区画の項目（書いてある順）。 */
    static List<FieldDefinition> fieldsOf(FormDefinition form) {
        List<FieldDefinition> fields = new ArrayList<>();
        if (form == null) {
            return fields;
        }
        for (SectionDefinition section : form.sections()) {
            fields.addAll(section.fields());
        }
        return fields;
    }

    /** 条件で出し分ける項目の数。読む前に知りたい合図なので1行にも出す。 */
    private static void countControlled(
            Map<String, Integer> counts, List<FieldDefinition> fields) {
        long controlled = fields.stream().filter(ScreenBrief::isControlled).count();
        if (controlled > 0) {
            counts.put("controlled", (int) controlled);
        }
    }

    private static boolean isControlled(FieldDefinition field) {
        return field.visibleWhen() != null
                || field.enabledWhen() != null
                || field.readOnlyWhen() != null
                || field.requiredWhen() != null;
    }

    /** 権限で出し分けている所があるか（見せすぎの確認で最初に見る所）。 */
    private static boolean hasRoles(PageDefinition page) {
        for (FieldDefinition field : fieldsOf(page.form())) {
            if (!field.roles().isEmpty()) {
                return true;
            }
        }
        for (WizardStepDefinition step : page.steps()) {
            for (FieldDefinition field : step.fields()) {
                if (!field.roles().isEmpty()) {
                    return true;
                }
            }
        }
        for (DashboardItemDefinition item : page.items()) {
            if (!item.roles().isEmpty()) {
                return true;
            }
        }
        return false;
    }
}

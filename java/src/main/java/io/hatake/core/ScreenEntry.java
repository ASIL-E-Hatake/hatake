package io.hatake.core;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 索引の1行（画面1枚）。
 *
 * @param file どこにある定義か（パス・資源名。コードで組んだ画面なら空）
 * @param id ページ id
 * @param title 画面名
 * @param kind {@code page.type}
 * @param what 種別の見出し語
 * @param repository Repository キー（無ければ null）
 * @param counts 規模の内訳
 * @param brief 1行の要約
 * @param words 探すための語
 */
public record ScreenEntry(
        String file,
        String id,
        String title,
        String kind,
        String what,
        String repository,
        Map<String, Integer> counts,
        String brief,
        List<String> words) {

    /** 解析済みのページから1行を作る。 */
    public static ScreenEntry of(PageDefinition page, String file) {
        ScreenBrief brief = ScreenBrief.of(page);
        return new ScreenEntry(
                file == null ? "" : file,
                brief.id(),
                brief.title(),
                brief.kind(),
                brief.what(),
                page.repository(),
                brief.counts(),
                brief.line(),
                wordsOf(page, brief));
    }

    /** ファイルを問わない場合。 */
    public static ScreenEntry of(PageDefinition page) {
        return of(page, "");
    }

    /**
     * 規模。並べ替えのためだけの数で、内訳は {@link #counts()} が持つ。
     *
     * <p>{@code required} と {@code controlled} は数えない。どちらも既に数えた項目の性質なので、
     * 足すとフォームが実際の2倍の大きさに見える。
     */
    public int size() {
        int total = 0;
        for (Map.Entry<String, Integer> one : counts.entrySet()) {
            if (one.getKey().equals("required") || one.getKey().equals("controlled")) {
                continue;
            }
            total += one.getValue();
        }
        return total;
    }

    /** {@code terms} の語が全部どこかに出てくるか。 */
    public boolean matchesAll(List<String> terms) {
        StringBuilder haystack = new StringBuilder(brief);
        for (String word : words) {
            haystack.append(' ').append(word);
        }
        String all = haystack.toString().toLowerCase();
        for (String term : terms) {
            if (!all.contains(term)) {
                return false;
            }
        }
        return true;
    }

    /**
     * 探すための語。
     *
     * <p><b>画面に出ている言葉</b>（ラベル）と<b>定義の識別子</b>（id・項目名・Repository）の
     * 両方を入れる。現場は「得意先」で探し、実装側は {@code customer} で探すので、片方しか
     * 当たらない索引は使われない。
     */
    private static List<String> wordsOf(PageDefinition page, ScreenBrief brief) {
        List<String> words = new ArrayList<>();
        words.add(page.id());
        words.add(page.title());
        words.add(page.type());
        // 説明の長い言い方も入れる（`master` を「検索」で探せるように。見出し語は
        // 「マスタ保守」なので、それだけでは現場の言葉で当たらない）。
        words.add(PageKindWords.whatOf(page.type()));
        words.add(page.repository());

        if (page.search() != null) {
            for (FilterDefinition filter : page.search().filters()) {
                words.add(filter.field());
                words.add(filter.label());
            }
        }
        if (page.table() != null) {
            for (ColumnDefinition column : page.table().columns()) {
                words.add(column.field());
                words.add(column.label());
            }
        }
        for (FieldDefinition field : ScreenBrief.fieldsOf(page.form())) {
            words.add(field.field());
            words.add(field.label());
            for (FieldDefinition row : field.rowFields()) {
                words.add(row.field());
                words.add(row.label());
            }
            for (ColumnDefinition column : field.columns()) {
                words.add(column.field());
                words.add(column.label());
            }
        }
        for (WizardStepDefinition step : page.steps()) {
            words.add(step.title());
            for (FieldDefinition field : step.fields()) {
                words.add(field.field());
                words.add(field.label());
            }
        }
        for (DashboardItemDefinition item : page.items()) {
            words.add(item.id());
            words.add(item.title());
        }
        // 重複と空を落として、書いてある順を保つ（印刷したときに追える並び）。
        Set<String> unique = new LinkedHashSet<>();
        for (String word : words) {
            if (word != null && !word.isEmpty()) {
                unique.add(word);
            }
        }
        return List.copyOf(unique);
    }
}

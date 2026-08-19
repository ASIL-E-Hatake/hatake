package io.hatake.core;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * ページ種別の「人に見せる言い方」。
 *
 * <p>1つの種別に2つの言い方を持つ。{@code what} は説明の全文で使う言い方
 * （「検索して一覧に出し、その場で登録・修正・削除までできる画面」）、{@code shortWord} は
 * 1行の要約や画面の索引で使う見出し語（「検索＋一覧＋登録・修正・削除」）。文は表の1行に
 * 入らないし、見出し語は説明にならない。
 *
 * <p><b>正は {@code spec/vocabulary.json}</b>で、ここはその転記（TypeScript 版・Dart 版も
 * 同じ表を転記している）。{@code PageKindWordsTest} が1キーずつ突き合わせるので、手で写して
 * あっても言い方がズレることはない。ズレると CLI と画面で同じ画面の呼び方が変わる。
 *
 * @param what 説明で使う言い方
 * @param shortWord 見出し語（{@code short} は Java の予約語なので名前を変えている）
 */
public record PageKindWords(String what, String shortWord) {

    /** ページ種別 → 言い方（仕様の並び順）。 */
    public static final Map<String, PageKindWords> ALL = all();

    private static Map<String, PageKindWords> all() {
        Map<String, PageKindWords> words = new LinkedHashMap<>();
        words.put("crud", new PageKindWords(
                "検索して一覧に出し、その場で登録・修正・削除までできる画面",
                "検索＋一覧＋登録・修正・削除"));
        words.put("master", new PageKindWords(
                "マスタをメンテナンスする画面（検索・一覧・登録・修正・削除）",
                "マスタ保守"));
        words.put("search", new PageKindWords(
                "検索して一覧を見るだけの画面",
                "照会（読み取り専用）"));
        words.put("detail", new PageKindWords(
                "1件の内容を読むだけの画面",
                "1件の照会"));
        words.put("form", new PageKindWords(
                "1件を入力する画面（新規と編集の両方）",
                "1件の入力"));
        words.put("wizard", new PageKindWords(
                "入力をステップに分けた画面",
                "段階入力"));
        words.put("dashboard", new PageKindWords(
                "数字とグラフのカードを並べて見せる画面",
                "数字とグラフ"));
        words.put("report", new PageKindWords(
                "印刷向けの帳票",
                "帳票"));
        return Map.copyOf(words);
    }

    /** 組み込みのページ種別（{@code page.type} に書ける値）。 */
    public static final List<String> KINDS =
            List.of("crud", "search", "master", "detail", "form", "wizard", "dashboard", "report");

    /** {@code kind} の見出し語。プラグインが足した種別は、その種別名そのもの。 */
    public static String shortOf(String kind) {
        PageKindWords words = ALL.get(kind);
        return words == null ? kind : words.shortWord();
    }

    /**
     * {@code kind} の説明の言い方。知らない種別では空。
     *
     * <p>知らない種別に文を作らないのは、作れば嘘になるため（プラグインの種別が何をする画面
     * かは、この版は知らない）。
     */
    public static String whatOf(String kind) {
        PageKindWords words = ALL.get(kind);
        return words == null ? "" : words.what();
    }
}

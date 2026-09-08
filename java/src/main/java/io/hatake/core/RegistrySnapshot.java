package io.hatake.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * サーバが<b>実際に登録しているもの</b>を、種類ごとに申告する。
 *
 * <p>形は Dart 版の {@code registrySnapshot} と同じ（{@code hatake-registry.json}）。
 * そのまま書き出せば {@code hatake registry --compare 画面の一覧 サーバの一覧} に渡せる
 * ＝<b>利用者が足したもの</b>が画面とサーバで同じかを機械が言える。組み込みが3版で
 * 同じ答えを出すことは収束テストで縛ってあるが、足したものは縛られていない。
 *
 * <p>出すのは<b>足したものだけ</b>（組み込みは突き合わせる側が知っている）。空の種類は
 * 出さない。名前は種類ごとに名前順。
 *
 * <p>出す種類は<b>答えに関わるものだけ</b>。Repository・プラグイン（押したときの処理）・
 * 項目の型・カードの型・出す口・役割は、サーバに在っても意味が無い（画面の側の話）ので
 * 種類そのものを持たない＝空で出すと、突き合わせた側が「画面にしか無い」と言い出す。
 */
public final class RegistrySnapshot {

    private RegistrySnapshot() {
    }

    /** 申告する種類（{@code spec/conformance/registry_snapshot.json} の serverKinds）。 */
    public static final List<String> KINDS =
            List.of("validators", "converters", "computedOps", "aggregates", "formatters");

    /**
     * いま持っている登録を申告する。渡さなかったものは「その種類は言うことが無い」
     * （空で出すと「足していない」と読まれるので、null は種類そのものを落とす）。
     */
    public static Map<String, List<String>> of(
            ValidatorRegistry validators,
            ConverterRegistry converters,
            Computed computeds,
            Aggregates aggregates,
            FormatterRegistry formatters) {
        Map<String, List<String>> all = new LinkedHashMap<>();
        all.put("validators", validators == null ? List.of() : validators.customKeys());
        all.put("converters", converters == null ? List.of() : converters.customKeys());
        all.put("computedOps", computeds == null ? List.of() : computeds.customKeys());
        all.put("aggregates", aggregates == null ? List.of() : aggregates.customKeys());
        all.put("formatters", formatters == null ? List.of() : formatters.customKeys());

        Map<String, List<String>> out = new LinkedHashMap<>();
        for (Map.Entry<String, List<String>> entry : all.entrySet()) {
            if (!entry.getValue().isEmpty()) {
                out.put(entry.getKey(), entry.getValue());
            }
        }
        return out;
    }

    /**
     * {@link #of} を {@code hatake-registry.json} としてそのまま書ける文字列にする。
     *
     * <p>依存を増やさないために、JSON は自分で書く（一覧は「文字列の配列」だけなので、
     * 書ける形が閉じている）。
     */
    public static String toJson(Map<String, List<String>> snapshot) {
        List<String> lines = new ArrayList<>();
        lines.add("  \"$comment\": \"動いているサーバが申告した「登録済みのもの」の一覧"
                + "（RegistrySnapshot）。hatake registry --compare にそのまま渡せる。\"");
        for (Map.Entry<String, List<String>> entry : snapshot.entrySet()) {
            List<String> names = new ArrayList<>();
            for (String name : entry.getValue()) {
                names.add("\n    " + quote(name));
            }
            lines.add("  " + quote(entry.getKey()) + ": ["
                    + String.join(",", names) + (names.isEmpty() ? "]" : "\n  ]"));
        }
        return "{\n" + String.join(",\n", lines) + "\n}\n";
    }

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }
}

package io.hatake.core;

import java.util.List;
import java.util.Map;

/**
 * <b>値を1つの文字にする、唯一の場所</b>（Dart の {@code cell_text.dart} と同じもの）。
 *
 * <p>これが3版に揃っていなかったのが、そもそもの問題でした。0.9.2 で入れた
 * 「コードではなく選択肢の名前を出す」は <b>Dart にしか入っておらず</b>、TS と Java の
 * CSV は {@code shipped} のまま落ちていました。CSV は「3版で同じ文字列になること」を
 * conformance で約束しているので、片側だけ直すと約束が静かに破れます。
 *
 * <p>見せ方の順番は Dart と1文字も変えないこと:
 *
 * <ol>
 *   <li>{@code format} が書いてあれば、それに従う（人が明示したものが最優先）
 *   <li>選択肢に在る値なら、その<b>名前</b>（{@code shipped} → 出荷済）
 *   <li>どちらでもなければ、値をそのまま
 * </ol>
 */
public final class CellText {

    private CellText() {}

    /**
     * 選択肢を持つもの（入力項目・検索条件）のうち、名前を引くのに要る所だけ。
     *
     * @param field 値を持つキー
     * @param options 定義に書いた選択肢
     */
    public record Owner(String field, List<OptionItem> options) {
        public Owner {
            options = options == null ? List.of() : List.copyOf(options);
        }
    }

    /**
     * {@code field} の {@code value} を、渡された選択肢のラベルにする。
     *
     * <p>引けなければ null（呼ぶ側が値をそのまま出す）。型をまたいで比べる
     * （YAML の {@code 10} と REST の {@code "10"} が同じものを指すことがある）。
     */
    public static String optionLabelIn(List<Owner> owners, String field, Object value) {
        if (value == null) {
            return null;
        }
        for (Owner owner : owners) {
            if (!owner.field().equals(field)) {
                continue;
            }
            for (OptionItem option : owner.options()) {
                Object candidate = option.value();
                if (value.equals(candidate)
                        || String.valueOf(candidate).equals(String.valueOf(value))) {
                    return option.label();
                }
            }
        }
        return null;
    }

    /** 見せ方も選択肢も無いときの、素の文字。並びと入れ子は空にする。 */
    public static String textOf(Object value) {
        if (value == null) {
            return "";
        }
        if (value instanceof Iterable<?> || value instanceof Map<?, ?>) {
            return "";
        }
        return value.toString();
    }

    /** 列の {@code value} を、画面に出す1つの文字にする。 */
    public static String cellText(
            FormatterRegistry formatters,
            List<Owner> owners,
            ColumnDefinition column,
            Object value) {
        if (column.format() != null) {
            return formatters.format(column.format(), value, column.config());
        }
        String label = optionLabelIn(owners, column.field(), value);
        return label != null ? label : textOf(value);
    }
}

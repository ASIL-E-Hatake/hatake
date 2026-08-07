package io.hatake.core;

/**
 * 小計・総計に出す1つの数字。集約の語彙は {@link Aggregates} と共通なので、
 * 帳票の {@code sum} とダッシュボードの {@code sum} は同じ意味になる。
 *
 * <p>同じ {@code field} を2つ宣言してもよい（例: 金額の {@code sum} と {@code count}）。
 * だから小計の値は項目名ではなく<b>宣言順の位置</b>で対応させる。
 *
 * @param field 集約する項目名
 * @param aggregate 集約オペレーション名（既定 {@code sum}）
 */
public record ReportTotal(String field, String aggregate) {
}

package io.hatake.core;

/**
 * ダッシュボードの {@code metric} カードが、取得した行を1つの数値に畳む方法。
 *
 * <p>集約自体は {@link Aggregates}。Framework は「集計クエリ」を投げない
 * ＝ Repository が行を返し、その行に対する畳み込みだけをここが決める。
 *
 * @param aggregate 集約オペレーション名（{@link Aggregates} の組込み or プラグイン）
 * @param field 畳む項目名。{@code count} では不要、それ以外は必須（無ければ null 結果）
 */
public record DashboardValueDefinition(String aggregate, String field) {
}

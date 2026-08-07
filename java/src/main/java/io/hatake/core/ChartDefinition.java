package io.hatake.core;

/**
 * ダッシュボードの {@code chart} カードが、取得した行を点の列にする方法。
 *
 * <p>{@code aggregate} があるとラベルが同じ行を1点に畳む（{@link Aggregates#aggregateBy}）。
 * 無ければ1行＝1点で、集計済みのエンドポイントをそのまま描くときの形。
 *
 * @param kind チャート種別（{@code bar} / {@code line} / {@code pie} or プラグイン）
 * @param labelField 各点のラベルを持つ項目名
 * @param valueField 各点の値を持つ項目名（{@code count} では不要）
 * @param aggregate ラベル別に適用する集約。null なら行をそのまま点にする
 */
public record ChartDefinition(
        String kind,
        String labelField,
        String valueField,
        String aggregate) {
}

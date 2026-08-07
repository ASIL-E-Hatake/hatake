package io.hatake.core;

import java.util.List;
import java.util.Map;

/**
 * ダッシュボードの1カード。<b>小さな読み取りクエリ + 見せ方</b>で、ページ全体では
 * それをグリッドに並べたものになる。
 *
 * <p>バックエンドから見た関心は「どの Repository を、どの絞り込み・並び・件数で引くか」
 * と「返した行をどう畳むか」。描画（span / height 等）はフロントの関心なので、この版は
 * 幅寄せの値を持たない（他のモデルと同じ方針）。
 *
 * @param id カード識別子
 * @param type カード種別（{@code metric} / {@code table} / {@code chart} or プラグイン）
 * @param title カード見出し
 * @param repository Repository キー。null ならページの既定を使う
 * @param filters クエリに常に混ぜる固定の絞り込み
 * @param limit 取得件数（クエリの pageSize）
 * @param sortField 並び替え項目。null なら Repository の既定順
 * @param sortAscending 昇順か
 * @param value {@code metric} の畳み込み。null なら {@code count}
 * @param format {@code metric} の表示フォーマッタ名
 * @param columns {@code table} の列
 * @param chart {@code chart} のプロット
 * @param roles 表示を許可するロール（空＝全員）
 */
public record DashboardItemDefinition(
        String id,
        String type,
        String title,
        String repository,
        Map<String, Object> filters,
        int limit,
        String sortField,
        boolean sortAscending,
        DashboardValueDefinition value,
        String format,
        List<ColumnDefinition> columns,
        ChartDefinition chart,
        List<String> roles) {

    /** カード種別: 集約された1つの数値。 */
    public static final String METRIC = "metric";

    /** カード種別: 数行の一覧。 */
    public static final String TABLE = "table";

    /** カード種別: チャート。 */
    public static final String CHART = "chart";
}

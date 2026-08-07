package io.hatake.core;

import java.util.List;

/**
 * 帳票（{@code type: report}）の「紙の構造」。明細の列はページの {@code table} から
 * 取るので、一覧と帳票で列がずれない。
 *
 * @param paperSize 用紙サイズ（{@code A4} など。既定 {@code A4}）
 * @param orientation 用紙の向き（{@code portrait} / {@code landscape}）
 * @param rowsPerPage 1枚に載る行数。<b>グループ見出し・小計も1行として数える</b>
 *     （これでページ割りが言語をまたいで一致する）
 * @param groups コントロールブレイク（外側から順。DSL キーは {@code groupBy}）
 * @param totals 小計・総計に出す数字（宣言順）
 * @param limit 1回の出力で読む行数（帳票は「印刷するもの」なのでページングしない）
 * @param sortField 印字順（DSL キーは {@code sort}）。グループはコントロールブレイクなので
 *     並び順が出力に効く。列見出しを押せない帳票では、ここが唯一の指定場所
 * @param sortAscending 昇順か
 */
public record ReportDefinition(
        String paperSize,
        String orientation,
        int rowsPerPage,
        List<ReportGroup> groups,
        List<ReportTotal> totals,
        int limit,
        String sortField,
        boolean sortAscending) {

    public static final String PORTRAIT = "portrait";
    public static final String LANDSCAPE = "landscape";

    /** 既定の帳票（A4 縦・40行・グループ無し）。 */
    public static final ReportDefinition DEFAULT = new ReportDefinition(
            "A4", PORTRAIT, 40, List.of(), List.of(), 1000, null, true);

    public boolean isLandscape() {
        return LANDSCAPE.equals(orientation);
    }
}

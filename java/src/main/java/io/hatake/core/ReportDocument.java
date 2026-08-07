package io.hatake.core;

import java.util.List;
import java.util.Map;

/**
 * 帳票の中立な出力形（Renderer が描く前の「紙の中身」）。
 * {@code QuerySpec} / {@code DtoSpec} と同じ立ち位置で、ここから先
 * （画面に描く / PDF にする / 印刷する）は Framework の外。
 *
 * @param sheets 用紙（1枚目から順）
 */
public record ReportDocument(List<Sheet> sheets) {

    public static final ReportDocument EMPTY = new ReportDocument(List.of());

    public int totalPages() {
        return sheets.size();
    }

    /** 帳票の1行が何であるか。開いた文字列。 */
    public static final class Kinds {
        public static final String GROUP_HEADER = "groupHeader";
        public static final String DETAIL = "detail";
        public static final String SUBTOTAL = "subtotal";
        public static final String GRAND_TOTAL = "grandTotal";

        private Kinds() {
        }
    }

    /**
     * 帳票の1行。
     *
     * @param kind {@link Kinds} のいずれか
     * @param level グループの深さ（0 が最も外側）。明細と総計は -1
     * @param label グループ見出しのラベル（それ以外は空）
     * @param value グループ見出しの値（それ以外は null）
     * @param row 明細のレコード（それ以外は空）
     * @param totals 小計・総計の値。{@code report.totals} と<b>同じ順序</b>
     */
    public record Block(
            String kind,
            int level,
            String label,
            Object value,
            Map<String, Object> row,
            List<Double> totals) {

        public static Block groupHeader(int level, String label, Object value) {
            return new Block(Kinds.GROUP_HEADER, level, label, value, Map.of(), List.of());
        }

        public static Block detail(Map<String, Object> row) {
            return new Block(Kinds.DETAIL, -1, "", null, row, List.of());
        }

        public static Block subtotal(int level, List<Double> totals) {
            return new Block(Kinds.SUBTOTAL, level, "", null, Map.of(), totals);
        }

        public static Block grandTotal(List<Double> totals) {
            return new Block(Kinds.GRAND_TOTAL, -1, "", null, Map.of(), totals);
        }
    }

    /**
     * 1枚の用紙。
     *
     * @param number 1始まりのページ番号
     * @param blocks その紙に載る行
     */
    public record Sheet(int number, List<Block> blocks) {
    }
}

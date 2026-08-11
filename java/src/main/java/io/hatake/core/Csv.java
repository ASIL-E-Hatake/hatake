package io.hatake.core;

import java.util.List;
import java.util.Map;

/**
 * 一覧・帳票の CSV 出力。列 + 行 → 文字列。Dart / TypeScript 版と同結果。
 *
 * <p>既定では列の {@code format} を通した表記で書く（画面と同じ見た目）。Excel で
 * 計算させたいときは {@code raw}。文字コード変換（Shift_JIS 等）は Framework の
 * 外＝出力先の責務。
 */
public final class Csv {

    private Csv() {
    }

    /**
     * CSV の書き方。既定は Excel（日本語 Windows）で開くのが楽な組み合わせ。
     *
     * @param header 見出し行（列ラベル）を出すか
     * @param delimiter 区切り文字
     * @param newline 改行（{@code crlf} / {@code lf}）
     * @param bom 先頭に BOM を付けるか（Excel の文字化け対策。UTF-8 のときだけ効く）
     * @param raw {@code format} を通さず生の値を書くか
     * @param charset 出力先に渡す文字コードの名前（既定 {@code utf-8}）。
     *     <b>変換はここではしない</b>＝文字列を作るまでが Framework の仕事で、
     *     バイト列にするのは出力先の責務
     */
    public record Options(
            boolean header,
            String delimiter,
            String newline,
            boolean bom,
            boolean raw,
            String charset) {

        /** 既定の文字コード名。 */
        public static final String UTF8 = "utf-8";

        public static final Options DEFAULT =
                new Options(true, ",", "crlf", false, false, UTF8);

        /** DSL の {@code config}（{@code export} アクション）から読む。 */
        public static Options fromConfig(Map<String, Object> config) {
            if (config == null) {
                return DEFAULT;
            }
            return new Options(
                    !(config.get("header") instanceof Boolean h) || h,
                    config.get("delimiter") == null ? "," : config.get("delimiter").toString(),
                    config.get("newline") == null ? "crlf" : config.get("newline").toString(),
                    Boolean.TRUE.equals(config.get("bom")),
                    Boolean.TRUE.equals(config.get("raw")),
                    config.get("charset") == null ? UTF8 : config.get("charset").toString());
        }

        public String lineBreak() {
            return "lf".equals(newline) ? "\n" : "\r\n";
        }

        /** UTF-8 か（表記ゆれを吸収する）。 */
        public boolean isUtf8() {
            String lower = charset.toLowerCase(java.util.Locale.ROOT);
            return lower.equals("utf-8") || lower.equals("utf8") || lower.equals("utf_8");
        }

        /**
         * 実際に BOM を付けるか。宣言されていて、かつ UTF-8 のときだけ
         * （Shift_JIS などに BOM は無く、付けると先頭のセルにゴミが3バイト入る）。
         */
        public boolean wantsBom() {
            return bom && isUtf8();
        }
    }

    public static String toCsv(
            List<ColumnDefinition> columns, List<Map<String, Object>> rows) {
        return toCsv(columns, rows, Options.DEFAULT, new FormatterRegistry());
    }

    /**
     * {@code rows} を {@code columns} の順に CSV へ書き出す。列が無ければ空文字。
     * 区切り・引用符・改行を含む値は引用し、引用符は2つに重ねる（RFC 4180）。
     */
    public static String toCsv(
            List<ColumnDefinition> columns,
            List<Map<String, Object>> rows,
            Options options,
            FormatterRegistry formatters) {
        if (columns.isEmpty()) {
            return "";
        }
        StringBuilder out = new StringBuilder();
        if (options.wantsBom()) {
            out.append('\uFEFF');
        }
        if (options.header()) {
            for (int i = 0; i < columns.size(); i++) {
                if (i > 0) {
                    out.append(options.delimiter());
                }
                out.append(escape(columns.get(i).label(), options.delimiter()));
            }
            out.append(options.lineBreak());
        }
        for (Map<String, Object> row : rows) {
            for (int i = 0; i < columns.size(); i++) {
                if (i > 0) {
                    out.append(options.delimiter());
                }
                ColumnDefinition column = columns.get(i);
                out.append(escape(
                        cell(column, row.get(column.field()), options, formatters),
                        options.delimiter()));
            }
            out.append(options.lineBreak());
        }
        return out.toString();
    }

    private static String cell(
            ColumnDefinition column,
            Object value,
            Options options,
            FormatterRegistry formatters) {
        if (!options.raw() && column.format() != null) {
            return formatters.format(column.format(), value, column.config());
        }
        return value == null ? "" : value.toString();
    }

    /** 引用が要るのは区切り・引用符・改行を含むときだけ。 */
    private static String escape(String value, String delimiter) {
        boolean needsQuotes = value.contains(delimiter)
                || value.contains("\"")
                || value.contains("\n")
                || value.contains("\r");
        return needsQuotes ? '"' + value.replace("\"", "\"\"") + '"' : value;
    }
}

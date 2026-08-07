package io.hatake.core;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 行 + {@link ReportDefinition} → {@link ReportDocument}。
 *
 * <p>やっていることは昔からある帳票そのもの: <b>コントロールブレイク</b>（並び順に
 * 見て、キーが変わったら小計を出して見出しを出す）＋ 行数でページを割る。
 * 並べ替えはしない（Repository の責務。言語をまたいでソート差を出さないため）。
 *
 * <p>Dart / TypeScript 版と同じ出力になること（conformance）。
 */
public final class ReportBuilder {

    private ReportBuilder() {
    }

    public static ReportDocument build(
            ReportDefinition report, List<Map<String, Object>> rows) {
        return build(report, rows, new Aggregates());
    }

    public static ReportDocument build(
            ReportDefinition report,
            List<Map<String, Object>> rows,
            Aggregates aggregates) {
        if (rows.isEmpty()) {
            return ReportDocument.EMPTY;
        }
        int levels = report.groups().size();
        List<ReportDocument.Block> blocks = new ArrayList<>();
        // ページを強制的に変える位置（blocks の index）。
        Set<Integer> forcedBreaks = new HashSet<>();
        Object[] openKeys = new Object[levels];
        List<List<Map<String, Object>>> openRows = new ArrayList<>();
        for (int i = 0; i < levels; i++) {
            openRows.add(new ArrayList<>());
        }
        boolean started = false;

        for (Map<String, Object> row : rows) {
            int breakAt = started ? levels : 0;
            if (started) {
                for (int level = 0; level < levels; level++) {
                    if (!Objects.equals(row.get(report.groups().get(level).field()),
                            openKeys[level])) {
                        breakAt = level;
                        break;
                    }
                }
            }

            if (breakAt < levels) {
                // 閉じる階層の小計は深い方から。
                if (started && !report.totals().isEmpty()) {
                    for (int level = levels - 1; level >= breakAt; level--) {
                        blocks.add(ReportDocument.Block.subtotal(
                                level, totalsOf(report, openRows.get(level), aggregates)));
                    }
                }
                // 改ページ指定のあるグループが変わったら、そこから次の紙へ。
                boolean forced = false;
                if (started) {
                    for (int level = breakAt; level < levels; level++) {
                        if (report.groups().get(level).pageBreak()) {
                            forced = true;
                            break;
                        }
                    }
                }
                if (forced) {
                    forcedBreaks.add(blocks.size());
                }
                // 開く階層の見出しは外側から。
                for (int level = breakAt; level < levels; level++) {
                    ReportGroup group = report.groups().get(level);
                    openKeys[level] = row.get(group.field());
                    openRows.set(level, new ArrayList<>());
                    blocks.add(ReportDocument.Block.groupHeader(
                            level, group.label(), openKeys[level]));
                }
                started = true;
            }

            for (List<Map<String, Object>> group : openRows) {
                group.add(row);
            }
            blocks.add(ReportDocument.Block.detail(row));
        }

        // 最後に開いていた階層を閉じ、総計を出す。
        if (!report.totals().isEmpty()) {
            for (int level = levels - 1; level >= 0; level--) {
                blocks.add(ReportDocument.Block.subtotal(
                        level, totalsOf(report, openRows.get(level), aggregates)));
            }
            blocks.add(ReportDocument.Block.grandTotal(
                    totalsOf(report, rows, aggregates)));
        }

        return paginate(blocks, forcedBreaks, report.rowsPerPage());
    }

    private static List<Double> totalsOf(
            ReportDefinition report,
            List<Map<String, Object>> group,
            Aggregates aggregates) {
        List<Double> values = new ArrayList<>();
        for (ReportTotal total : report.totals()) {
            values.add(aggregates.aggregate(total.aggregate(), group, total.field()));
        }
        return values;
    }

    /** 1ブロック＝1行として数え、rowsPerPage ごとに紙を分ける。 */
    private static ReportDocument paginate(
            List<ReportDocument.Block> blocks,
            Set<Integer> forcedBreaks,
            int rowsPerPage) {
        int capacity = Math.max(1, rowsPerPage);
        List<ReportDocument.Sheet> sheets = new ArrayList<>();
        List<ReportDocument.Block> current = new ArrayList<>();

        for (int i = 0; i < blocks.size(); i++) {
            if ((forcedBreaks.contains(i) || current.size() >= capacity)
                    && !current.isEmpty()) {
                sheets.add(new ReportDocument.Sheet(sheets.size() + 1, List.copyOf(current)));
                current.clear();
            }
            current.add(blocks.get(i));
        }
        if (!current.isEmpty()) {
            sheets.add(new ReportDocument.Sheet(sheets.size() + 1, List.copyOf(current)));
        }
        return new ReportDocument(List.copyOf(sheets));
    }
}

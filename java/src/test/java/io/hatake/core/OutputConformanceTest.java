package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import org.yaml.snakeyaml.Yaml;

/**
 * 出力（CSV / 帳票）を共有フィクスチャで確認する。
 * {@code spec/conformance/csv.json} と {@code report.json}。
 * Dart / TypeScript 版と同じ文字列・同じページ割りになること。
 */
class OutputConformanceTest {

    @SuppressWarnings("unchecked")
    private static Map<String, Object> load(String file) throws IOException {
        String content = Files.readString(Path.of("../spec/conformance/" + file));
        return (Map<String, Object>) new Yaml().load(content);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> cases(String file) throws IOException {
        return (List<Map<String, Object>>) load(file).get("cases");
    }

    @SuppressWarnings("unchecked")
    private static ColumnDefinition column(Map<String, Object> m) {
        Map<String, Object> config = (Map<String, Object>) m.get("config");
        return new ColumnDefinition(
                (String) m.get("field"),
                (String) m.get("label"),
                m.get("type") instanceof String t ? t : "text",
                (String) m.get("format"),
                config == null ? Map.of() : config);
    }

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> csv() throws IOException {
        return cases("csv.json").stream().map(c -> DynamicTest.dynamicTest(
                String.valueOf(c.get("name")),
                () -> {
                    List<ColumnDefinition> columns = new ArrayList<>();
                    for (Object o : (List<Object>) c.get("columns")) {
                        columns.add(column((Map<String, Object>) o));
                    }
                    Csv.Options options = Csv.Options.fromConfig(
                            (Map<String, Object>) c.get("options"));
                    assertEquals(
                            c.get("expected"),
                            Csv.toCsv(
                                    columns,
                                    (List<Map<String, Object>>) c.get("rows"),
                                    options,
                                    new FormatterRegistry()));
                }));
    }

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> report() throws IOException {
        return cases("report.json").stream().map(c -> DynamicTest.dynamicTest(
                String.valueOf(c.get("name")),
                () -> {
                    PageDefinition page =
                            DefinitionParser.parsePageMap((Map<String, Object>) c.get("page"));
                    ReportDocument document = ReportBuilder.build(
                            page.report(), (List<Map<String, Object>>) c.get("rows"));

                    List<List<String>> actual = new ArrayList<>();
                    for (ReportDocument.Sheet sheet : document.sheets()) {
                        List<String> lines = new ArrayList<>();
                        for (ReportDocument.Block block : sheet.blocks()) {
                            lines.add(encode(block, page));
                        }
                        actual.add(lines);
                    }
                    assertEquals(c.get("expected"), actual);
                }));
    }

    /** {@code G<level>:<label>=<value>} / {@code D:…} / {@code S<level>:…} / {@code T:…} */
    private static String encode(ReportDocument.Block block, PageDefinition page) {
        switch (block.kind()) {
            case ReportDocument.Kinds.GROUP_HEADER:
                return "G" + block.level() + ":" + block.label() + "=" + block.value();
            case ReportDocument.Kinds.DETAIL: {
                List<String> cells = new ArrayList<>();
                for (ColumnDefinition column : page.table().columns()) {
                    cells.add(column.field() + "=" + block.row().get(column.field()));
                }
                return "D:" + String.join("|", cells);
            }
            case ReportDocument.Kinds.SUBTOTAL:
                return "S" + block.level() + ":" + totals(block, page);
            case ReportDocument.Kinds.GRAND_TOTAL:
                return "T:" + totals(block, page);
            default:
                return block.kind();
        }
    }

    /** 小計は宣言順の位置で対応させる（同じ項目を2回宣言できるため）。 */
    private static String totals(ReportDocument.Block block, PageDefinition page) {
        List<String> parts = new ArrayList<>();
        List<ReportTotal> declared = page.report().totals();
        for (int i = 0; i < declared.size(); i++) {
            parts.add(declared.get(i).field() + "=" + num(block.totals().get(i)));
        }
        return String.join(",", parts);
    }

    /** 整数値は小数点なしに揃える（{@code 300} と {@code 300.0} を吸収）。 */
    private static String num(Double value) {
        if (value == null) {
            return "null";
        }
        return value == Math.rint(value)
                ? String.valueOf((long) (double) value)
                : String.valueOf((double) value);
    }
}

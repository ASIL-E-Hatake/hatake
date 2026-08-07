package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** 帳票ページ（{@code type: report}）のパース。 */
class ReportParseTest {

    private static final String YAML = """
            dsl_version: "1.0"
            page:
              type: report
              id: sales_report
              title: 売上明細表
              repository: orderRepository
              search:
                filters:
                  - { field: orderDate, label: 受注日, type: date, operator: between }
              table:
                columns:
                  - { field: orderNo, label: 受注番号 }
                  - { field: amount, label: 金額, type: number, format: currency, config: { symbol: "¥" } }
              report:
                paper: { size: A4, orientation: landscape }
                rowsPerPage: 25
                limit: 500
                sort: { field: customer, ascending: false }
                groupBy:
                  - { field: customer, label: 顧客, pageBreak: true }
                totals:
                  - { field: amount, aggregate: sum }
                  - { field: amount, aggregate: count }
            """;

    @Test
    void parsesConditionsColumnsAndPrintingStructure() {
        PageDefinition page = DefinitionParser.parsePageYaml(YAML);

        assertTrue(page.isReport());
        assertEquals("between", page.search().filters().get(0).operator());
        assertEquals(2, page.table().columns().size());
        // フォーマッタのオプションは列の config から運ぶ（CSV / 帳票で使う）。
        assertEquals(Map.of("symbol", "¥"), page.table().columns().get(1).config());

        ReportDefinition report = page.report();
        assertEquals("A4", report.paperSize());
        assertTrue(report.isLandscape());
        assertEquals(25, report.rowsPerPage());
        assertEquals(500, report.limit());
        // 帳票は列見出しを押せないので、並び順は定義が持つ。
        assertEquals("customer", report.sortField());
        assertFalse(report.sortAscending());
        assertEquals(List.of(new ReportGroup("customer", "顧客", true)), report.groups());
        assertEquals(
                List.of(new ReportTotal("amount", "sum"), new ReportTotal("amount", "count")),
                report.totals());
    }

    @Test
    void plainReportFallsBackToA4PortraitAnd40Lines() {
        PageDefinition page = DefinitionParser.parsePageYaml("""
                page:
                  type: report
                  id: order_list
                  title: 受注一覧表
                  repository: orderRepository
                """);

        assertEquals(ReportDefinition.DEFAULT, page.report());
        assertFalse(page.report().isLandscape());
        assertEquals(40, page.report().rowsPerPage());
    }

    @Test
    void otherPageKindsHaveNoReport() {
        PageDefinition page = DefinitionParser.parsePageYaml("""
                page:
                  type: search
                  id: order_search
                  title: 受注照会
                  repository: orderRepository
                """);

        assertFalse(page.isReport());
        assertNull(page.report());
    }

    @Test
    void aTotalDefaultsToSum() {
        PageDefinition page = DefinitionParser.parsePageYaml("""
                page:
                  type: report
                  id: r
                  title: R
                  repository: orderRepository
                  report:
                    totals: [ { field: amount } ]
                """);

        assertEquals("sum", page.report().totals().get(0).aggregate());
    }

    @Test
    void rejectsAGroupWithoutALabel() {
        assertThrows(IllegalArgumentException.class, () -> DefinitionParser.parsePageYaml("""
                page:
                  type: report
                  id: r
                  title: R
                  repository: orderRepository
                  report:
                    groupBy: [ { field: customer } ]
                """));
    }
}

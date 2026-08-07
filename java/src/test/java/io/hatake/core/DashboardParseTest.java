package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import org.junit.jupiter.api.Test;

/** ダッシュボードページ（{@code type: dashboard}）のパース。 */
class DashboardParseTest {

    private static final String YAML = """
            dsl_version: "1.0"
            page:
              type: dashboard
              id: sales_dashboard
              title: 売上ダッシュボード
              repository: orderRepository
              layout: { columns: 4 }
              search:
                filters:
                  - { field: orderDate, label: 受注日, type: date, operator: between }
              items:
                - id: total
                  title: 受注金額
                  span: 2
                  value: { aggregate: sum, field: amount }
                  format: currency
                  filters: { status: 未出荷 }
                  limit: 500
                - id: recent
                  type: table
                  title: 直近の受注
                  sort: { field: orderDate, ascending: false }
                  limit: 5
                  columns:
                    - { field: orderNo, label: 受注番号 }
                - id: byStatus
                  type: chart
                  title: 状態別
                  repository: orderSummaryRepository
                  chart: { kind: pie, labelField: status, valueField: amount, aggregate: sum }
            """;

    @Test
    void parsesTheBoardAndItsCards() {
        PageDefinition page = DefinitionParser.parsePageYaml(YAML);

        assertTrue(page.isDashboard());
        assertFalse(page.isWizard());
        assertEquals("orderRepository", page.repository());
        assertEquals(3, page.items().size());
        assertEquals("between", page.search().filters().get(0).operator());
    }

    @Test
    void aCardDefaultsToAMetricAndKeepsItsQuerySettings() {
        DashboardItemDefinition metric =
                DefinitionParser.parsePageYaml(YAML).itemById("total");

        assertEquals(DashboardItemDefinition.METRIC, metric.type());
        assertEquals(new DashboardValueDefinition("sum", "amount"), metric.value());
        assertEquals(Map.of("status", "未出荷"), metric.filters());
        assertEquals(500, metric.limit());
        assertEquals("currency", metric.format());
        assertTrue(metric.sortAscending());
        assertNull(metric.sortField());
    }

    @Test
    void readsSortColumnsAndChartPerCard() {
        PageDefinition page = DefinitionParser.parsePageYaml(YAML);
        DashboardItemDefinition table = page.itemById("recent");
        DashboardItemDefinition chart = page.itemById("byStatus");

        assertEquals("orderDate", table.sortField());
        assertFalse(table.sortAscending());
        assertEquals("orderNo", table.columns().get(0).field());
        assertEquals(
                new ChartDefinition("pie", "status", "amount", "sum"), chart.chart());
        // Its own repository wins over the page default.
        assertEquals("orderSummaryRepository", page.repositoryOf(chart));
        assertEquals("orderRepository", page.repositoryOf(table));
    }

    @Test
    void aBoardNeedsNoPageRepositoryWhenEveryCardHasOne() {
        PageDefinition page = DefinitionParser.parsePageYaml("""
                page:
                  type: dashboard
                  id: ops
                  title: 稼働状況
                  items:
                    - { id: open, title: 未処理, repository: taskRepository }
                """);

        assertNull(page.repository());
        assertEquals("taskRepository", page.repositoryOf(page.itemById("open")));
        // 100 rows unless the card says otherwise.
        assertEquals(100, page.itemById("open").limit());
    }

    @Test
    void rejectsABoardWithNoCards() {
        assertThrows(IllegalArgumentException.class, () -> DefinitionParser.parsePageYaml("""
                page:
                  type: dashboard
                  id: empty
                  title: 空
                """));
    }
}

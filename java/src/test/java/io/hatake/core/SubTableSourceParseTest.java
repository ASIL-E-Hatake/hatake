package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/** 明細の {@code source}（子Repository方式）のパース。 */
class SubTableSourceParseTest {

    private static FieldDefinition firstField(String fieldYaml) {
        String yaml = """
                page:
                  type: form
                  id: order_entry
                  title: 受注入力
                  repository: orderRepository
                  key: orderNo
                  form:
                    sections:
                      - fields:
                """ + fieldYaml;
        return DefinitionParser.parsePageYaml(yaml).form().fields().get(0);
    }

    @Test
    void parsesSourceWithEveryKey() {
        FieldDefinition lines = firstField("""
                          - field: lines
                            label: 明細
                            type: subTable
                            source:
                              repository: orderLineRepository
                              parentKey: orderNo
                              key: lineNo
                              pageSize: 25
                """);

        assertTrue(lines.isSubTable());
        assertTrue(lines.hasSubTableSource());
        assertEquals(
                new SubTableSource("orderLineRepository", "orderNo", "lineNo", 25),
                lines.source());
    }

    @Test
    void keyAndPageSizeFallBackToIdAnd20() {
        FieldDefinition lines = firstField("""
                          - field: lines
                            label: 明細
                            type: subTable
                            source: { repository: lineRepository, parentKey: orderNo }
                """);

        assertEquals("id", lines.source().keyField());
        assertEquals(20, lines.source().pageSize());
    }

    @Test
    void noSourceMeansEmbeddedRows() {
        FieldDefinition lines = firstField("""
                          - field: lines
                            label: 明細
                            type: subTable
                            columns:
                              - { field: item, label: 品名 }
                """);

        assertNull(lines.source());
        assertFalse(lines.hasSubTableSource());
    }

    @Test
    void rejectsSourceWithoutParentKey() {
        assertThrows(IllegalArgumentException.class, () -> firstField("""
                          - field: lines
                            label: 明細
                            type: subTable
                            source: { repository: lineRepository }
                """));
    }
}

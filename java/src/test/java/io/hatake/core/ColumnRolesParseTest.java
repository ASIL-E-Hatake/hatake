package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * 列の {@code roles} を読む。
 *
 * <p>描画の話ではなく<b>誰がそのデータを見てよいか</b>なので、サーバ側の版でも読めないと
 * 困る（画面で隠しただけの列は、API を直接叩けば取れる）。
 */
class ColumnRolesParseTest {

    private static final String SOURCE = """
            dsl_version: "1.0"
            page:
              type: search
              id: employee_search
              title: 社員照会
              repository: employeeRepository
              key: employeeNo
              table:
                columns:
                  - { field: employeeNo, label: 社員番号 }
                  - { field: salary, label: 給与, type: number, roles: [hr, executive] }
            """;

    @Test
    void readsWhoMaySeeEachColumn() {
        List<ColumnDefinition> columns =
                DefinitionParser.parsePageYaml(SOURCE, true).table().columns();

        assertEquals(List.of(), columns.get(0).roles());
        assertEquals(List.of("hr", "executive"), columns.get(1).roles());

        // 判定は枠組みの Access（3版で同じ）。ここで別の判定を持たない。
        assertTrue(Access.isAllowed(columns.get(1).roles(), Set.of("hr")));
        assertFalse(Access.isAllowed(columns.get(1).roles(), Set.of("sales")));
        // 空＝全員に見える。
        assertTrue(Access.isAllowed(columns.get(0).roles(), Set.of("sales")));
    }
}

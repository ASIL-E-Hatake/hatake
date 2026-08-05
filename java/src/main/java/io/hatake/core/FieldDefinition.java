package io.hatake.core;

import java.util.List;
import java.util.Map;

/**
 * フォームの入力項目 1 件。
 *
 * <p>{@code type} が {@link #SUB_TABLE} のときは明細（親子）項目で、値は行レコードの
 * リストになる。{@code columns} は子グリッドの表示形状（DSL キー {@code columns}）、
 * {@code rowFields} は 1 行分の入力項目（DSL キー {@code fields}）。
 */
public record FieldDefinition(
        String field,
        String label,
        String type,
        boolean required,
        boolean readOnly,
        List<ValidatorDefinition> validators,
        String format,
        List<String> normalize,
        Map<String, Object> visibleWhen,
        Map<String, Object> enabledWhen,
        Map<String, Object> computed,
        List<String> roles,
        List<ColumnDefinition> columns,
        List<FieldDefinition> rowFields) {

    /** 明細（master-detail）項目の type。 */
    public static final String SUB_TABLE = "subTable";

    /** この項目が明細かどうか。 */
    public boolean isSubTable() {
        return SUB_TABLE.equals(type);
    }
}

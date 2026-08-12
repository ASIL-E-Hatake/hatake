package io.hatake.core;

import java.util.List;
import java.util.Map;

/**
 * フォームの入力項目 1 件。
 *
 * <p>{@code requiredWhen} は条件付き必須。表示に関する条件（{@code visibleWhen} /
 * {@code enabledWhen} / {@code readOnlyWhen}）と違って**サーバ側でも効く**
 * （{@link FormValidator} が同じ条件を評価する）。
 *
 * <p>{@code type} が {@link #SUB_TABLE} のときは明細（親子）項目で、値は行レコードの
 * リストになる。{@code columns} は子グリッドの表示形状（DSL キー {@code columns}）、
 * {@code rowFields} は 1 行分の入力項目（DSL キー {@code fields}）。
 * {@code source} があれば子行は親レコードではなく別 Repository にある
 * （{@link SubTableSource}）。
 */
public record FieldDefinition(
        String field,
        String label,
        String type,
        boolean required,
        Map<String, Object> requiredWhen,
        boolean readOnly,
        Map<String, Object> readOnlyWhen,
        List<ValidatorDefinition> validators,
        String format,
        List<String> normalize,
        Map<String, Object> visibleWhen,
        Map<String, Object> enabledWhen,
        Map<String, Object> computed,
        List<String> roles,
        List<ColumnDefinition> columns,
        List<FieldDefinition> rowFields,
        SubTableSource source) {

    /** 明細（master-detail）項目の type。 */
    public static final String SUB_TABLE = "subTable";

    /**
     * 明細に関係しない普通の項目を組み立てる短縮コンストラクタ。
     * 条件と明細用の枠は空で埋める。
     *
     * <p>正式コンストラクタは項目が増えるたびに全呼び出し元を壊すので、
     * 明細を使わない箇所（テスト・単純な組み立て）はこちらを使う。
     */
    public FieldDefinition(
            String field,
            String label,
            String type,
            boolean required,
            boolean readOnly,
            List<ValidatorDefinition> validators,
            String format,
            List<String> normalize) {
        this(field, label, type, required, null, readOnly, null, validators, format,
                normalize, null, null, null, List.of(), List.of(), List.of(), null);
    }

    /** この項目が明細かどうか。 */
    public boolean isSubTable() {
        return SUB_TABLE.equals(type);
    }

    /** 子行が別 Repository にある明細かどうか。 */
    public boolean hasSubTableSource() {
        return source != null;
    }
}

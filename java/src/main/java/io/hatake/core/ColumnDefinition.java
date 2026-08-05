package io.hatake.core;

/**
 * 表示グリッドの 1 列。現在は明細（{@code type: subTable}）の子グリッド形状を
 * バックエンドが読めるようにするための最小定義。DSL キーは {@code columns}。
 */
public record ColumnDefinition(
        String field,
        String label,
        String type,
        String format) {
}

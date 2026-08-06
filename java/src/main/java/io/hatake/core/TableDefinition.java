package io.hatake.core;

import java.util.List;

/**
 * 一覧テーブルの列定義。バックエンドは<b>レスポンス1行の形</b>を知るために読む
 * （{@code DtoDeriver} が {@code row} / {@code listResponse} を導出する）。
 *
 * <p>描画専用のキー（{@code width} / {@code sortable} / {@code roles}）は、この版の
 * 他のモデルと同じ方針で {@link ColumnDefinition} が持たない。
 */
public record TableDefinition(List<ColumnDefinition> columns) {

    public static final TableDefinition EMPTY = new TableDefinition(List.of());
}

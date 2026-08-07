package io.hatake.core;

import java.util.Map;

/**
 * 表示グリッドの 1 列。明細（{@code type: subTable}）の子グリッド形状、一覧の
 * レスポンス形（{@code DtoDeriver}）、そして CSV / 帳票の出力列として読む。
 *
 * <p>描画専用のキー（{@code width} / {@code sortable} / {@code roles}）は持たない。
 * {@code config} は<b>フォーマッタのオプション</b>（{@code {symbol: "¥"}} など）を
 * 運ぶために必要なので持つ。
 *
 * @param field 対象のデータキー
 * @param label 見出しラベル
 * @param type 描画型（既定 {@code text}）
 * @param format 表示フォーマッタ名
 * @param config 追加設定（フォーマッタのオプション兼用）
 */
public record ColumnDefinition(
        String field,
        String label,
        String type,
        String format,
        Map<String, Object> config) {

    /**
     * フォーマッタのオプションが要らない列用の短縮コンストラクタ。
     *
     * <p>正式コンストラクタは項目が増えるたびに全呼び出し元を壊すので、
     * それに関係ない箇所（テスト・単純な組み立て）はこちらを使う。
     */
    public ColumnDefinition(String field, String label, String type, String format) {
        this(field, label, type, format, Map.of());
    }
}

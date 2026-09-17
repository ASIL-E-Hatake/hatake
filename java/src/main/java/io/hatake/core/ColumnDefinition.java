package io.hatake.core;

import java.util.List;
import java.util.Map;

/**
 * 表示グリッドの 1 列。明細（{@code type: subTable}）の子グリッド形状、一覧の
 * レスポンス形（{@code DtoDeriver}）、そして CSV / 帳票の出力列として読む。
 *
 * <p>描画専用のキー（{@code width} / {@code sortable}）は持たない。{@code config} は
 * <b>フォーマッタのオプション</b>（{@code {symbol: "¥"}} など）を運ぶために必要なので持つ。
 *
 * <p>{@code roles} は<b>描画専用ではない</b>ので持つ。列の {@code roles} が決めるのは
 * 「誰がそのデータを見てよいか」で、画面で隠すだけなら API を直接叩けば取れる＝
 * <b>サーバでも同じ定義から同じ列を落とせないと、隠したことにならない</b>
 * （{@code hatake ask} の {@code authz-server} がまさにこれを聞く）。
 *
 * @param field 対象のデータキー
 * @param label 見出しラベル
 * @param type 描画型（既定 {@code text}）
 * @param format 表示フォーマッタ名
 * @param config 追加設定（フォーマッタのオプション兼用）
 * @param roles この列を見てよい役割（空＝全員。{@link Access} で判定する）
 */
public record ColumnDefinition(
        String field,
        String label,
        String type,
        String format,
        Map<String, Object> config,
        List<String> roles) {

    /**
     * 出し分けの無い列用の短縮コンストラクタ。
     *
     * <p>正式コンストラクタは項目が増えるたびに全呼び出し元を壊すので、
     * それに関係ない箇所（テスト・単純な組み立て）はこちらを使う。
     */
    public ColumnDefinition(
            String field, String label, String type, String format, Map<String, Object> config) {
        this(field, label, type, format, config, List.of());
    }

    /**
     * フォーマッタのオプションも出し分けも要らない列用の短縮コンストラクタ。
     */
    public ColumnDefinition(String field, String label, String type, String format) {
        this(field, label, type, format, Map.of(), List.of());
    }
}

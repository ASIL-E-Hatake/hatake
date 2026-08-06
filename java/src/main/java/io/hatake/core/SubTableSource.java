package io.hatake.core;

/**
 * 明細（{@code type: subTable}）の子行を親レコードに埋め込まず、
 * <b>別 Repository から外部キーで引く</b>ときの取得元。DSL キーは {@code source}。
 *
 * <p>サーバ側での意味はひとつ: 子行は親レコードに入っていないので、
 * {@link FormValidator} はその項目を検証対象から外す。
 *
 * @param repository 子行の Repository キー
 * @param parentKey 子行が持つ親キーの項目名
 * @param keyField 子行の主キー項目名（DSL キー {@code key}、既定 {@code id}）
 * @param pageSize 1 ページの行数（既定 20）
 */
public record SubTableSource(
        String repository,
        String parentKey,
        String keyField,
        int pageSize) {
}

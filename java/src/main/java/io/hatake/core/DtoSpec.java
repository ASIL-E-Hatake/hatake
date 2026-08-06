package io.hatake.core;

import java.util.List;
import java.util.Map;

/**
 * 画面定義から導出した <b>API のペイロード形</b>のフレームワーク非依存な記述。
 *
 * <p>{@link QuerySpec} と同じ立ち位置。ここから JSON Schema / OpenAPI / 型定義を
 * 吐くのは利用者側（emitter）の責務で、hatake 本体は依存を持たない。
 *
 * @param page 由来のページ id
 * @param shapes 名前付きの形の集まり
 */
public record DtoSpec(String page, List<Shape> shapes) {

    /**
     * ひとつの形。
     *
     * @param name 形の名前（例 {@code CustomerMasterRequest}）
     * @param role {@code request} / {@code row} / {@code listResponse} /
     *     {@code queryParams} / {@code pathParams} / {@code child}
     * @param members 構成メンバ
     */
    public record Shape(String name, String role, List<Member> members) {
    }

    /**
     * 形のメンバ 1 件。
     *
     * @param name 項目名
     * @param label 定義由来の表示ラベル（生成コードのドキュメント用）。
     *     framework が合成するメンバ（{@code items} / {@code totalCount} など）は空
     * @param type {@code string} / {@code number} / {@code boolean} /
     *     {@code object} / {@code array}（開いた文字列）
     * @param optional ペイロードで省略されうるか
     * @param readOnly 項目が {@code readOnly}（送ってもサーバは無視してよい）
     * @param computed 項目が {@code computed}（Renderer が導出。入力そのものではない）
     * @param itemType {@code type} が {@code array} のときの要素型。無ければ null
     * @param shape object / array&lt;object&gt; のとき参照する形の名前。無ければ null
     * @param constraints {@code validators} 由来の制約
     *     （maxLength / minLength / minimum / maximum / pattern / format）
     */
    public record Member(
            String name,
            String label,
            String type,
            boolean optional,
            boolean readOnly,
            boolean computed,
            String itemType,
            String shape,
            Map<String, Object> constraints) {
    }
}

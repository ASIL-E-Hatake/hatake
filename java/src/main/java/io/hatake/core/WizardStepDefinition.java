package io.hatake.core;

import java.util.List;
import java.util.Map;

/**
 * ステップ入力（{@code type: wizard}）の 1 ステップ。
 * <b>id と見出しを持つ {@link SectionDefinition}</b>、と思えばいい。
 *
 * <p>描画専用のキー（{@code description} / {@code layout}）は、この版の他のモデルと
 * 同じ方針で持たない（バックエンドは検証・クエリのために定義を読む）。
 *
 * @param id ステップ識別子
 * @param title ステップ見出し
 * @param fields そのステップの入力項目
 * @param visibleWhen そのステップを丸ごと出す条件（null なら常に出す）
 */
public record WizardStepDefinition(
        String id,
        String title,
        List<FieldDefinition> fields,
        Map<String, Object> visibleWhen) {

    /** 条件を持たない普通のステップ。 */
    public WizardStepDefinition(String id, String title, List<FieldDefinition> fields) {
        this(id, title, fields, null);
    }

    /**
     * このステップだけのフォーム。{@link FormValidator} にこれを渡せば、
     * <b>そのステップの項目だけ</b>を検証できる（「次へ」相当）。
     *
     * <p>条件はそのまま区画の {@code visibleWhen} になる＝<b>隠れているステップは
     * 検証もしない</b>（「隠れた区画は検証しない」がそのまま効く）。判定を2つ持たない。
     */
    public FormDefinition form() {
        return new FormDefinition(
                List.of(new SectionDefinition(title, fields, visibleWhen)));
    }
}

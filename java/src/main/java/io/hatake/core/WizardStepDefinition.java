package io.hatake.core;

import java.util.List;

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
 */
public record WizardStepDefinition(
        String id,
        String title,
        List<FieldDefinition> fields) {

    /**
     * このステップだけのフォーム。{@link FormValidator} にこれを渡せば、
     * <b>そのステップの項目だけ</b>を検証できる（「次へ」相当）。
     */
    public FormDefinition form() {
        return new FormDefinition(List.of(new SectionDefinition(title, fields)));
    }
}

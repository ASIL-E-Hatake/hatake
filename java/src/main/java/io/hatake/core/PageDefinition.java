package io.hatake.core;

import java.util.List;

/**
 * A hatake page definition (Java edition). Mirrors the shared DSL spec.
 *
 * <p>On the backend a definition drives API logic (validation, query building)
 * rather than rendering UI, so this scaffold models page identity, the search
 * area, and the form; presentation-only parts of the DSL are ignored.
 *
 * <p>{@code type: wizard} のページは {@code form} の代わりに {@link #steps} を持つ。
 * その場合 {@code form} は<b>全ステップを1つのフォームに畳んだもの</b>（ステップごとに
 * セクション1つ）が入るので、「保存時に全項目を検証する」は他のページ種別と同じ
 * {@code validate(page.form(), record)} で書ける。1ステップだけ検証したいときは
 * {@link #stepById(String)} → {@link WizardStepDefinition#form()}。
 */
public record PageDefinition(
        String id,
        String title,
        String dslVersion,
        String type,
        String repository,
        String keyField,
        SearchDefinition search,
        TableDefinition table,
        FormDefinition form,
        List<WizardStepDefinition> steps) {

    /** ステップ入力ページの type。 */
    public static final String WIZARD = "wizard";

    /**
     * テーブルもステップも持たないページ用の短縮コンストラクタ。
     *
     * <p>正式コンストラクタは項目が増えるたびに全呼び出し元を壊すので、
     * それらに関係ない箇所（テスト・単純な組み立て）はこちらを使う。
     */
    public PageDefinition(
            String id,
            String title,
            String dslVersion,
            String type,
            String repository,
            String keyField,
            SearchDefinition search,
            FormDefinition form) {
        this(id, title, dslVersion, type, repository, keyField, search,
                TableDefinition.EMPTY, form, List.of());
    }

    /** このページがステップ入力かどうか。 */
    public boolean isWizard() {
        return WIZARD.equals(type);
    }

    /** id でステップを引く。見つからなければ null。 */
    public WizardStepDefinition stepById(String stepId) {
        for (WizardStepDefinition step : steps) {
            if (step.id().equals(stepId)) {
                return step;
            }
        }
        return null;
    }
}

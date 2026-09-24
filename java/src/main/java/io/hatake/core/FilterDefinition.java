package io.hatake.core;

import java.util.List;

public record FilterDefinition(
        String field,
        String label,
        String type,
        String operator,
        List<OptionItem> options) {

    /**
     * 選択肢を持たない検索条件の短縮コンストラクタ。
     *
     * <p>正式コンストラクタは項目が増えるたびに全呼び出し元を壊すので、
     * 選択肢を使わない箇所（テスト・単純な組み立て）はこちらを使う。
     */
    public FilterDefinition(String field, String label, String type, String operator) {
        this(field, label, type, operator, List.of());
    }
}

package io.hatake.core;

import java.util.List;

public record SearchDefinition(List<FilterDefinition> filters, List<QuerySpec.Condition> fixed) {

    /**
     * 固定条件の無い検索欄（0.9.22 までの形）。
     *
     * <p>{@code fixed} を足したときに正式構築子が変わったので、今までの呼び出しを壊さない
     * よう残してある。
     */
    public SearchDefinition(List<FilterDefinition> filters) {
        this(filters, List.of());
    }
}

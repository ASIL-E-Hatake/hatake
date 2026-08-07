package io.hatake.core;

import java.util.List;
import java.util.stream.Collectors;

/**
 * strict パースで知らないキーが見つかったときに投げる例外。
 *
 * <p>1件目で止めず {@link #keys()} に全部入れる（1往復で直せるように）。
 * 既存の呼び出し元が {@link IllegalArgumentException} を捕まえているので、その系列。
 */
public class UnknownKeysException extends IllegalArgumentException {

    private static final long serialVersionUID = 1L;

    private final List<StrictKeys.UnknownKey> keys;

    public UnknownKeysException(List<StrictKeys.UnknownKey> keys) {
        super(message(keys));
        this.keys = List.copyOf(keys);
    }

    /** 見つかった未知キー（`(path, key)` の昇順）。 */
    public List<StrictKeys.UnknownKey> keys() {
        return keys;
    }

    private static String message(List<StrictKeys.UnknownKey> keys) {
        return "知らないキーが " + keys.size() + " 件あります:\n"
                + keys.stream()
                        .map(k -> "  - " + k.describe())
                        .collect(Collectors.joining("\n"));
    }
}

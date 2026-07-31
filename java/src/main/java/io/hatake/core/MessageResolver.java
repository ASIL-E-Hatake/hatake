package io.hatake.core;

import java.util.HashMap;
import java.util.Map;

/**
 * メッセージをロケール＋キーで解決する。既定ロケールは日本語（{@code ja}）。
 * Dart / TypeScript 版と同挙動。
 *
 * <p>フレームワークの他レジストリと同じく「開いた文字列キー + 差し替え可能」。
 * 未知のキー/ロケールは {@code ja} に、それも無ければキー名にフォールバックする。
 */
public final class MessageResolver {

    /** 既定（日本語）のバリデーションメッセージ。{@code {value}} などのプレースホルダを持つ。 */
    public static final Map<String, Map<String, String>> DEFAULT_VALIDATION_MESSAGES = Map.of(
            "ja", Map.of(
                    "required", "必須項目です",
                    "maxLength", "{value}文字以内で入力してください",
                    "minLength", "{value}文字以上で入力してください",
                    "min", "{value}以上で入力してください",
                    "max", "{value}以下で入力してください",
                    "pattern", "形式が正しくありません",
                    "email", "メールアドレスの形式が正しくありません",
                    "postalCode", "郵便番号の形式が正しくありません"));

    private final String locale;
    private final Map<String, Map<String, String>> messages;

    /** 既定ロケール（日本語）で構築する。 */
    public MessageResolver() {
        this("ja", null);
    }

    /** 指定ロケールで構築する。 */
    public MessageResolver(String locale) {
        this(locale, null);
    }

    /** [custom] を既定にマージして構築する。 */
    public MessageResolver(String locale, Map<String, Map<String, String>> custom) {
        this.locale = locale;
        this.messages = merge(DEFAULT_VALIDATION_MESSAGES, custom);
    }

    private static Map<String, Map<String, String>> merge(
            Map<String, Map<String, String>> base,
            Map<String, Map<String, String>> overlay) {
        Map<String, Map<String, String>> result = new HashMap<>();
        for (Map.Entry<String, Map<String, String>> e : base.entrySet()) {
            result.put(e.getKey(), new HashMap<>(e.getValue()));
        }
        if (overlay != null) {
            for (Map.Entry<String, Map<String, String>> e : overlay.entrySet()) {
                result.computeIfAbsent(e.getKey(), k -> new HashMap<>()).putAll(e.getValue());
            }
        }
        return result;
    }

    public String locale() {
        return locale;
    }

    /** key のメッセージを現在の locale で解決し、params を {@code {name}} に埋める。 */
    public String resolve(String key, Map<String, Object> params) {
        Map<String, String> table = messages.getOrDefault(locale, messages.getOrDefault("ja", Map.of()));
        String template = table.get(key);
        if (template == null) {
            template = messages.getOrDefault("ja", Map.of()).get(key);
        }
        if (template == null) {
            template = key;
        }
        for (Map.Entry<String, Object> e : params.entrySet()) {
            template = template.replace("{" + e.getKey() + "}", String.valueOf(e.getValue()));
        }
        return template;
    }

    public String resolve(String key) {
        return resolve(key, Map.of());
    }

    /** マージ済みメッセージを保ったままロケールだけ切り替える。 */
    public MessageResolver withLocale(String locale) {
        // this.messages は既定を包含するため、overlay として再マージしても同一になる。
        return new MessageResolver(locale, this.messages);
    }
}

package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.Map;
import org.junit.jupiter.api.Test;

class MessageResolverTest {

    @Test
    void defaultsToJapanese() {
        MessageResolver m = new MessageResolver();
        assertEquals("必須項目です", m.resolve("required"));
        assertEquals("3文字以内で入力してください", m.resolve("maxLength", Map.of("value", 3)));
    }

    @Test
    void fallsBackToKeyForUnknownKeys() {
        assertEquals("nope", new MessageResolver().resolve("nope"));
    }

    @Test
    void supportsLocaleOverrideAndSwitching() {
        MessageResolver m = new MessageResolver("en", Map.of(
                "en", Map.of("required", "Required", "maxLength", "Max {value} chars")));
        assertEquals("Required", m.resolve("required"));
        assertEquals("Max 3 chars", m.resolve("maxLength", Map.of("value", 3)));
        // key missing in en falls back to ja
        assertEquals("メールアドレスの形式が正しくありません", m.resolve("email"));
        // same tables, locale switched back to ja
        assertEquals("必須項目です", m.withLocale("ja").resolve("required"));
    }

    @Test
    void registryKeepsJapaneseByDefault() {
        ValidatorRegistry r = new ValidatorRegistry();
        assertEquals("必須項目です",
                r.run("", new ValidatorDefinition("required", Map.of(), null)));
    }

    @Test
    void registryLocalizesViaInjectedResolver() {
        MessageResolver messages = new MessageResolver("en", Map.of(
                "en", Map.of("required", "Required", "maxLength", "Max {value} chars")));
        ValidatorRegistry r = new ValidatorRegistry(null, messages);
        assertEquals("Required",
                r.run("", new ValidatorDefinition("required", Map.of(), null)));
        assertEquals("Max 3 chars",
                r.run("ABCD", new ValidatorDefinition("maxLength", Map.of("value", 3), null)));
    }
}

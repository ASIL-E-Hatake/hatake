package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import org.yaml.snakeyaml.Yaml;

/**
 * 条件つきの検証を、共有フィクスチャ
 * {@code spec/conformance/conditional_validation.json} で確認する。
 *
 * <p>固定したいのは3つ: 隠れている項目（と区画）は検証しない、{@code requiredWhen} が
 * 成立したら必須になる、{@code mode} を渡さない呼び出しでは mode の条件が false になる。
 * Dart / TypeScript 版と同じ契約。
 */
class ConditionalValidationConformanceTest {

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> conditionalValidation() throws IOException {
        String content =
                Files.readString(Path.of("../spec/conformance/conditional_validation.json"));
        Map<String, Object> fixture = (Map<String, Object>) new Yaml().load(content);

        PageDefinition page =
                DefinitionParser.parsePageMap((Map<String, Object>) fixture.get("page"));
        FormValidator validator = new FormValidator();

        List<Map<String, Object>> cases = (List<Map<String, Object>>) fixture.get("cases");
        return cases.stream().map(c -> DynamicTest.dynamicTest(
                String.valueOf(c.get("name")),
                () -> {
                    Map<String, Object> record = (Map<String, Object>) c.get("record");
                    String mode = (String) c.get("mode");
                    List<Map<String, Object>> expected =
                            (List<Map<String, Object>>) c.get("expected");

                    assertEquals(keys(expected),
                            actualKeys(validator.validate(page.form(), record, mode).errors()));
                }));
    }

    /** 期待エラーを {@code field=message} の集合にする。 */
    private static Set<String> keys(List<Map<String, Object>> expected) {
        Set<String> result = new LinkedHashSet<>();
        for (Map<String, Object> e : expected) {
            result.add(e.get("field") + "=" + e.get("message"));
        }
        return result;
    }

    /** 実際のエラーを {@code field=message} の集合にする。 */
    private static Set<String> actualKeys(List<FormValidator.ValidationError> errors) {
        Set<String> result = new LinkedHashSet<>();
        for (FormValidator.ValidationError e : errors) {
            result.add(e.field() + "=" + e.message());
        }
        return result;
    }
}

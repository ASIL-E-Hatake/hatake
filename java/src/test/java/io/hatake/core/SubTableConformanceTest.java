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
 * 明細（master-detail）のサーバ側検証を、共有フィクスチャ
 * {@code spec/conformance/subtable_validation.json} と
 * {@code subtable_source_validation.json} で確認する。
 * Dart / TypeScript 版と同じ契約。エラーは順不同の集合として比較する。
 */
class SubTableConformanceTest {

    @TestFactory
    Stream<DynamicTest> subTableValidation() throws IOException {
        return runFixture("subtable_validation.json");
    }

    /** {@code source} 付きの明細は親の検証がまるごと飛ばす。 */
    @TestFactory
    Stream<DynamicTest> subTableSourceIsSkipped() throws IOException {
        return runFixture("subtable_source_validation.json");
    }

    /** 行の中ではなく<b>行どうし</b>の規則（同じ品名が2行にある）。 */
    @TestFactory
    Stream<DynamicTest> crossRowRules() throws IOException {
        return runFixture("row_rules_validation.json");
    }

    @SuppressWarnings("unchecked")
    private static Stream<DynamicTest> runFixture(String file) throws IOException {
        String content = Files.readString(Path.of("../spec/conformance/" + file));
        Map<String, Object> fixture = (Map<String, Object>) new Yaml().load(content);

        Map<String, Object> page = (Map<String, Object>) fixture.get("page");
        PageDefinition definition = DefinitionParser.parsePageMap(page);
        FormValidator validator = new FormValidator();

        List<Map<String, Object>> cases = (List<Map<String, Object>>) fixture.get("cases");
        return cases.stream().map(c -> DynamicTest.dynamicTest(
                String.valueOf(c.get("name")),
                () -> {
                    Map<String, Object> record = (Map<String, Object>) c.get("record");
                    List<Map<String, Object>> expected =
                            (List<Map<String, Object>>) c.get("expected");

                    assertEquals(
                            keys(expected),
                            actualKeys(validator.validate(definition.form(), record).errors()));
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

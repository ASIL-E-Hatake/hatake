package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import org.yaml.snakeyaml.Yaml;

/**
 * {@code app.vocabularies} の展開が <b>3版で同じ</b>であること
 * （{@code spec/conformance/vocabularies.json}）。
 *
 * <p>展開は読み込み時なので、ここが揃っていれば下流（画面・CSV・紙）も揃う。
 * 揃っていないと、同じ定義から Flutter の画面と Java のサーバで<b>違う字</b>が出る。
 */
class VocabulariesConformanceTest {

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> cases() throws IOException {
        String content = Files.readString(Path.of("../spec/conformance/vocabularies.json"));
        Map<String, Object> root = (Map<String, Object>) new Yaml().load(content);
        return (List<Map<String, Object>>) root.get("cases");
    }

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> vocabularies() throws IOException {
        return cases().stream().map(c -> DynamicTest.dynamicTest(
                String.valueOf(c.get("name")),
                () -> {
                    Map<String, Object> expanded =
                            Vocabularies.expand((Map<String, Object>) c.get("document"));
                    Map<String, Object> app = (Map<String, Object>) expanded.get("app");
                    Map<String, Object> page =
                            (List<Map<String, Object>>) app.get("pages") != null
                                    ? ((List<Map<String, Object>>) app.get("pages")).get(0)
                                    : Map.of();
                    Map<String, Object> table = (Map<String, Object>) page.get("table");
                    List<Map<String, Object>> columns =
                            (List<Map<String, Object>>) table.get("columns");

                    List<Map<String, Object>> options = List.of();
                    for (Map<String, Object> one : columns) {
                        if (String.valueOf(c.get("column")).equals(one.get("field"))
                                && one.get("options") instanceof List<?> found) {
                            options = (List<Map<String, Object>>) found;
                        }
                    }

                    // 見るのは value と label だけ（キーの並び順は問わない）。
                    List<List<Object>> actual = new ArrayList<>();
                    for (Map<String, Object> one : options) {
                        actual.add(List.of(
                                String.valueOf(one.get("value")),
                                String.valueOf(one.get("label"))));
                    }
                    List<List<Object>> expected = new ArrayList<>();
                    for (Map<String, Object> one
                            : (List<Map<String, Object>>) c.get("expected")) {
                        expected.add(List.of(
                                String.valueOf(one.get("value")),
                                String.valueOf(one.get("label"))));
                    }
                    assertEquals(expected, actual);
                }));
    }
}

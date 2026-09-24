package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
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

    /**
     * <b>strict は「人が書いたもの」にかける。</b>
     *
     * <p>語彙の展開は機械が値を足すので、展開後を strict に渡すと<b>自分が入れた値を
     * 自分で弾く</b>。列の {@code options} がまさにそれで、定義には書けない
     * （書けるのは {@code optionsOf} だけ）のに展開後の列には入っている。
     * 実際、そう書いてしまって CI が落ちた。
     */
    @Test
    void strictLooksAtWhatAPersonWrote() {
        String source = """
                dsl_version: "1.0"
                app:
                  id: orders
                  title: 受注
                  home: orders
                  vocabularies:
                    - name: orderStatus
                      options:
                        - { value: shipped, label: 出荷済 }
                  menu:
                    - { id: orders, label: 受注一覧, page: orders }
                  pages:
                    - type: crud
                      id: orders
                      title: 受注一覧
                      repository: orderRepository
                      key: orderNo
                      table:
                        columns:
                          - { field: orderNo, label: 受注番号 }
                          - { field: status, label: 状態, optionsOf: orderStatus }
                      form:
                        sections:
                          - fields:
                              - { field: orderNo, label: 受注番号, type: text, required: true }
                """;
        assertDoesNotThrow(() -> AppParser.parseAppYaml(source, true));
        assertDoesNotThrow(() -> AppParser.parseAppPagesYaml(source, true));
    }
}

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
 * ダッシュボードの集約を、共有フィクスチャ
 * {@code spec/conformance/dashboard_aggregate.json} で確認する。
 * Dart / TypeScript 版と同じ数値になること（metric カードの値が版でぶれない）。
 *
 * <p>数値は正規化した文字列で比較して言語差（{@code 200} と {@code 200.0}）を吸収する。
 */
class AggregateConformanceTest {

    @SuppressWarnings("unchecked")
    private static Map<String, Object> fixture() throws IOException {
        String content =
                Files.readString(Path.of("../spec/conformance/dashboard_aggregate.json"));
        return (Map<String, Object>) new Yaml().load(content);
    }

    /** 整数値は小数点なしに揃える。 */
    private static String num(Object value) {
        if (value == null) {
            return "null";
        }
        double d = ((Number) value).doubleValue();
        return d == Math.rint(d) && !Double.isInfinite(d)
                ? String.valueOf((long) d)
                : String.valueOf(d);
    }

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> aggregate() throws IOException {
        Aggregates aggregates = new Aggregates();
        List<Map<String, Object>> cases =
                (List<Map<String, Object>>) fixture().get("aggregate");
        return cases.stream().map(c -> DynamicTest.dynamicTest(
                String.valueOf(c.get("name")),
                () -> {
                    List<Map<String, Object>> rows =
                            (List<Map<String, Object>>) c.get("rows");
                    Object field = c.get("field");
                    assertEquals(
                            num(c.get("expected")),
                            num(aggregates.aggregate(
                                    (String) c.get("op"),
                                    rows,
                                    field == null ? null : (String) field)));
                }));
    }

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> aggregateBy() throws IOException {
        Aggregates aggregates = new Aggregates();
        List<Map<String, Object>> cases =
                (List<Map<String, Object>>) fixture().get("groupBy");
        return cases.stream().map(c -> DynamicTest.dynamicTest(
                String.valueOf(c.get("name")),
                () -> {
                    List<Map<String, Object>> rows =
                            (List<Map<String, Object>>) c.get("rows");
                    Object valueField = c.get("valueField");
                    List<Aggregates.Bucket> actual = aggregates.aggregateBy(
                            (String) c.get("op"),
                            rows,
                            (String) c.get("labelField"),
                            valueField == null ? null : (String) valueField);

                    List<String> expected = new ArrayList<>();
                    for (Map<String, Object> e :
                            (List<Map<String, Object>>) c.get("expected")) {
                        expected.add(e.get("label") + "=" + num(e.get("value")));
                    }
                    List<String> got = new ArrayList<>();
                    for (Aggregates.Bucket b : actual) {
                        got.add(b.label() + "=" + num(b.value()));
                    }
                    assertEquals(expected, got);
                }));
    }
}

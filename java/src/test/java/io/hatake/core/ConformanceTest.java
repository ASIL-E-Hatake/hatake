package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import org.yaml.snakeyaml.Yaml;

/**
 * Runs the shared conformance fixtures (spec/conformance) against the Java
 * implementation. The same fixtures drive the Dart and TypeScript editions.
 */
class ConformanceTest {

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> load(String file) throws IOException {
        String content = Files.readString(Path.of("../spec/conformance", file));
        return (List<Map<String, Object>>) new Yaml().load(content);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> opts(Map<String, Object> c) {
        return c.get("options") instanceof Map ? (Map<String, Object>) c.get("options") : Map.of();
    }

    @TestFactory
    Stream<DynamicTest> formatters() throws IOException {
        FormatterRegistry fmt = new FormatterRegistry();
        return load("formatters.json").stream().map(c -> DynamicTest.dynamicTest(
                c.get("name") + " " + c.get("value") + " " + c.get("options"),
                () -> assertEquals(
                        c.get("expected"),
                        fmt.format((String) c.get("name"), c.get("value"), opts(c)))));
    }

    @TestFactory
    Stream<DynamicTest> converters() throws IOException {
        ConverterRegistry conv = new ConverterRegistry();
        return load("converters.json").stream().map(c -> DynamicTest.dynamicTest(
                c.get("name") + " " + c.get("value"),
                () -> assertEquals(
                        String.valueOf(c.get("expected")),
                        String.valueOf(conv.convert((String) c.get("name"), c.get("value"))))));
    }

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> queries() throws IOException {
        return load("queries.json").stream().map(c -> DynamicTest.dynamicTest(
                String.valueOf(c.get("params")),
                () -> {
                    List<Map<String, Object>> filtersRaw = (List<Map<String, Object>>) c.get("filters");
                    List<FilterDefinition> filters = filtersRaw.stream()
                            .map(f -> new FilterDefinition(
                                    (String) f.get("field"), (String) f.get("field"),
                                    (String) f.get("type"), (String) f.get("operator")))
                            .toList();
                    Map<String, Object> params = (Map<String, Object>) c.get("params");
                    QuerySpec q = QueryBuilder.build(new SearchDefinition(filters), params);

                    Map<String, Object> e = (Map<String, Object>) c.get("expected");
                    List<Map<String, Object>> ec = (List<Map<String, Object>>) e.get("conditions");
                    assertEquals(ec.size(), q.conditions().size());
                    for (int i = 0; i < ec.size(); i++) {
                        assertEquals(ec.get(i).get("field"), q.conditions().get(i).field());
                        assertEquals(ec.get(i).get("operator"), q.conditions().get(i).operator());
                        assertEquals(String.valueOf(ec.get(i).get("value")),
                                String.valueOf(q.conditions().get(i).value()));
                    }
                    assertEquals(e.get("sortField"), q.sortField());
                    assertEquals(e.get("sortAscending"), q.sortAscending());
                    assertEquals(((Number) e.get("page")).intValue(), q.page());
                    assertEquals(((Number) e.get("pageSize")).intValue(), q.pageSize());
                }));
    }

    @TestFactory
    Stream<DynamicTest> validators() throws IOException {
        ValidatorRegistry registry = new ValidatorRegistry();
        return load("validators.json").stream().map(c -> DynamicTest.dynamicTest(
                c.get("type") + " " + c.get("value"),
                () -> {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> params = c.get("params") instanceof Map
                            ? (Map<String, Object>) c.get("params") : Map.of();
                    String result = registry.run(c.get("value"),
                            new ValidatorDefinition((String) c.get("type"), params, null));
                    assertEquals(c.get("valid"), result == null);
                    if (c.get("message") != null) {
                        assertEquals(c.get("message"), result);
                    }
                }));
    }
}

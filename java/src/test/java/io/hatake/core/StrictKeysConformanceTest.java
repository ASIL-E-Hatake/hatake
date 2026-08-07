package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import org.yaml.snakeyaml.Yaml;

/**
 * 未知キーの検出を共有フィクスチャ {@code spec/conformance/strict_keys.json} で確認する。
 * Dart / TypeScript 版と同じ場所・同じ指摘になること。
 */
class StrictKeysConformanceTest {

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> strictKeys() throws IOException {
        String content = Files.readString(Path.of("../spec/conformance/strict_keys.json"));
        Map<String, Object> fixture = (Map<String, Object>) new Yaml().load(content);
        List<Map<String, Object>> cases = (List<Map<String, Object>>) fixture.get("cases");

        return cases.stream().map(c -> DynamicTest.dynamicTest(
                String.valueOf(c.get("name")),
                () -> {
                    Map<String, Object> document = (Map<String, Object>) c.get("document");
                    List<Map<String, Object>> actual = new ArrayList<>();
                    for (StrictKeys.UnknownKey key : StrictKeys.find(document)) {
                        // null を保つため LinkedHashMap（Map.of は null 不可）。
                        Map<String, Object> row = new LinkedHashMap<>();
                        row.put("path", key.path());
                        row.put("key", key.key());
                        row.put("suggestion", key.suggestion());
                        actual.add(row);
                    }
                    assertEquals(c.get("expected"), actual);
                }));
    }
}

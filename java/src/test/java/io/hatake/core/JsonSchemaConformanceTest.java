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
 * JSON Schema 出力を共有フィクスチャ {@code spec/conformance/dto_json_schema.json} で
 * 確認する。TypeScript 版と同一出力であることを機械確認する。スカラは再帰的に
 * 文字列化して比較し、言語ごとの数値表現差を吸収する。
 */
class JsonSchemaConformanceTest {

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> jsonSchemaEmission() throws IOException {
        String content = Files.readString(Path.of("../spec/conformance/dto_json_schema.json"));
        Map<String, Object> fixture = (Map<String, Object>) new Yaml().load(content);

        List<Map<String, Object>> cases = (List<Map<String, Object>>) fixture.get("cases");
        return cases.stream().map(c -> DynamicTest.dynamicTest(
                String.valueOf(c.get("name")),
                () -> {
                    PageDefinition page =
                            DefinitionParser.parsePageMap((Map<String, Object>) c.get("page"));
                    Map<String, Object> schema =
                            JsonSchemaEmitter.toJsonSchema(DtoDeriver.deriveDto(page));
                    assertEquals(canonical(c.get("expected")), canonical(schema));
                }));
    }

    /** 入れ子をたどってスカラを文字列化する（6 と 6.0 を同一視するため）。 */
    @SuppressWarnings("unchecked")
    private static Object canonical(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Map.Entry<String, Object> e : ((Map<String, Object>) map).entrySet()) {
                out.put(e.getKey(), canonical(e.getValue()));
            }
            return out;
        }
        if (value instanceof List<?> list) {
            List<Object> out = new ArrayList<>();
            for (Object item : list) {
                out.add(canonical(item));
            }
            return out;
        }
        return String.valueOf(value);
    }
}

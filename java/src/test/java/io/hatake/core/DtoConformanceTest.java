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
 * DTO 導出を共有フィクスチャ {@code spec/conformance/dto_spec.json} で確認する。
 * TypeScript 版と同一出力であることを機械確認する。制約値は文字列で比較して
 * 言語ごとの数値表現差を吸収する。
 */
class DtoConformanceTest {

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> dtoDerivation() throws IOException {
        String content = Files.readString(Path.of("../spec/conformance/dto_spec.json"));
        Map<String, Object> fixture = (Map<String, Object>) new Yaml().load(content);

        List<Map<String, Object>> cases = (List<Map<String, Object>>) fixture.get("cases");
        return cases.stream().map(c -> DynamicTest.dynamicTest(
                String.valueOf(c.get("name")),
                () -> {
                    PageDefinition page =
                            DefinitionParser.parsePageMap((Map<String, Object>) c.get("page"));
                    assertEquals(
                            expected((Map<String, Object>) c.get("expected")),
                            actual(DtoDeriver.deriveDto(page)));
                }));
    }

    /** 導出結果を比較可能な形（制約値は文字列）に落とす。 */
    private static Map<String, Object> actual(DtoSpec spec) {
        List<Object> shapes = new ArrayList<>();
        for (DtoSpec.Shape shape : spec.shapes()) {
            List<Object> members = new ArrayList<>();
            for (DtoSpec.Member m : shape.members()) {
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("name", m.name());
                out.put("label", m.label());
                out.put("type", m.type());
                out.put("optional", m.optional());
                out.put("readOnly", m.readOnly());
                out.put("computed", m.computed());
                if (m.itemType() != null) {
                    out.put("itemType", m.itemType());
                }
                if (m.shape() != null) {
                    out.put("shape", m.shape());
                }
                out.put("constraints", stringify(m.constraints()));
                members.add(out);
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("name", shape.name());
            out.put("role", shape.role());
            out.put("members", members);
            shapes.add(out);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("page", spec.page());
        out.put("shapes", shapes);
        return out;
    }

    /** 期待値を同じ形（キー順・文字列化）に揃える。 */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> expected(Map<String, Object> raw) {
        List<Object> shapes = new ArrayList<>();
        for (Map<String, Object> shape : (List<Map<String, Object>>) raw.get("shapes")) {
            List<Object> members = new ArrayList<>();
            for (Map<String, Object> m : (List<Map<String, Object>>) shape.get("members")) {
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("name", m.get("name"));
                out.put("label", m.get("label"));
                out.put("type", m.get("type"));
                out.put("optional", m.get("optional"));
                out.put("readOnly", m.get("readOnly"));
                out.put("computed", m.get("computed"));
                if (m.get("itemType") != null) {
                    out.put("itemType", m.get("itemType"));
                }
                if (m.get("shape") != null) {
                    out.put("shape", m.get("shape"));
                }
                Map<String, Object> constraints = m.get("constraints") instanceof Map
                        ? (Map<String, Object>) m.get("constraints")
                        : Map.of();
                out.put("constraints", stringify(constraints));
                members.add(out);
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("name", shape.get("name"));
            out.put("role", shape.get("role"));
            out.put("members", members);
            shapes.add(out);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("page", raw.get("page"));
        out.put("shapes", shapes);
        return out;
    }

    private static Map<String, String> stringify(Map<String, Object> constraints) {
        Map<String, String> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : constraints.entrySet()) {
            out.put(e.getKey(), String.valueOf(e.getValue()));
        }
        return out;
    }
}

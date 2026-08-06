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
 * ネイティブ型出力を共有フィクスチャ {@code spec/conformance/dto_native_types.json} で
 * 確認する。TypeScript 版と<b>バイト一致</b>することを機械確認する（両ターゲットを
 * 両エディションから出せるようにしてあるのはこのため）。
 */
class NativeTypeConformanceTest {

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> nativeTypeEmission() throws IOException {
        String content = Files.readString(Path.of("../spec/conformance/dto_native_types.json"));
        Map<String, Object> fixture = (Map<String, Object>) new Yaml().load(content);

        List<Map<String, Object>> cases = (List<Map<String, Object>>) fixture.get("cases");
        List<DynamicTest> tests = new ArrayList<>();
        for (Map<String, Object> c : cases) {
            String name = String.valueOf(c.get("name"));
            PageDefinition page =
                    DefinitionParser.parsePageMap((Map<String, Object>) c.get("page"));
            DtoSpec spec = DtoDeriver.deriveDto(page);

            tests.add(DynamicTest.dynamicTest(name + " (TypeScript)", () -> assertEquals(
                    joined((List<String>) c.get("typescript")),
                    TypeEmitter.toTypeScript(spec))));

            Map<String, Object> options = (Map<String, Object>) c.get("javaOptions");
            String packageName = options != null && options.get("packageName") instanceof String s
                    ? s
                    : null;
            Map<String, List<String>> expected = (Map<String, List<String>>) c.get("java");
            tests.add(DynamicTest.dynamicTest(name + " (Java)", () -> {
                Map<String, String> files = TypeEmitter.toJavaRecords(
                        spec, new TypeEmitter.JavaOptions(packageName));
                // 1レコード＝1ファイル。ファイル名も並び順ごと一致させる。
                assertEquals(new ArrayList<>(expected.keySet()),
                        new ArrayList<>(files.keySet()));
                for (Map.Entry<String, List<String>> e : expected.entrySet()) {
                    assertEquals(joined(e.getValue()), files.get(e.getKey()),
                            "mismatch in " + e.getKey());
                }
            }));
        }
        return tests.stream();
    }

    /** フィクスチャは行の配列。改行で連結し、末尾に改行を足したものが期待値。 */
    private static String joined(List<String> lines) {
        return String.join("\n", lines);
    }
}

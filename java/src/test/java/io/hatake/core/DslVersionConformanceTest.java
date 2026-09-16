package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.yaml.snakeyaml.Yaml;

/**
 * DSL の版の受け取り方の共有フィクスチャ {@code spec/conformance/dsl_version.json} を、
 * TypeScript 版・Dart 版と同じ契約で回す。
 *
 * <p>ここは<b>公開すると直せなくなる</b>所なので、印（{@code kind}）まで固定する。文面は
 * 版ごとの言葉でよいが、「通す／落とす」と理由の印が3版で違ったら、同じ定義が版によって
 * 通ったり落ちたりする。
 */
class DslVersionConformanceTest {

    @SuppressWarnings("unchecked")
    private static Map<String, Object> fixture() throws IOException {
        String content = Files.readString(Path.of("../spec/conformance/dsl_version.json"));
        return (Map<String, Object>) new Yaml().load(content);
    }

    private static String yamlOf(String version) {
        String head = version == null ? "" : "dsl_version: \"" + version + "\"\n";
        return head
                + "type: form\n"
                + "id: p\n"
                + "title: 画面\n"
                + "repository: r\n"
                + "key: id\n"
                + "form:\n"
                + "  fields:\n"
                + "    - { name: id, label: ID, type: text }\n";
    }

    @Test
    void currentMatchesFixture() throws IOException {
        assertEquals(fixture().get("current"), DslVersion.CURRENT);
    }

    @SuppressWarnings("unchecked")
    @TestFactory
    Stream<DynamicTest> cases() throws IOException {
        List<Map<String, Object>> cases = (List<Map<String, Object>>) fixture().get("cases");
        return cases.stream().map(one -> {
            String input = (String) one.get("input");
            String verdict = (String) one.get("verdict");
            String shown = input == null ? "（書かない）" : "\"" + input + "\"";
            return DynamicTest.dynamicTest(shown + " → " + verdict + " / " + one.get("kind"), () -> {
                DslVersion.Verdict got = DslVersion.check(input);
                assertEquals(one.get("kind"), got.kind().wireName());
                assertEquals("error".equals(verdict), got.fatal());
                assertEquals("warn".equals(verdict), got.warn());

                if ("error".equals(verdict)) {
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> DefinitionParser.parsePageYaml(yamlOf(input)));
                } else {
                    assertDoesNotThrow(() -> DefinitionParser.parsePageYaml(yamlOf(input)));
                }
            });
        });
    }
}

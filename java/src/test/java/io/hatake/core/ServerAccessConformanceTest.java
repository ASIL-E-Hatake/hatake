package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.yaml.snakeyaml.Yaml;

/**
 * サーバが画面と同じ判断をする口の共有フィクスチャ {@code spec/conformance/server_access.json}
 * を、TypeScript 版と同じ契約で回す。画面が隠しても API は直接叩けるので、<b>守る側が
 * 同じ答え</b>を出すことがこの口の値打ち。
 */
class ServerAccessConformanceTest {

    @SuppressWarnings("unchecked")
    private static Map<String, Object> fixture() throws IOException {
        String content = Files.readString(Path.of("../spec/conformance/server_access.json"));
        return (Map<String, Object>) new Yaml().load(content);
    }

    @SuppressWarnings("unchecked")
    private static Set<String> roles(Map<String, Object> one) {
        return new LinkedHashSet<>((List<String>) one.get("roles"));
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> cases(Map<String, Object> fixture, String key) {
        return (List<Map<String, Object>>) fixture.get(key);
    }

    @SuppressWarnings("unchecked")
    @TestFactory
    Stream<DynamicTest> sameAnswers() throws IOException {
        Map<String, Object> fixture = fixture();
        Map<String, Object> document = (Map<String, Object>) fixture.get("document");
        List<DynamicTest> tests = new ArrayList<>();

        for (Map<String, Object> one : cases(fixture, "canOpen")) {
            tests.add(DynamicTest.dynamicTest("開ける: " + one.get("name"), () ->
                    assertEquals(one.get("expected"),
                            ServerAccess.canOpenPage(document, (String) one.get("pageId"), roles(one)))));
        }
        for (Map<String, Object> one : cases(fixture, "canRun")) {
            tests.add(DynamicTest.dynamicTest("押せる: " + one.get("name"), () ->
                    assertEquals(one.get("expected"),
                            ServerAccess.canRunAction(document, (String) one.get("pageId"),
                                    (String) one.get("actionId"), roles(one)))));
        }
        for (Map<String, Object> one : cases(fixture, "visible")) {
            tests.add(DynamicTest.dynamicTest("見せる: " + one.get("name"), () ->
                    assertEquals(one.get("expected"),
                            ServerAccess.visibleRecord(document, (String) one.get("pageId"),
                                    (Map<String, Object>) one.get("record"), roles(one)))));
        }
        for (Map<String, Object> one : cases(fixture, "accept")) {
            tests.add(DynamicTest.dynamicTest("受け取る: " + one.get("name"), () -> {
                Map<String, Object> expected = (Map<String, Object>) one.get("expected");
                ServerAccess.Accepted got = ServerAccess.acceptRecord(document,
                        (String) one.get("pageId"), (Map<String, Object>) one.get("body"), roles(one));
                assertEquals(expected.get("accepted"), got.accepted());
                assertEquals(expected.get("dropped"), got.dropped());
            }));
        }
        return tests.stream();
    }

    @Test
    void doesNotTouchTheRecord() {
        Map<String, Object> document = Map.of("page", Map.of(
                "type", "search", "id", "p", "title", "P", "repository", "r",
                "table", Map.of("columns", List.of(
                        Map.of("field", "salary", "label", "給与", "roles", List.of("hr"))))));
        Map<String, Object> record = new LinkedHashMap<>(Map.of("code", "1", "salary", 1));
        assertEquals(Map.of("code", "1"), ServerAccess.visibleRecord(document, "p", record, Set.of()));
        assertEquals(Map.of("code", "1", "salary", 1), record);
    }
}

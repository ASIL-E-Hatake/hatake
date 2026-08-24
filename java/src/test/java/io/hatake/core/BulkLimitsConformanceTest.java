package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
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
 * 1回で動かせる行数の上限の共有フィクスチャ {@code spec/conformance/bulk_limits.json} を、
 * TypeScript 版・Dart 版と同じ契約で回す。
 *
 * <p>画面（Dart）が止めても API を直接叩けば通るので、<b>守る側が同じ数を出す</b>ことが
 * この機能の値打ち。3版が同じ答えを出すことを機械で縛る。
 */
class BulkLimitsConformanceTest {

    @SuppressWarnings("unchecked")
    private static Map<String, Object> fixture() throws IOException {
        String content = Files.readString(Path.of("../spec/conformance/bulk_limits.json"));
        return (Map<String, Object>) new Yaml().load(content);
    }

    @SuppressWarnings("unchecked")
    @TestFactory
    Stream<DynamicTest> rowLimits() throws IOException {
        Map<String, Object> fixture = fixture();
        Map<String, Object> document = (Map<String, Object>) fixture.get("document");
        List<DynamicTest> tests = new ArrayList<>();

        for (Object raw : (List<Object>) fixture.get("cases")) {
            Map<String, Object> one = (Map<String, Object>) raw;
            String name = (String) one.get("name");
            String actionId = (String) one.get("actionId");
            Set<String> roles = new LinkedHashSet<>();
            for (Object role : (List<Object>) one.getOrDefault("roles", List.of())) {
                roles.add((String) role);
            }
            Object expected = one.get("limit");
            tests.add(
                    DynamicTest.dynamicTest(
                            name,
                            () -> {
                                Integer found = BulkLimits.limitFor(document, actionId, roles);
                                if (expected == null) {
                                    assertNull(found, name);
                                } else {
                                    assertEquals(((Number) expected).intValue(), found, name);
                                }
                            }));
        }
        return tests.stream();
    }

    @SuppressWarnings("unchecked")
    @Test
    void 上限を超えて届いたら件数まで言う() throws IOException {
        Map<String, Object> document = (Map<String, Object>) fixture().get("document");
        MessageResolver messages = new MessageResolver();

        // 20件までのボタンに80件届いた＝弾く（画面は押させないので、これは API 直叩き）。
        String said = BulkLimits.check(document, "everyone", 80, Set.of(), messages);
        assertEquals("1回に実行できるのは 20 件までです（80 件届きました）", said);

        // ちょうどは通す。上限なしの人も通す。
        assertNull(BulkLimits.check(document, "everyone", 20, Set.of(), messages));
        assertNull(BulkLimits.check(document, "byRole", 500, Set.of("admin"), messages));
        // 書いていないボタンは何件でも通す（上限を決めていないので）。
        assertNull(BulkLimits.check(document, "noLimit", 9999, Set.of(), messages));
    }
}

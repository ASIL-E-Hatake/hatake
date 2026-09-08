package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/**
 * シナリオ（定義を動かして答えを見る）を、共有フィクスチャ
 * {@code spec/conformance/scenario.json} で確認する。
 *
 * <p>同じファイルを TypeScript（{@code hatake run}）と Dart（{@code ScenarioRunner}）も
 * 食べる＝<b>画面・道具・サーバの3つが同じ答えを出す</b>ことがここで固定される。
 *
 * <p>ただし {@code enabled}（押せるボタン）はサーバ側では答えない。定義の
 * {@code actions} を読まないので、判定する相手が無い。答えの無いものを食い違いに
 * すると全件落ちるので、{@code compare} は {@code enabled} を見ず、代わりに
 * <b>聞かれたら「答えません」と言う</b>（{@code cannot}）ことをここで確かめる。
 */
class ScenarioConformanceTest {

    @SuppressWarnings("unchecked")
    private static Map<String, Object> fixture() throws IOException {
        return (Map<String, Object>) new Yaml()
                .load(Files.readString(Path.of("../spec/conformance/scenario.json")));
    }

    @SuppressWarnings("unchecked")
    private static PageDefinition page(Map<String, Object> fixture) {
        return DefinitionParser.parsePageMap((Map<String, Object>) fixture.get("page"));
    }

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> scenarios() throws IOException {
        Map<String, Object> fixture = fixture();
        PageDefinition page = page(fixture);
        ScenarioRunner runner = new ScenarioRunner();

        List<Map<String, Object>> cases =
                (List<Map<String, Object>>) fixture.get("cases");
        return cases.stream().map(raw -> DynamicTest.dynamicTest(
                String.valueOf(raw.get("name")),
                () -> {
                    ScenarioRunner.Case one = ScenarioRunner.Case.fromMap(raw);
                    ScenarioRunner.Answer answer = runner.runCase(page, one);
                    assertEquals(
                            List.of(),
                            ScenarioRunner.compare(one.expect(), answer),
                            one.name());
                }));
    }

    @Test
    @SuppressWarnings("unchecked")
    void doesNotAnswerWhichButtonsArePressable() throws IOException {
        Map<String, Object> fixture = fixture();
        PageDefinition page = page(fixture);
        Map<String, Object> raw = ((List<Map<String, Object>>) fixture.get("cases")).get(0);

        ScenarioRunner.Case one = ScenarioRunner.Case.fromMap(raw);
        // フィクスチャの1件目は enabled を期待に書いている（画面と道具は答える）。
        assertTrue(one.expect().enabled() != null);

        List<String> cannot = new ScenarioRunner().runCase(page, one).cannot();
        assertTrue(
                cannot.stream().anyMatch(line -> line.contains("押せるボタン")),
                "答えないことを言っていない: " + cannot);
    }
}

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
 * 値を人に見せる字にするところ（{@code CellText}）の共有フィクスチャ
 * {@code spec/conformance/cell_text.json} を、Dart 版・TypeScript 版と同じ契約で回す。
 *
 * <p><b>0.9.4 で3版のコードを1か所にまとめたのに、同じ答えになることを縛る
 * フィクスチャを作っていなかった。</b>そのため Dart だけが「列が自分で持っている
 * 選択肢」を見ていて、ここと TypeScript は見ていない、という食い違いが 0.9.15 まで
 * 残った（列に {@code optionsOf} を書いた画面が、Flutter ではラベル・他の版では
 * 生の値で出ていた）。これが在れば、片方だけ直したときに落ちる。
 */
class CellTextConformanceTest {

    @SuppressWarnings("unchecked")
    private static Map<String, Object> fixture() throws IOException {
        String content = Files.readString(Path.of("../spec/conformance/cell_text.json"));
        return (Map<String, Object>) new Yaml().load(content);
    }

    @SuppressWarnings("unchecked")
    @TestFactory
    Stream<DynamicTest> cases() throws IOException {
        List<Map<String, Object>> cases = (List<Map<String, Object>>) fixture().get("cases");
        FormatterRegistry formatters = new FormatterRegistry();
        return cases.stream().map(one -> DynamicTest.dynamicTest((String) one.get("name"), () -> {
            Map<String, Object> spec = (Map<String, Object>) one.get("column");
            ColumnDefinition column = new ColumnDefinition(
                    (String) spec.get("field"),
                    (String) spec.get("field"),
                    "text",
                    (String) spec.get("format"),
                    spec.get("config") == null ? Map.of() : (Map<String, Object>) spec.get("config"),
                    List.of(),
                    optionsOf(spec.get("options")));

            List<CellText.Owner> owners = new ArrayList<>();
            for (Map<String, Object> owner : (List<Map<String, Object>>) one.get("owners")) {
                owners.add(new CellText.Owner((String) owner.get("field"), optionsOf(owner.get("options"))));
            }

            assertEquals(one.get("text"), CellText.cellText(formatters, owners, column, one.get("value")));
        }));
    }

    @SuppressWarnings("unchecked")
    private static List<OptionItem> optionsOf(Object raw) {
        List<OptionItem> out = new ArrayList<>();
        if (raw == null) {
            return out;
        }
        for (Map<String, Object> one : (List<Map<String, Object>>) raw) {
            out.add(new OptionItem(one.get("value"), (String) one.get("label")));
        }
        return out;
    }
}

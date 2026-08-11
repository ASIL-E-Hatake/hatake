package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.charset.CharsetEncoder;
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
 * 文字コード変換の共有フィクスチャ {@code spec/conformance/charset.json} を、
 * <b>JVM 自身の Charset</b> で確認する。
 *
 * <p>期待値は Python 標準ライブラリの codec が出したバイト列で、Dart 版
 * （hatake_encoding の生成表）も同じファイルを食う。ここが通れば「うちの変換表が
 * 正しい」ではなく「Python・JVM・Dart の3者が同じ」と言える。変換表を手で書けない
 * ものは、独立した実装と突き合わせるしかない。
 *
 * <p>変換そのものは Framework の仕事ではない（出力先の責務）。Java 側は名前を
 * 運ぶだけなので、ここは<b>期待値の裏取り</b>のためのテスト。
 */
class CharsetConformanceTest {

    /** DSL の名前 → JVM の Charset 名。ここが実務の落とし穴そのもの。 */
    private static Charset charsetOf(String name) {
        return switch (name) {
            // 「Shift_JIS」と言われて JVM の Shift_JIS を使うと、①・㈱・髙 で落ちる。
            // Windows / Excel の Shift_JIS は windows-31j（MS932）。
            case "cp932" -> Charset.forName("windows-31j");
            case "shift_jis" -> Charset.forName("Shift_JIS");
            case "euc_jp" -> Charset.forName("EUC-JP");
            default -> throw new IllegalArgumentException(name);
        };
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> fixture() throws IOException {
        String content = Files.readString(Path.of("../spec/conformance/charset.json"));
        return (Map<String, Object>) new Yaml().load(content);
    }

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> charset() throws IOException {
        List<Map<String, Object>> cases =
                (List<Map<String, Object>>) fixture().get("cases");
        List<DynamicTest> tests = new ArrayList<>();
        for (Map<String, Object> c : cases) {
            String name = (String) c.get("charset");
            String text = (String) c.get("text");
            Charset charset = charsetOf(name);
            String label = name + ": " + text.replace("\r", "\\r").replace("\n", "\\n");

            if (c.containsKey("ambiguous")) {
                // 実装で扱いが分かれる文字（フィクスチャに理由が書いてある）。
                // 突き合わせても「どちらが正しいか」は決まらないので見ない。
                continue;
            }
            if (c.containsKey("unmappable")) {
                tests.add(
                        DynamicTest.dynamicTest(
                                label + " は変換できない",
                                () -> {
                                    CharsetEncoder encoder = charset.newEncoder();
                                    assertFalse(
                                            encoder.canEncode(text),
                                            "JVM でも変換できないこと: " + label);
                                }));
                continue;
            }

            List<Integer> expected = (List<Integer>) c.get("bytes");
            byte[] want = new byte[expected.size()];
            for (int i = 0; i < want.length; i++) {
                want[i] = (byte) expected.get(i).intValue();
            }
            tests.add(
                    DynamicTest.dynamicTest(
                            label,
                            () -> {
                                assertTrue(
                                        charset.newEncoder().canEncode(text),
                                        "JVM でも変換できること: " + label);
                                assertArrayEquals(want, text.getBytes(charset));
                                // 往復もできること（読む側でも同じ表が成り立つ）。
                                assertEquals(text, new String(want, charset));
                            }));
        }
        return tests.stream();
    }
}

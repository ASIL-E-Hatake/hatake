package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import org.yaml.snakeyaml.Yaml;

/**
 * 項目間の検証の共有フィクスチャ {@code spec/conformance/cross_field_validation.json} を、
 * TypeScript 版・Dart 版と同じ契約で回す。
 *
 * <p>ここで固定するのは「相手の項目と比べる」「数として読めれば数・読めなければ文字」
 * 「aggregate で明細を畳んだ数と比べる」「どちらかが空なら通す」「メッセージは相手のラベルで
 * 出す」の5つ。フロントとバックで検証がズレないことが、この DSL の値打ちなので。
 */
class CrossFieldConformanceTest {

    @SuppressWarnings("unchecked")
    private static Map<String, Object> fixture(String file) throws IOException {
        String content = Files.readString(Path.of("../spec/conformance/" + file));
        return (Map<String, Object>) new Yaml().load(content);
    }

    @TestFactory
    Stream<DynamicTest> crossFieldValidation() throws IOException {
        return run("cross_field_validation.json");
    }

    /** 1項目で複数落ちたとき、自分の形が先・他の項目に依るものが後。 */
    @TestFactory
    Stream<DynamicTest> whichErrorIsReportedFirst() throws IOException {
        return run("validation_order.json");
    }

    @SuppressWarnings("unchecked")
    private Stream<DynamicTest> run(String file) throws IOException {
        Map<String, Object> fixture = fixture(file);
        PageDefinition page =
                DefinitionParser.parsePageMap((Map<String, Object>) fixture.get("page"));
        FormValidator validator = new FormValidator();
        List<DynamicTest> tests = new ArrayList<>();

        for (Object raw : (List<Object>) fixture.get("cases")) {
            Map<String, Object> one = (Map<String, Object>) raw;
            tests.add(DynamicTest.dynamicTest((String) one.get("name"), () -> {
                Map<String, Object> record = (Map<String, Object>) one.get("record");
                String mode = (String) one.get("mode");
                Set<String> actual = new HashSet<>();
                for (FormValidator.ValidationError e :
                        validator.validate(page.form(), record, mode).errors()) {
                    actual.add(e.field() + "=" + e.message());
                }
                Set<String> expected = new HashSet<>();
                for (Object e : (List<Object>) one.get("expected")) {
                    Map<String, Object> error = (Map<String, Object>) e;
                    expected.add(error.get("field") + "=" + error.get("message"));
                }
                assertEquals(expected, actual);
            }));
        }
        return tests.stream();
    }
}

package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
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
 * ステップ入力（wizard）のサーバ側検証を、共有フィクスチャ
 * {@code spec/conformance/wizard_validation.json} で確認する。
 * ケースの {@code step} が id ならそのステップだけ、null なら全ステップを検証する。
 * Dart / TypeScript 版と同じ契約。
 */
class WizardConformanceTest {

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> wizardValidation() throws IOException {
        String content = Files.readString(Path.of("../spec/conformance/wizard_validation.json"));
        Map<String, Object> fixture = (Map<String, Object>) new Yaml().load(content);

        PageDefinition page =
                DefinitionParser.parsePageMap((Map<String, Object>) fixture.get("page"));
        FormValidator validator = new FormValidator();

        List<Map<String, Object>> cases = (List<Map<String, Object>>) fixture.get("cases");
        return cases.stream().map(c -> DynamicTest.dynamicTest(
                String.valueOf(c.get("name")),
                () -> {
                    String stepId = (String) c.get("step");
                    FormDefinition form = stepId == null
                            ? page.form()
                            : page.stepById(stepId).form();

                    Map<String, Object> record = (Map<String, Object>) c.get("record");
                    List<Map<String, Object>> expected =
                            (List<Map<String, Object>>) c.get("expected");

                    assertEquals(keys(expected),
                            actualKeys(validator.validate(form, record).errors()));
                }));
    }

    @Test
    void parsesStepsAndFoldsThemIntoOneForm() throws IOException {
        String content = Files.readString(Path.of("../spec/conformance/wizard_validation.json"));
        @SuppressWarnings("unchecked")
        Map<String, Object> fixture = (Map<String, Object>) new Yaml().load(content);
        @SuppressWarnings("unchecked")
        PageDefinition page =
                DefinitionParser.parsePageMap((Map<String, Object>) fixture.get("page"));

        assertTrue(page.isWizard());
        assertEquals(List.of("basic", "contact"),
                page.steps().stream().map(WizardStepDefinition::id).toList());
        // 全体の form はステップごとに1セクション。
        assertEquals(List.of("基本情報", "連絡先"),
                page.form().sections().stream().map(SectionDefinition::title).toList());
        assertEquals(List.of("code", "name", "zip", "email"),
                page.form().fields().stream().map(FieldDefinition::field).toList());
        assertNull(page.stepById("nope"));
    }

    @Test
    void rejectsAWizardWithoutSteps() {
        assertThrows(IllegalArgumentException.class, () -> DefinitionParser.parsePageYaml("""
                page:
                  type: wizard
                  id: w
                  title: W
                  repository: r
                """));
    }

    /** 期待エラーを {@code field=message} の集合にする。 */
    private static Set<String> keys(List<Map<String, Object>> expected) {
        Set<String> result = new LinkedHashSet<>();
        for (Map<String, Object> e : expected) {
            result.add(e.get("field") + "=" + e.get("message"));
        }
        return result;
    }

    /** 実際のエラーを {@code field=message} の集合にする。 */
    private static Set<String> actualKeys(List<FormValidator.ValidationError> errors) {
        Set<String> result = new LinkedHashSet<>();
        for (FormValidator.ValidationError e : errors) {
            result.add(e.field() + "=" + e.message());
        }
        return result;
    }
}

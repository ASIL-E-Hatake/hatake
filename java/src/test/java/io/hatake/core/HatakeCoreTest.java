package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class HatakeCoreTest {

    static final String YAML = """
            dsl_version: "1.0"
            page:
              type: crud
              id: customer_master
              title: 顧客マスタ
              repository: customerRepository
              key: id
              form:
                sections:
                  - title: 基本情報
                    fields:
                      - { field: code, label: コード, required: true, validators: [ { type: maxLength, value: 3 } ] }
                      - { field: email, label: メール, validators: [ { type: email } ] }
            """;

    static final String JSON = """
            { "page": { "type": "crud", "id": "customer_master", "title": "顧客マスタ",
              "repository": "customerRepository", "key": "id",
              "form": { "sections": [ { "title": "基本情報", "fields": [
                {"field":"code","label":"コード","required":true,"validators":[{"type":"maxLength","value":3}]},
                {"field":"email","label":"メール","validators":[{"type":"email"}]}
              ] } ] } } }
            """;

    @Test
    void parsesYaml() {
        PageDefinition page = DefinitionParser.parsePageYaml(YAML);
        assertEquals("customer_master", page.id());
        assertEquals("crud", page.type());
        assertEquals(List.of("code", "email"),
                page.form().fields().stream().map(FieldDefinition::field).toList());
    }

    @Test
    void yamlAndJsonConverge() {
        assertEquals(DefinitionParser.parsePageYaml(YAML), DefinitionParser.parsePageJson(JSON));
    }

    @Test
    void validatesServerSide() {
        FormDefinition form = DefinitionParser.parsePageYaml(YAML).form();
        FormValidator validator = new FormValidator();

        assertTrue(validator.validate(form, Map.of("code", "AB", "email", "a@b.co")).valid());

        FormValidator.ValidationResult bad =
                validator.validate(form, Map.of("code", "ABCD", "email", "nope"));
        assertFalse(bad.valid());
        assertTrue(bad.errors().stream().anyMatch(
                e -> e.field().equals("code") && e.message().equals("3文字以内で入力してください")));
        assertTrue(bad.errors().stream().anyMatch(e -> e.field().equals("email")));
    }

    @Test
    void requiredFlagsEmpty() {
        FormDefinition form = DefinitionParser.parsePageYaml(YAML).form();
        FormValidator.ValidationResult r =
                new FormValidator().validate(form, Map.of("code", "", "email", ""));
        assertTrue(r.errors().stream().anyMatch(
                e -> e.field().equals("code") && e.message().equals("必須項目です")));
    }

    @Test
    void customValidatorViaRegistry() {
        ValidatorRegistry registry = new ValidatorRegistry(
                Map.<String, ValidatorRegistry.Validator>of("even", (value, def) -> {
                    if (!(value instanceof Number n)) {
                        return null;
                    }
                    return n.intValue() % 2 == 0 ? null : "偶数を入力してください";
                }));
        FormDefinition form = new FormDefinition(List.of(new SectionDefinition(null,
                List.of(new FieldDefinition("n", "N", "number", false, false,
                        List.of(new ValidatorDefinition("even", Map.of(), null)),
                        null, List.of(), null, null, null, List.of(),
                        List.of(), List.of())))));
        FormValidator validator = new FormValidator(registry);
        assertEquals("偶数を入力してください",
                validator.validate(form, Map.of("n", 3)).errors().get(0).message());
        assertTrue(validator.validate(form, Map.of("n", 4)).valid());
    }
}

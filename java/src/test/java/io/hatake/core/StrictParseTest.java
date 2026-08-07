package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/**
 * strict パースの振る舞いと、キー表がスキーマとズレていないこと。
 *
 * <p>綴り間違いは<b>任意キー</b>に置いてある: 必須キーを間違えると値が見つからず
 * 既にエラーになる。黙って無視されるのは任意キーで、DSL の大半はそちら。
 */
class StrictParseTest {

    private static final String WITH_TYPOS = """
            page:
              type: form
              id: customer_form
              title: 顧客入力
              repository: customerRepository
              form:
                sections:
                  - fields:
                      - { field: code, label: コード, requred: true, readonly: true }
            """;

    @Test
    void ignoresUnknownKeysByDefault() {
        PageDefinition page = DefinitionParser.parsePageYaml(WITH_TYPOS);
        FieldDefinition field = page.form().fields().get(0);
        // 書いたつもりの指定はどこにも無く、何も言われない。
        assertFalse(field.required());
        assertFalse(field.readOnly());
    }

    @Test
    void strictReportsEveryUnknownKeyAtOnce() {
        UnknownKeysException e = assertThrows(UnknownKeysException.class,
                () -> DefinitionParser.parsePageYaml(WITH_TYPOS, true));

        assertEquals(List.of("readonly", "requred"),
                e.keys().stream().map(StrictKeys.UnknownKey::key).toList());
        assertEquals(List.of("readOnly", "required"),
                e.keys().stream().map(StrictKeys.UnknownKey::suggestion).toList());
        assertTrue(e.getMessage().contains("page.form.sections[0].fields[0]"));
        assertTrue(e.getMessage().contains("required の間違い？"));
    }

    @Test
    void strictWorksOnAppDocumentsToo() {
        UnknownKeysException e = assertThrows(UnknownKeysException.class,
                () -> AppParser.parseAppYaml("""
                        app:
                          id: sales_admin
                          title: 販売管理
                          menu:
                            - { id: orders, label: 受注, page: order_search, ikon: list }
                          pages:
                            - { type: search, id: order_search, title: 受注照会, repository: orderRepository }
                        """, true));

        assertEquals("icon", e.keys().get(0).suggestion());
    }

    @Test
    void aCorrectDefinitionPassesStrict() {
        String yaml = """
                page:
                  type: form
                  id: customer_form
                  title: 顧客入力
                  repository: customerRepository
                  form:
                    sections:
                      - fields:
                          - { field: code, label: コード, required: true }
                """;
        assertEquals(
                DefinitionParser.parsePageYaml(yaml),
                DefinitionParser.parsePageYaml(yaml, true));
    }

    @Test
    void everyShippedExamplePassesStrict() throws IOException {
        for (String file : List.of("customer_master", "product_search", "dept_master",
                "customer_detail", "customer_form", "order_entry", "order_entry_paged",
                "customer_wizard", "sales_dashboard", "sales_report")) {
            String source = Files.readString(Path.of("../spec/examples/" + file + ".yaml"));
            DefinitionParser.parsePageYaml(source, true);
        }
        AppParser.parseAppYaml(
                Files.readString(Path.of("../spec/examples/sales_app.yaml")), true);
    }

    // --- キー表 vs スキーマ（ズレ防止） --------------------------------------

    @SuppressWarnings("unchecked")
    private static Map<String, Object> schema() throws IOException {
        return (Map<String, Object>) new Yaml()
                .load(Files.readString(Path.of("../spec/hatake-page.schema.json")));
    }

    /** 閉じたノードのキー集合。開いたノード（config など）は null。 */
    @SuppressWarnings("unchecked")
    private static Set<String> schemaKeys(Map<String, Object> schema, String node) {
        Map<String, Object> defs = (Map<String, Object>) schema.get("$defs");
        Map<String, Object> target;
        if (node.isEmpty()) {
            target = schema;
        } else if (node.contains(".")) {
            String[] parts = node.split("\\.");
            Map<String, Object> parent = (Map<String, Object>) defs.get(parts[0]);
            Map<String, Object> properties =
                    (Map<String, Object>) parent.get("properties");
            target = (Map<String, Object>) properties.get(parts[1]);
        } else {
            target = (Map<String, Object>) defs.get(node);
        }
        if (target == null || !Boolean.FALSE.equals(target.get("additionalProperties"))) {
            return null;
        }
        Map<String, Object> properties = (Map<String, Object>) target.get("properties");
        return properties == null ? Set.of() : new HashSet<>(properties.keySet());
    }

    @Test
    @SuppressWarnings("unchecked")
    void keyTableMatchesTheSchema() throws IOException {
        Map<String, Object> schema = schema();
        for (Map.Entry<String, Set<String>> entry : StrictKeys.TABLE.entrySet()) {
            Set<String> expected = schemaKeys(schema, entry.getKey());
            assertEquals(expected, entry.getValue(),
                    entry.getKey() + " のキーがスキーマと違う");
        }
        // 逆向き: スキーマが閉じているノードは全部チェック対象になっていること。
        Map<String, Object> defs = (Map<String, Object>) schema.get("$defs");
        for (String name : defs.keySet()) {
            if (schemaKeys(schema, name) != null) {
                assertTrue(StrictKeys.TABLE.containsKey(name), "未チェックのノード: " + name);
            }
        }
    }
}

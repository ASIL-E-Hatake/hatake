package io.hatake.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * {@link DtoSpec} を <b>JSON Schema 2020-12</b> のドキュメント 1 本に落とす。
 * TypeScript 版 {@code toJsonSchema} と同一出力になるよう
 * {@code spec/conformance/dto_json_schema.json} で機械確認している。
 *
 * <p>戻り値は素の {@link Map}。JSON 文字列化は呼び出し側の責務にしてあるので、
 * hatake 本体は JSON ライブラリに依存しない（{@code QuerySpec} → アダプタと同じ流儀）。
 */
public final class JsonSchemaEmitter {

    /** 出力ドキュメントが宣言する JSON Schema の方言。 */
    public static final String DIALECT = "https://json-schema.org/draft/2020-12/schema";

    /**
     * サーバが<b>受け取る</b>ペイロードの役割。これらは閉じる
     * （{@code additionalProperties: false}）ので想定外のキーはエラーになる。
     * レスポンス側は開いたままにして、バックエンドが項目を増やしても読み手が壊れないようにする。
     */
    private static final Set<String> STRICT_ROLES =
            Set.of("request", "queryParams", "pathParams", "child");

    /** 値そのものに載る制約キー。 */
    private static final List<String> CONSTRAINT_KEYS =
            List.of("maxLength", "minLength", "minimum", "maximum", "pattern", "format");

    private JsonSchemaEmitter() {
    }

    /**
     * すべての形を {@code $defs} に並べた 1 本のドキュメントにする
     * （形どうしが {@code $ref} で参照できるように）。
     */
    public static Map<String, Object> toJsonSchema(DtoSpec spec) {
        Map<String, Object> defs = new LinkedHashMap<>();
        for (DtoSpec.Shape shape : spec.shapes()) {
            defs.put(shape.name(), shapeSchema(shape));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("$schema", DIALECT);
        out.put("title", spec.page());
        out.put("$defs", defs);
        return out;
    }

    private static Map<String, Object> shapeSchema(DtoSpec.Shape shape) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("type", "object");
        if (STRICT_ROLES.contains(shape.role())) {
            out.put("additionalProperties", false);
        }

        List<String> required = new ArrayList<>();
        for (DtoSpec.Member m : shape.members()) {
            if (!m.optional()) {
                required.add(m.name());
            }
        }
        if (!required.isEmpty()) {
            out.put("required", List.copyOf(required));
        }

        Map<String, Object> properties = new LinkedHashMap<>();
        for (DtoSpec.Member m : shape.members()) {
            properties.put(m.name(), memberSchema(m));
        }
        out.put("properties", properties);
        return out;
    }

    private static Map<String, Object> memberSchema(DtoSpec.Member member) {
        if ("array".equals(member.type())) {
            // 配列の制約は要素側に載る（配列そのものではない）。
            Map<String, Object> items;
            if ("object".equals(member.itemType()) && member.shape() != null) {
                items = new LinkedHashMap<>();
                items.put("$ref", "#/$defs/" + member.shape());
            } else {
                items = new LinkedHashMap<>();
                items.put("type", member.itemType() == null ? "string" : member.itemType());
                applyConstraints(items, member);
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("type", "array");
            out.put("items", items);
            return out;
        }
        if ("object".equals(member.type()) && member.shape() != null) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("$ref", "#/$defs/" + member.shape());
            return out;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("type", member.type());
        applyConstraints(out, member);
        return out;
    }

    private static void applyConstraints(Map<String, Object> target, DtoSpec.Member member) {
        for (String key : CONSTRAINT_KEYS) {
            Object value = member.constraints().get(key);
            if (value != null) {
                target.put(key, value);
            }
        }
    }
}

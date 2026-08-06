package io.hatake.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * {@link DtoSpec} を <b>OpenAPI 3.1</b> のドキュメントに落とす。
 *
 * <p>3.0 ではなく 3.1 なのは、3.1 の Schema Object が <b>JSON Schema 2020-12 そのもの</b>
 * だから。{@link JsonSchemaEmitter} の出力をそのまま埋め込めて、{@code nullable} や
 * {@code exclusiveMinimum} の書き換え（ダウンコンバート）が要らず、{@code $ref} /
 * {@code format} / {@code additionalProperties} の意味も変わらない。
 *
 * <p>操作は<b>必要な形が存在するときだけ</b>出す。読み取り専用の {@code search} ページは
 * 一覧だけ、{@code form} ページは一覧なしになる。戻り値は素の {@link Map} で、
 * JSON 文字列化は呼び出し側の責務（hatake 本体は JSON ライブラリに依存しない）。
 *
 * <p>TypeScript 版 {@code toOpenApi} と同一出力になるよう
 * {@code spec/conformance/dto_openapi.json} で機械確認している。
 */
public final class OpenApiEmitter {

    /** 出力が宣言する OpenAPI のバージョン。 */
    public static final String VERSION = "3.1.0";

    /** OpenAPI がスキーマを置く場所＝{@code $ref} の指す先。 */
    private static final String REF_BASE = "#/components/schemas/";

    /** framework のバリデーション失敗ペイロードのスキーマ名。 */
    public static final String VALIDATION_ERROR_SCHEMA = "ValidationErrorResponse";

    /** ページング・ソートのパラメータ。{@code RepositoryQuery} の契約で決まっている。 */
    private static final List<String[]> QUERY_CONTRACT = List.of(
            new String[] {"page", "integer"},
            new String[] {"pageSize", "integer"},
            new String[] {"sortField", "string"},
            new String[] {"sortAscending", "boolean"});

    private OpenApiEmitter() {
    }

    /** {@code toOpenApi} のオプション。 */
    public record Options(String basePath, String title, String version) {

        /** パスを渡さない＝{@code components.schemas} だけ出す。 */
        public static Options schemasOnly() {
            return new Options(null, null, null);
        }

        public static Options basePath(String basePath) {
            return new Options(basePath, null, null);
        }
    }

    /**
     * @param options {@code basePath} は<b>呼び出し側が渡す</b>。DSL は URL を知らない
     *     （定義がトランスポートに依存してはいけない）ので、ページ id や repository キーから
     *     推測せず引数で受け取る。{@code null} なら {@code paths} を出さず
     *     {@code components.schemas} だけを返す。
     */
    public static Map<String, Object> toOpenApi(DtoSpec spec, Options options) {
        Map<String, Object> schemas = JsonSchemaEmitter.schemasOf(spec, REF_BASE);

        DtoSpec.Shape request = byRole(spec, "request");
        DtoSpec.Shape response = byRole(spec, "response");
        DtoSpec.Shape listResponse = byRole(spec, "listResponse");
        DtoSpec.Shape queryParams = byRole(spec, "queryParams");
        DtoSpec.Shape pathParams = byRole(spec, "pathParams");

        Map<String, Object> info = new LinkedHashMap<>();
        info.put("title", options.title() == null ? spec.page() : options.title());
        info.put("version", options.version() == null ? "1.0.0" : options.version());

        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("openapi", VERSION);
        doc.put("info", info);

        if (options.basePath() == null) {
            // スキーマのみ。ルートは呼び出し側が書く。
            doc.put("components", components(schemas));
            return doc;
        }

        if (request != null) {
            schemas.put(VALIDATION_ERROR_SCHEMA, validationErrorSchema());
        }

        String op = camel(spec.page());
        Map<String, Object> paths = new LinkedHashMap<>();

        Map<String, Object> collection = new LinkedHashMap<>();
        if (listResponse != null) {
            collection.put("get", listOperation(op, spec, listResponse, queryParams, schemas));
        }
        if (request != null) {
            Map<String, Object> post = new LinkedHashMap<>();
            post.put("operationId", op + "Create");
            post.put("summary", "Create " + spec.page());
            post.put("requestBody", requestBody(request.name(), "The record to create."));
            Map<String, Object> responses = new LinkedHashMap<>();
            responses.put("201", jsonBody(
                    (response == null ? request : response).name(), "The created record."));
            responses.put("400", jsonBody(VALIDATION_ERROR_SCHEMA, "Validation failed."));
            post.put("responses", responses);
            collection.put("post", post);
        }
        if (!collection.isEmpty()) {
            paths.put(options.basePath(), collection);
        }

        // 1件のルート。pathParams は主キー1件だけを持つ。
        String keyName = pathParams == null || pathParams.members().isEmpty()
                ? null
                : pathParams.members().get(0).name();
        if (keyName != null) {
            Map<String, Object> item = new LinkedHashMap<>();
            if (response != null) {
                Map<String, Object> get = new LinkedHashMap<>();
                get.put("operationId", op + "Get");
                get.put("summary", "Fetch one " + spec.page());
                get.put("parameters", List.of(pathParam(keyName)));
                Map<String, Object> responses = new LinkedHashMap<>();
                responses.put("200", jsonBody(response.name(), "The record."));
                responses.put("404", description("Not found."));
                get.put("responses", responses);
                item.put("get", get);
            }
            if (request != null) {
                Map<String, Object> put = new LinkedHashMap<>();
                put.put("operationId", op + "Update");
                put.put("summary", "Update " + spec.page());
                put.put("parameters", List.of(pathParam(keyName)));
                put.put("requestBody", requestBody(request.name(), "The new values."));
                Map<String, Object> putResponses = new LinkedHashMap<>();
                putResponses.put("200", jsonBody(
                        (response == null ? request : response).name(), "The updated record."));
                putResponses.put("400", jsonBody(VALIDATION_ERROR_SCHEMA, "Validation failed."));
                putResponses.put("404", description("Not found."));
                put.put("responses", putResponses);
                item.put("put", put);

                Map<String, Object> delete = new LinkedHashMap<>();
                delete.put("operationId", op + "Delete");
                delete.put("summary", "Delete " + spec.page());
                delete.put("parameters", List.of(pathParam(keyName)));
                Map<String, Object> delResponses = new LinkedHashMap<>();
                delResponses.put("204", description("Deleted."));
                delResponses.put("404", description("Not found."));
                delete.put("responses", delResponses);
                item.put("delete", delete);
            }
            if (!item.isEmpty()) {
                paths.put(options.basePath() + "/{" + keyName + "}", item);
            }
        }

        doc.put("paths", paths);
        doc.put("components", components(schemas));
        return doc;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> listOperation(
            String op,
            DtoSpec spec,
            DtoSpec.Shape listResponse,
            DtoSpec.Shape queryParams,
            Map<String, Object> schemas) {
        List<Object> parameters = new ArrayList<>();
        if (queryParams != null) {
            Map<String, Object> shape = (Map<String, Object>) schemas.get(queryParams.name());
            Map<String, Object> properties = (Map<String, Object>) shape.get("properties");
            for (DtoSpec.Member m : queryParams.members()) {
                Map<String, Object> param = new LinkedHashMap<>();
                param.put("name", m.name());
                param.put("in", "query");
                param.put("required", false);
                param.put("schema", properties.get(m.name()));
                parameters.add(param);
            }
        }
        for (String[] contract : QUERY_CONTRACT) {
            Map<String, Object> schema = new LinkedHashMap<>();
            schema.put("type", contract[1]);
            Map<String, Object> param = new LinkedHashMap<>();
            param.put("name", contract[0]);
            param.put("in", "query");
            param.put("required", false);
            param.put("schema", schema);
            parameters.add(param);
        }

        Map<String, Object> responses = new LinkedHashMap<>();
        responses.put("200", jsonBody(listResponse.name(), "A page of results."));

        Map<String, Object> get = new LinkedHashMap<>();
        get.put("operationId", op + "List");
        get.put("summary", "List " + spec.page());
        get.put("parameters", parameters);
        get.put("responses", responses);
        return get;
    }

    private static DtoSpec.Shape byRole(DtoSpec spec, String role) {
        for (DtoSpec.Shape shape : spec.shapes()) {
            if (shape.role().equals(role)) {
                return shape;
            }
        }
        return null;
    }

    private static Map<String, Object> components(Map<String, Object> schemas) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("schemas", schemas);
        return out;
    }

    private static Map<String, Object> pathParam(String name) {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "string");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("name", name);
        out.put("in", "path");
        out.put("required", true);
        out.put("schema", schema);
        return out;
    }

    private static Map<String, Object> ref(String name) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("$ref", REF_BASE + name);
        return out;
    }

    private static Map<String, Object> jsonBody(String name, String description) {
        Map<String, Object> media = new LinkedHashMap<>();
        media.put("schema", ref(name));
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("application/json", media);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("description", description);
        out.put("content", content);
        return out;
    }

    private static Map<String, Object> requestBody(String name, String description) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("required", true);
        out.putAll(jsonBody(name, description));
        return out;
    }

    private static Map<String, Object> description(String text) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("description", text);
        return out;
    }

    /** framework は検証失敗を {@code ValidationResult} で返す。 */
    private static Map<String, Object> validationErrorSchema() {
        Map<String, Object> field = new LinkedHashMap<>();
        field.put("type", "string");
        Map<String, Object> message = new LinkedHashMap<>();
        message.put("type", "string");
        Map<String, Object> errorProps = new LinkedHashMap<>();
        errorProps.put("field", field);
        errorProps.put("message", message);
        Map<String, Object> errorItem = new LinkedHashMap<>();
        errorItem.put("type", "object");
        errorItem.put("required", List.of("field", "message"));
        errorItem.put("properties", errorProps);

        Map<String, Object> errors = new LinkedHashMap<>();
        errors.put("type", "array");
        errors.put("items", errorItem);
        Map<String, Object> valid = new LinkedHashMap<>();
        valid.put("type", "boolean");
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("valid", valid);
        properties.put("errors", errors);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("type", "object");
        out.put("description",
                "Validation failure as reported by FormValidator (ValidationResult).");
        out.put("required", List.of("valid", "errors"));
        out.put("properties", properties);
        return out;
    }

    /** {@code customer_master} -> {@code customerMaster}（operationId 用）。 */
    private static String camel(String id) {
        StringBuilder sb = new StringBuilder();
        boolean first = true;
        for (String part : id.split("[_\\-\\s]+")) {
            if (part.isEmpty()) {
                continue;
            }
            if (first) {
                sb.append(part);
                first = false;
            } else {
                sb.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1));
            }
        }
        return sb.toString();
    }
}

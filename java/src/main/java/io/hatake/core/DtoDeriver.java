package io.hatake.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 画面定義から {@link DtoSpec}（API のペイロード形）を導出する。
 * TypeScript 版 {@code deriveDto} と同一の出力になるよう
 * {@code spec/conformance/dto_spec.json} で機械確認している。
 */
public final class DtoDeriver {

    private DtoDeriver() {
    }

    /**
     * 形の並び順は固定（言語間で比較できるようにするため）:
     * request → response → row → listResponse → queryParams → pathParams →
     * 子（{@code subTable}）の形（項目の宣言順、名前で重複排除）。
     */
    public static DtoSpec deriveDto(PageDefinition page) {
        String name = pascal(page.id());
        List<DtoSpec.Shape> shapes = new ArrayList<>();
        List<DtoSpec.Shape> children = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();

        List<FieldDefinition> fields = requestFields(page);
        List<DtoSpec.Member> requestMembers = new ArrayList<>();
        for (FieldDefinition field : fields) {
            DtoSpec.Member member = requestMember(page.id(), field);
            if (member != null) {
                requestMembers.add(member);
            }
        }
        if (!requestMembers.isEmpty()) {
            shapes.add(new DtoSpec.Shape(name + "Request", "request",
                    List.copyOf(requestMembers)));
            // 1件取得が返す形。項目は同じで「必ず入っている」の約束だけが違う。
            List<DtoSpec.Member> responseMembers = new ArrayList<>();
            for (FieldDefinition field : fields) {
                DtoSpec.Member member = responseMember(page.id(), field);
                if (member != null) {
                    responseMembers.add(member);
                }
            }
            shapes.add(new DtoSpec.Shape(name + "Response", "response",
                    List.copyOf(responseMembers)));
        }
        for (FieldDefinition field : fields) {
            if (!field.isSubTable()) {
                continue;
            }
            String shapeName = childShapeName(page.id(), field.field());
            if (!seen.add(shapeName)) {
                continue;
            }
            List<DtoSpec.Member> rows = new ArrayList<>();
            for (FieldDefinition rowField : field.rowFields()) {
                DtoSpec.Member member = requestMember(page.id(), rowField);
                if (member != null) {
                    rows.add(member);
                }
            }
            children.add(new DtoSpec.Shape(shapeName, "child", List.copyOf(rows)));
        }

        List<ColumnDefinition> columns = page.table() == null
                ? List.of()
                : page.table().columns();
        if (!columns.isEmpty()) {
            List<DtoSpec.Member> rowMembers = new ArrayList<>();
            for (ColumnDefinition column : columns) {
                rowMembers.add(new DtoSpec.Member(column.field(),
                        memberType(column.type()), false, null, null, Map.of()));
            }
            shapes.add(new DtoSpec.Shape(name + "Row", "row", List.copyOf(rowMembers)));
            // Repository の契約に合わせる: search() は items + totalCount を返す。
            shapes.add(new DtoSpec.Shape(name + "ListResponse", "listResponse", List.of(
                    new DtoSpec.Member("items", "array", false, "object",
                            name + "Row", Map.of()),
                    new DtoSpec.Member("totalCount", "number", false, null, null,
                            Map.of()))));
        }

        List<FilterDefinition> filters = page.search() == null
                ? List.of()
                : page.search().filters();
        if (!filters.isEmpty()) {
            List<DtoSpec.Member> queryMembers = new ArrayList<>();
            for (FilterDefinition filter : filters) {
                queryMembers.add(queryMember(filter));
            }
            shapes.add(new DtoSpec.Shape(name + "Query", "queryParams",
                    List.copyOf(queryMembers)));
        }

        // DSL は主キーの型を持たないので string として記述する。
        shapes.add(new DtoSpec.Shape(name + "Key", "pathParams", List.of(
                new DtoSpec.Member(page.keyField(), "string", false, null, null,
                        Map.of()))));

        shapes.addAll(children);
        return new DtoSpec(page.id(), List.copyOf(shapes));
    }

    /** リクエストに寄与する項目。ウィザードは全ステップを畳んだもの。 */
    private static List<FieldDefinition> requestFields(PageDefinition page) {
        if (page.form() == null) {
            return List.of();
        }
        // ウィザードの form はパーサが既に全ステップを畳んである。
        return page.form().fields();
    }

    /**
     * サーバが<b>受け取る</b>ペイロードのメンバ。
     *
     * <p>{@code readOnly} / {@code computed} も<b>含める</b>が常に optional にする。
     * framework 自身のクライアントはこれらを送る（{@code collect()} はドラフト全体を
     * 運び、computed 値を足す）ので、除外した閉じたスキーマは hatake 自身のペイロードを
     * 弾いてしまう。optional にすることで「あってもよい・必須ではない」と表現でき、
     * サーバは無視も再計算も自由にできる。
     */
    private static DtoSpec.Member requestMember(String pageId, FieldDefinition field) {
        // 子Repository方式の明細は別エンドポイントで動く。
        if (field.isSubTable() && field.hasSubTableSource()) {
            return null;
        }
        boolean derived = field.computed() != null || field.readOnly();
        String type = memberType(field.type());
        String itemType = null;
        String shape = null;
        if (field.isSubTable()) {
            itemType = "object";
            shape = childShapeName(pageId, field.field());
        } else if (FieldTypesRef.MULTI_SELECT.equals(field.type())) {
            itemType = "string";
        }
        return new DtoSpec.Member(field.field(), type, derived || !field.required(),
                itemType, shape, constraintsOf(field));
    }

    /**
     * サーバが<b>返す</b>ペイロードのメンバ。{@code required} はフォームの
     * {@code required} に一致させる（保存済みレコードなら必ず入っている項目）。
     * {@code computed} は Renderer が導出するのでサーバは送らなくてよい。
     */
    private static DtoSpec.Member responseMember(String pageId, FieldDefinition field) {
        DtoSpec.Member member = requestMember(pageId, field);
        if (member == null) {
            return null;
        }
        boolean optional = field.computed() != null || !field.required();
        return new DtoSpec.Member(member.name(), member.type(), optional,
                member.itemType(), member.shape(), member.constraints());
    }

    private static DtoSpec.Member queryMember(FilterDefinition filter) {
        String base = memberType(filter.type());
        Map<String, Object> constraints = new LinkedHashMap<>();
        String format = formatOf(filter.type());
        if (format != null) {
            constraints.put("format", format);
        }
        // between は [開始, 終了] の2要素で届く。
        if ("between".equals(filter.operator())) {
            return new DtoSpec.Member(filter.field(), "array", true, base, null,
                    Map.copyOf(constraints));
        }
        return new DtoSpec.Member(filter.field(), base, true, null, null,
                Map.copyOf(constraints));
    }

    /** field / filter の type を DTO のメンバ型へ対応付ける。 */
    private static String memberType(String type) {
        if (type == null) {
            return "string";
        }
        return switch (type) {
            case "number" -> "number";
            case "checkbox" -> "boolean";
            case "multiSelect", FieldDefinition.SUB_TABLE -> "array";
            // text / textarea / select / radio / date / dateTime / time と
            // プラグイン型は string に寄せる。
            default -> "string";
        };
    }

    /** date / dateTime / time は format 制約で形を伝える。 */
    private static String formatOf(String type) {
        if (type == null) {
            return null;
        }
        return switch (type) {
            case "date" -> "date";
            case "dateTime" -> "date-time";
            case "time" -> "time";
            default -> null;
        };
    }

    /** validators を JSON Schema 風の制約に翻訳する。 */
    private static Map<String, Object> constraintsOf(FieldDefinition field) {
        Map<String, Object> out = new LinkedHashMap<>();
        String format = formatOf(field.type());
        if (format != null) {
            out.put("format", format);
        }
        for (ValidatorDefinition rule : field.validators()) {
            switch (rule.type()) {
                case "maxLength" -> out.put("maxLength", rule.params().get("value"));
                case "minLength" -> out.put("minLength", rule.params().get("value"));
                case "min" -> out.put("minimum", rule.params().get("value"));
                case "max" -> out.put("maximum", rule.params().get("value"));
                case "pattern" -> out.put("pattern", rule.params().get("pattern"));
                case "email" -> out.put("format", "email");
                case "postalCode" -> out.put("pattern", "^[0-9]{3}-?[0-9]{4}$");
                // プラグインのバリデータはスキーマ上の意味を持たないので無視。
                default -> {
                }
            }
        }
        return out;
    }

    /** 明細の子の形の名前: {@code <Page><Field>Row}。 */
    private static String childShapeName(String pageId, String field) {
        return pascal(pageId) + pascal(field) + "Row";
    }

    /** {@code customer_master} -> {@code CustomerMaster}。 */
    private static String pascal(String id) {
        StringBuilder sb = new StringBuilder();
        for (String part : id.split("[_\\-\\s]+")) {
            if (part.isEmpty()) {
                continue;
            }
            sb.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1));
        }
        return sb.toString();
    }

    /** この版に FieldTypes 定数が無い分の補い。 */
    private static final class FieldTypesRef {
        private static final String MULTI_SELECT = "multiSelect";

        private FieldTypesRef() {
        }
    }
}

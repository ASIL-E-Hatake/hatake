package io.hatake.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * {@link DtoSpec} からネイティブな型宣言を吐く — TypeScript の {@code interface} と
 * Java の {@code record}。
 *
 * <p>両方のターゲットを両エディションから出せるようにしてあるのは意図的。出力は素の
 * テキストなので、どちらから生成しても<b>バイト一致</b>することをコンフォーマンスで
 * 確認できる（{@code spec/conformance/dto_native_types.json}）。
 *
 * <p>制約はバリデーション注釈ではなく <b>doc コメント</b>に載せる。ネイティブ型の価値は
 * 補完とコンパイル時安全性であって、実行時検証は {@link FormValidator} と
 * {@link JsonSchemaEmitter} の出力で既に解けている。注釈にすると生成コードが
 * {@code jakarta.validation} / Zod に依存してしまう。
 */
public final class TypeEmitter {

    /** 役割を生成コードの読み手向けの言葉にする。 */
    private static final Map<String, String> ROLE_DOC = Map.of(
            "request", "サーバが受け取る形",
            "response", "サーバが返す形",
            "row", "一覧の1行",
            "listResponse", "一覧のレスポンス",
            "queryParams", "検索クエリ",
            "pathParams", "パスパラメータ",
            "child", "明細の1行");

    private TypeEmitter() {
    }

    /** {@code toJavaRecords} のオプション。 */
    public record JavaOptions(String packageName) {

        /** {@code package} 文を出さない。 */
        public static JavaOptions none() {
            return new JavaOptions(null);
        }
    }

    // ------------------------------------------------------------- TypeScript

    /** すべての形を export された {@code interface} として吐く。 */
    public static String toTypeScript(DtoSpec spec) {
        List<String> lines = new ArrayList<>();
        lines.add("// Generated from the hatake definition \"" + spec.page()
                + "\". Do not edit by hand.");
        for (DtoSpec.Shape shape : spec.shapes()) {
            lines.add("");
            lines.add("/** " + shapeDoc(spec, shape) + " */");
            lines.add("export interface " + shape.name() + " {");
            for (DtoSpec.Member member : shape.members()) {
                lines.add("  /** " + memberDoc(member) + " */");
                lines.add("  " + member.name() + (member.optional() ? "?" : "")
                        + ": " + tsType(member) + ";");
            }
            lines.add("}");
        }
        return String.join("\n", lines) + "\n";
    }

    private static String tsType(DtoSpec.Member member) {
        if ("array".equals(member.type())) {
            if ("object".equals(member.itemType()) && member.shape() != null) {
                return member.shape() + "[]";
            }
            return (member.itemType() == null ? "string" : member.itemType()) + "[]";
        }
        if ("object".equals(member.type()) && member.shape() != null) {
            return member.shape();
        }
        return member.type();
    }

    // ------------------------------------------------------------------- Java

    /**
     * すべての形を {@code record} として、<b>1レコード＝1ファイル</b>でファイル名をキーに吐く。
     *
     * <p>Java は 1 ファイルに public なトップレベル型を 1 つしか置けないので、
     * まとめて 1 本にするとコンパイルできない。各ファイルは自分の package 文と、
     * <b>実際に使う import だけ</b>を持つ。
     */
    public static Map<String, String> toJavaRecords(DtoSpec spec, JavaOptions options) {
        Map<String, String> files = new LinkedHashMap<>();

        for (DtoSpec.Shape shape : spec.shapes()) {
            List<String> types = new ArrayList<>();
            for (DtoSpec.Member member : shape.members()) {
                types.add(javaType(member));
            }
            boolean needsList = types.stream().anyMatch(t -> t.startsWith("List<"));
            boolean needsBigDecimal = types.stream().anyMatch(t -> t.contains("BigDecimal"));

            List<String> lines = new ArrayList<>();
            if (options.packageName() != null) {
                lines.add("package " + options.packageName() + ";");
                lines.add("");
            }
            if (needsBigDecimal) {
                lines.add("import java.math.BigDecimal;");
            }
            if (needsList) {
                lines.add("import java.util.List;");
            }
            if (needsBigDecimal || needsList) {
                lines.add("");
            }
            lines.add("// Generated from the hatake definition \"" + spec.page()
                    + "\". Do not edit by hand.");
            lines.add("/** " + shapeDoc(spec, shape) + "。 */");
            lines.add("public record " + shape.name() + "(");
            List<DtoSpec.Member> members = shape.members();
            for (int i = 0; i < members.size(); i++) {
                DtoSpec.Member member = members.get(i);
                boolean last = i == members.size() - 1;
                lines.add("        /** " + memberDoc(member) + " */");
                lines.add("        " + javaType(member) + " " + member.name()
                        + (last ? ") {" : ","));
            }
            if (members.isEmpty()) {
                lines.add(") {");
            }
            lines.add("}");

            files.put(shape.name() + ".java", String.join("\n", lines) + "\n");
        }
        return files;
    }

    private static String javaScalar(String type) {
        if ("number".equals(type)) {
            // Double ではなく BigDecimal。DSL は整数と小数を区別せず、金額が主な用途なので
            // 丸め誤差の方が悪い失敗。computeTax / computeInvoice とも相性がよい。
            return "BigDecimal";
        }
        if ("boolean".equals(type)) {
            return "Boolean";
        }
        // 日付は String のまま: JSON に日付型は無く、実際に届くのは文字列。形式は
        // doc コメントと JSON Schema が伝える。
        return "String";
    }

    private static String javaType(DtoSpec.Member member) {
        if ("array".equals(member.type())) {
            if ("object".equals(member.itemType()) && member.shape() != null) {
                return "List<" + member.shape() + ">";
            }
            return "List<" + javaScalar(
                    member.itemType() == null ? "string" : member.itemType()) + ">";
        }
        if ("object".equals(member.type()) && member.shape() != null) {
            return member.shape();
        }
        return javaScalar(member.type());
    }

    // ------------------------------------------------------------- doc 文の生成

    private static String shapeDoc(DtoSpec spec, DtoSpec.Shape shape) {
        String role = ROLE_DOC.getOrDefault(shape.role(), shape.role());
        return spec.page() + " — " + role;
    }

    /** ラベルが無いメンバは項目名で代用する。 */
    private static String title(DtoSpec.Member member) {
        return member.label() == null || member.label().isEmpty()
                ? member.name()
                : member.label();
    }

    /** {@code コード — 必須、6文字以内} */
    private static String memberDoc(DtoSpec.Member member) {
        List<String> rest = notes(member);
        return rest.isEmpty() ? title(member) : title(member) + " — " + String.join("、", rest);
    }

    /**
     * ラベルの後ろに並べる注記。TypeScript 版と同じ言い回しになるよう、
     * 両ターゲットでこの1箇所を共有する。
     */
    private static List<String> notes(DtoSpec.Member member) {
        List<String> out = new ArrayList<>();
        if (!member.optional()) {
            out.add("必須");
        }
        Map<String, Object> c = member.constraints();
        if (c.get("maxLength") != null) {
            out.add(str(c.get("maxLength")) + "文字以内");
        }
        if (c.get("minLength") != null) {
            out.add(str(c.get("minLength")) + "文字以上");
        }
        Object min = c.get("minimum");
        Object max = c.get("maximum");
        if (min != null && max != null) {
            out.add(str(min) + "〜" + str(max));
        } else if (min != null) {
            out.add(str(min) + "以上");
        } else if (max != null) {
            out.add(str(max) + "以下");
        }
        if (c.get("format") instanceof String format) {
            switch (format) {
                case "date" -> out.add("date (yyyy-MM-dd)");
                case "date-time" -> out.add("date-time");
                case "time" -> out.add("time");
                case "email" -> out.add("email 形式");
                default -> {
                }
            }
        }
        if (c.get("pattern") != null) {
            out.add("形式: " + str(c.get("pattern")));
        }
        if (member.readOnly()) {
            out.add("readOnly（送ってもサーバは無視）");
        }
        if (member.computed()) {
            out.add("computed（Renderer が導出）");
        }
        return out;
    }

    private static String str(Object value) {
        return String.valueOf(value);
    }
}

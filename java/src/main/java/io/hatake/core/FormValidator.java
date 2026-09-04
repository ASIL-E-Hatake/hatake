package io.hatake.core;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Validates a data record against a form's rules — the backend counterpart to
 * the Flutter form validation, driven by the same definition.
 *
 * <p>明細（{@code type: subTable}）の子行も検証する。各行は項目の {@code rowFields}
 * から組み立てたフォームで検証し、エラーは添字付きパス（{@code lines[0].qty}）で報告する。
 * 入れ子の明細も同じ規約で再帰する。
 *
 * <p>ただし {@code source} 付きの明細（子行が別 Repository にある）は
 * <b>項目まるごと検証対象外</b>。値がこのレコードに無いので、項目自身の
 * {@code required} も含めて検証しても意味が無い。
 *
 * <p>条件も見る（ここだけ「条件は UI の話」から外れる）:
 * <ul>
 *   <li>{@code visibleWhen} で隠れている項目は<b>検証しない</b>。区画
 *       （{@code section.visibleWhen}）で隠れているときも同じ。見えない項目を必須に
 *       すると、入力できないのに保存できない画面になってしまう。</li>
 *   <li>{@code requiredWhen} が成立する項目は必須として扱う。</li>
 * </ul>
 *
 * <p>{@code mode} は {@code { mode: create }} / {@code { mode: edit }} の判定に使う状態。
 * POST / PUT で分かるので渡せる。渡さないと mode の条件は false になる＝その条件で
 * 隠れている扱いになり、検証は緩む方に倒れる。
 */
public final class FormValidator {

    public record ValidationError(String field, String message) {
    }

    public record ValidationResult(boolean valid, List<ValidationError> errors) {
    }

    private final ValidatorRegistry registry;

    public FormValidator() {
        this(new ValidatorRegistry());
    }

    public FormValidator(ValidatorRegistry registry) {
        this.registry = registry;
    }

    /** モードを問わない検証（{@code mode} の条件は false になる）。 */
    public ValidationResult validate(FormDefinition form, Map<String, Object> record) {
        return validate(form, record, null);
    }

    public ValidationResult validate(
            FormDefinition form, Map<String, Object> record, String mode) {
        List<ValidationError> errors = new ArrayList<>();
        // 項目名 から ラベル。項目間の検証のメッセージを画面の言葉で出すために先に集める。
        Map<String, String> labels = labelsOf(form);
        for (SectionDefinition section : form.sections()) {
            // 隠れている区画の項目は、この画面には無いものとして扱う。
            if (!matches(section.visibleWhen(), record, mode)) {
                continue;
            }
            for (FieldDefinition field : section.fields()) {
                validateField(field, record, mode, errors, labels);
            }
        }
        return new ValidationResult(errors.isEmpty(), errors);
    }

    /** 項目名 から ラベル。明細（rowFields）の項目も入れる（行の中の検証でも使う）。 */
    private static Map<String, String> labelsOf(FormDefinition form) {
        Map<String, String> labels = new java.util.LinkedHashMap<>();
        for (SectionDefinition section : form.sections()) {
            for (FieldDefinition field : section.fields()) {
                labels.put(field.field(), field.label());
                for (FieldDefinition row : field.rowFields()) {
                    labels.putIfAbsent(row.field(), row.label());
                }
            }
        }
        return labels;
    }

    private void validateField(
            FieldDefinition field,
            Map<String, Object> record,
            String mode,
            List<ValidationError> errors,
            Map<String, String> labels) {
        // 子行が別 Repository にある明細は、このレコードの一部ではない。
        if (field.isSubTable() && field.hasSubTableSource()) {
            return;
        }
        // 隠れている項目は検証しない（入力できないものは求められない）。
        if (!matches(field.visibleWhen(), record, mode)) {
            return;
        }
        Object value = record.get(field.field());
        List<ValidatorDefinition> rules = new ArrayList<>();
        if (field.required() || isRequiredByCondition(field, record, mode)) {
            rules.add(new ValidatorDefinition("required", Map.of(), null));
        }
        rules.addAll(field.validators());
        rules = inOrder(rules);
        ValidatorRegistry.ValidationContext context =
                new ValidatorRegistry.ValidationContext(record, labels, mode);
        for (ValidatorDefinition rule : rules) {
            String message = registry.run(value, rule, context);
            if (message != null) {
                errors.add(new ValidationError(
                        field.field(),
                        rule.message() != null ? rule.message() : message));
                break; // one error per field
            }
        }

        // 明細（master-detail）: 各行を rowFields で検証する。
        if (field.isSubTable() && !field.rowFields().isEmpty()) {
            errors.addAll(validateRows(field, value));
        }
    }

    /**
     * 出す順（1項目で複数落ちたとき、どれを出すか）。
     *
     * <p><b>自分の形の検証が先、他の項目に依る検証（compare）は後</b>。「開始日以上に
     * してください」より先に「日付の形が正しくありません」と言われないと、直す順番が
     * 分からない（形が読めない値を比べた結果は、そもそも当てにならない）。
     *
     * <p>同じ組の中では<b>書いた順</b>＝そこは書く人が決める。プラグインの検証は自分の
     * 形の側に置く（他の項目を見るかどうかを枠組みは知らないので、書いた場所を動かさない）。
     */
    private static List<ValidatorDefinition> inOrder(List<ValidatorDefinition> rules) {
        List<ValidatorDefinition> ordered = new ArrayList<>();
        for (ValidatorDefinition rule : rules) {
            if (!dependsOnOthers(rule)) {
                ordered.add(rule);
            }
        }
        for (ValidatorDefinition rule : rules) {
            if (dependsOnOthers(rule)) {
                ordered.add(rule);
            }
        }
        return ordered;
    }

    /** 他の項目の値を見る検証か（組み込みでは compare だけ）。 */
    private static boolean dependsOnOthers(ValidatorDefinition rule) {
        return "compare".equals(rule.type());
    }

    private boolean isRequiredByCondition(
            FieldDefinition field, Map<String, Object> record, String mode) {
        return field.requiredWhen() != null
                && ConditionEvaluator.evaluate(field.requiredWhen(), record, mode);
    }

    /** 条件が無ければ true（＝制限なし）。 */
    private static boolean matches(
            Map<String, Object> condition, Map<String, Object> record, String mode) {
        return condition == null || ConditionEvaluator.evaluate(condition, record, mode);
    }

    @SuppressWarnings("unchecked")
    private List<ValidationError> validateRows(FieldDefinition field, Object value) {
        List<ValidationError> errors = new ArrayList<>();
        if (!(value instanceof Iterable<?> rows)) {
            return errors;
        }
        FormDefinition rowForm = new FormDefinition(
                List.of(new SectionDefinition(null, field.rowFields())));
        int index = 0;
        for (Object row : rows) {
            if (row instanceof Map<?, ?> map) {
                // 行の条件は行のレコードで判定する。行の追加/編集は親のモードとは
                // 別物なので、mode は行には渡さない。
                for (ValidationError e : validate(rowForm, (Map<String, Object>) map).errors()) {
                    errors.add(new ValidationError(
                            field.field() + "[" + index + "]." + e.field(),
                            e.message()));
                }
            }
            index++;
        }
        return errors;
    }
}

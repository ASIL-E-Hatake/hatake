import { evaluateCondition } from "./conditionEvaluator.js";
import {
  FieldTypes,
  ValidatorTypes,
  type FieldDefinition,
  type FormDefinition,
  type ValidatorDefinition,
} from "./definition.js";
import { ValidatorRegistry } from "./validators.js";

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Validates a data record against a form's rules — the backend counterpart to
 * the Flutter form validation, driven by the same definition. Reports at most
 * one error per field.
 *
 * Child rows of a `subTable` field are validated too: each row is checked
 * against the field's `rowFields`, and errors are reported with an indexed
 * path — `lines[0].qty`. Nested sub-tables recurse with the same convention.
 *
 * A `subTable` with a `source` (repository-backed rows) is skipped entirely:
 * its rows live in another repository, not in this record, so validating them
 * here — including the field's own `required` — would be meaningless.
 *
 * 条件も見る（ここだけ「条件は UI の話」から外れる）:
 *
 * - `visibleWhen` で隠れている項目は**検証しない**。セクションの `visibleWhen`
 *   で隠れているときも同じ。見えない項目を必須にすると、入力できないのに保存
 *   できない画面になってしまう。
 * - `requiredWhen` が成立する項目は必須として扱う。
 *
 * `mode` は `{ mode: create }` / `{ mode: edit }` を判定するための状態。POST /
 * PUT で分かるので渡せる。渡さないと mode の条件は false になる＝その条件で隠れて
 * いる扱いになり、検証は緩む方に倒れる。
 *
 * 検証には**レコード全体と項目のラベル**を渡す（[ValidatorContext]）。項目間の検証
 * （`compare`）が他の項目の値を見るためと、メッセージを画面の言葉で出すため。
 */
export class FormValidator {
  constructor(private readonly registry: ValidatorRegistry = new ValidatorRegistry()) {}

  validate(
    form: FormDefinition,
    record: Record<string, unknown>,
    mode?: string,
  ): ValidationResult {
    const errors: ValidationError[] = [];
    // 項目名 → ラベル。項目間の検証のメッセージを画面の言葉で出すために先に集める。
    const labels = labelsOf(form);
    for (const section of form.sections) {
      // 隠れているセクションの項目は、この画面には無いものとして扱う。
      if (!matches(section.visibleWhen, record, mode)) continue;
      for (const field of section.fields) {
        this.validateField(field, record, mode, errors, labels);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  private validateField(
    field: FieldDefinition,
    record: Record<string, unknown>,
    mode: string | undefined,
    errors: ValidationError[],
    labels: Record<string, string>,
  ): void {
    // Repository-backed child rows are not part of this record.
    if (field.type === FieldTypes.subTable && field.source) return;
    // 隠れている項目は検証しない（入力できないものは求められない）。
    if (!matches(field.visibleWhen, record, mode)) return;

    const value = record[field.field];
    const requiredNow =
      field.required ||
      (field.requiredWhen !== undefined &&
        evaluateCondition(field.requiredWhen, record, mode));
    const rules = inOrder([
      ...(requiredNow
        ? [{ type: ValidatorTypes.required, params: {} } as ValidatorDefinition]
        : []),
      ...field.validators,
    ]);
    for (const rule of rules) {
      const message = this.registry.run(value, rule, { record, labels, mode });
      if (message !== null) {
        errors.push({ field: field.field, message: rule.message ?? message });
        break; // one error per field
      }
    }

    // Child rows (master-detail): validate each row against rowFields.
    if (field.type === FieldTypes.subTable && field.rowFields.length > 0) {
      const rowForm: FormDefinition = {
        sections: [{ columns: 1, fields: field.rowFields }],
      };
      const rows = Array.isArray(value) ? value : [];
      rows.forEach((row, index) => {
        if (!isRecord(row)) return;
        // 行の条件は行のレコードで判定する。行の追加/編集は親のモードとは
        // 別物なので、mode は行には渡さない。
        for (const error of this.validate(rowForm, row).errors) {
          errors.push({
            field: `${field.field}[${index}].${error.field}`,
            message: error.message,
          });
        }
      });
    }
  }
}

/** 他の項目の値を見る検証か（組み込みでは `compare` だけ）。 */
const dependsOnOthers = (rule: ValidatorDefinition): boolean =>
  rule.type === ValidatorTypes.compare;

/**
 * 出す順（1項目で複数落ちたとき、どれを出すか）。
 *
 * **自分の形の検証が先、他の項目に依る検証（`compare`）は後**。「開始日以上にして
 * ください」より先に「日付の形が正しくありません」と言われないと、直す順番が分からない
 * （形が読めない値を比べた結果は、そもそも当てにならない）。
 *
 * 同じ組の中では**書いた順**＝そこは書く人が決める。プラグインの検証は自分の形の側に
 * 置く（他の項目を見るかどうかを枠組みは知らないので、書いた場所を動かさない）。
 */
const inOrder = (rules: ValidatorDefinition[]): ValidatorDefinition[] => [
  ...rules.filter((rule) => !dependsOnOthers(rule)),
  ...rules.filter(dependsOnOthers),
];

/**
 * 項目名 → ラベル。
 *
 * 明細（`rowFields`）の項目も入れる。行の中の項目間の検証は行のフォームで回るので、
 * そこでも同じ表が作られるが、親側で「明細」のラベルが要る（「明細 の sum」と言うため）。
 */
function labelsOf(form: FormDefinition): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const section of form.sections) {
    for (const field of section.fields) {
      labels[field.field] = field.label;
      // 手で組んだフォーム（試験・Dart ビルダー経由）には rowFields が無いことがある。
      for (const row of field.rowFields ?? []) labels[row.field] ??= row.label;
    }
  }
  return labels;
}

/** 条件が無ければ true（＝制限なし）。 */
function matches(
  condition: Record<string, unknown> | undefined,
  record: Record<string, unknown>,
  mode: string | undefined,
): boolean {
  return condition === undefined || evaluateCondition(condition, record, mode);
}

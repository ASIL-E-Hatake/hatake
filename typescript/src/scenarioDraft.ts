// シナリオの**下書き**を定義から起こす。
//
// 器（`{ cases: [] }`）だけ渡されても、AI は業務の値を知らない（客先の語彙は定義に
// 無い）。けれど**制約は定義に書いてある**ので、境界のデータは機械が作れる:
//
//   ・必須を1つ空にした形（弾かれるはず）
//   ・文字数ぴったり／1文字超（`maxLength`）
//   ・同じ値の行を2つ（`unique`）
//   ・条件が成立した形（`requiredWhen` / `visibleWhen`）
//
// **下書きは「いまの答え」を写したもの。** 期待（`expect`）は動かした結果をそのまま
// 入れる＝すぐ回せる代わりに、**業務として正しいかは人が見る**（定義が間違っていれば、
// 間違ったまま写る）。だから各件に「何から作ったか」を書いておく。
//
// 形が決まっている項目（`pattern`）は**値を作らない**（`TODO_<項目>` を置く）。
// 正規表現を満たす文字列を機械が作ると、業務としてあり得ない値になる。

import {
  FieldTypes,
  ValidatorTypes,
  formFields,
  type FieldDefinition,
  type FormDefinition,
  type PageDefinition,
  type ValidatorDefinition,
} from "./definition.js";
import {
  compareAnswer,
  formOf,
  runCase,
  type ScenarioCase,
  type ScenarioFile,
  type ScenarioRegistries,
} from "./scenario.js";

/** 下書きが作る件数の上限（多すぎると読まれない）。 */
export const DRAFT_CASE_LIMIT = 12;

const rule = (
  field: FieldDefinition,
  type: string,
): ValidatorDefinition | undefined =>
  field.validators.find((one) => one.type === type);

const num = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

/** その項目の「それらしい値」。形が決まっているものは作らない（`TODO_` を置く）。 */
function plausible(field: FieldDefinition): unknown {
  if (rule(field, ValidatorTypes.pattern) !== undefined) {
    return `TODO_${field.field}`;
  }
  switch (field.type) {
    case FieldTypes.number: {
      const min = num(rule(field, ValidatorTypes.min)?.params.value);
      const max = num(rule(field, ValidatorTypes.max)?.params.value);
      if (min !== undefined) return min;
      if (max !== undefined) return Math.min(1, max);
      return 1;
    }
    case FieldTypes.checkbox:
      // 印は**立てない**のが基本形（`取消` のような印を既定で立てると、合計が 0 の
      // 下書きが出て「計算が壊れている」ように見える）。立てた形は別の件で作る。
      return false;
    case FieldTypes.date:
      return "2026-01-05";
    case FieldTypes.dateTime:
      return "2026-01-05T09:00";
    case FieldTypes.time:
      return "09:00";
    case FieldTypes.select:
    case FieldTypes.radio:
      return field.options[0]?.value ?? `TODO_${field.field}`;
    case FieldTypes.multiSelect: {
      const first = field.options[0]?.value;
      return first === undefined ? [`TODO_${field.field}`] : [first];
    }
    case FieldTypes.subTable:
      return [row(field)];
    default: {
      if (rule(field, ValidatorTypes.email) !== undefined) return "test@example.com";
      if (rule(field, ValidatorTypes.postalCode) !== undefined) return "1234567";
      const minLength = num(rule(field, ValidatorTypes.minLength)?.params.value);
      const maxLength = num(rule(field, ValidatorTypes.maxLength)?.params.value);
      if (minLength !== undefined) return "X".repeat(minLength);
      if (maxLength !== undefined && maxLength < 3) return "X".repeat(maxLength);
      return "テスト";
    }
  }
}

/** 明細の1行（行の項目を同じ規則で埋める。行の中の計算は当てない＝道具が出す）。 */
function row(field: FieldDefinition): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const one of field.rowFields) {
    if (one.computed !== undefined) continue;
    out[one.field] = plausible(one);
  }
  return out;
}

/** 手で入れる項目（計算項目と、別テーブルに持つ明細は入れない）。 */
const typedIn = (form: FormDefinition): FieldDefinition[] =>
  formFields(form).filter(
    (field) =>
      field.computed === undefined &&
      !(field.type === FieldTypes.subTable && field.source !== undefined),
  );

/** 全部埋めた1件（通るはずの形）。 */
function filled(form: FormDefinition): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const field of typedIn(form)) {
    record[field.field] = plausible(field);
  }
  return record;
}

/** 条件のリーフ（`{ field, operator, value }`）を満たす値。組み合わせは見ない。 */
function leafValue(
  condition: Record<string, unknown>,
): { field: string; value: unknown } | undefined {
  const field = condition.field;
  const operator = condition.operator ?? "equals";
  if (typeof field !== "string") return undefined;
  if (operator !== "equals") return undefined;
  return { field, value: condition.value };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * 下書きを作る。**件数は [DRAFT_CASE_LIMIT] で切る**（読まれない量を出さない）。
 *
 * 期待は動かした結果を写す（[ScenarioFile] に入れて返す）。作った理由は `$comment`。
 */
export function draftScenario(
  page: PageDefinition,
  registries: ScenarioRegistries = {},
): { file: ScenarioFile; todo: string[] } {
  const form = formOf(page);
  const todo: string[] = [];
  if (form === undefined) {
    return {
      file: {
        $comment:
          `${page.kind} の画面には入力の枠がないので、入れる値がありません` +
          `（シナリオで確かめられるのは、値を入れる画面です）。`,
        cases: [],
      },
      todo: [],
    };
  }

  const base = filled(form);
  const cases: ScenarioCase[] = [
    {
      name: "全部埋めた（通るはず）",
      $comment: "定義の制約から作った値。業務としてあり得る値かは人が見る。",
      record: base,
    },
  ];

  // 必須を1つずつ空にする（弾かれるはず）。
  for (const field of typedIn(form)) {
    if (!field.required) continue;
    const record = { ...base };
    delete record[field.field];
    cases.push({
      name: `必須の「${field.label}」を空にした`,
      $comment: "required は画面でも API でも同じ規則で効く（同じ定義を読むので）。",
      record,
    });
  }

  // 文字数の境界（ぴったり／1文字超）。
  for (const field of typedIn(form)) {
    const max = num(rule(field, ValidatorTypes.maxLength)?.params.value);
    if (max === undefined) continue;
    cases.push({
      name: `「${field.label}」が ${max} 文字ぴったり`,
      $comment: "境界は「通る側」も試す（片側だけだと、緩めたことに気づけない）。",
      record: { ...base, [field.field]: "X".repeat(max) },
    });
    cases.push({
      name: `「${field.label}」が ${max + 1} 文字`,
      $comment: "1文字超えたら弾かれるはず。",
      record: { ...base, [field.field]: "X".repeat(max + 1) },
    });
  }

  // 明細の行の必須を空にする（親の必須を空にしても、行の中の検証は落ちない）。
  for (const field of typedIn(form)) {
    if (field.type !== FieldTypes.subTable) continue;
    const rowRequired = field.rowFields.find(
      (one) => one.required && one.computed === undefined,
    );
    if (rowRequired === undefined) continue;
    const one = row(field);
    delete one[rowRequired.field];
    cases.push({
      name: `明細「${field.label}」の1行目で必須の「${rowRequired.label}」を空にした`,
      $comment:
        "行の中のエラーは <項目>[<行番号>].<行の項目> で返る（行番号は 0 から）。",
      record: { ...base, [field.field]: [one] },
    });
  }

  // 印を立てた形（`checkbox` は既定で立てないので、立てた側をここで作る）。
  for (const field of typedIn(form)) {
    if (field.type !== FieldTypes.subTable) continue;
    const flag = field.rowFields.find(
      (one) => one.type === FieldTypes.checkbox && one.computed === undefined,
    );
    if (flag === undefined) continue;
    cases.push({
      name: `明細「${field.label}」の1行目に「${flag.label}」の印を立てた`,
      $comment:
        "畳む前に行を絞る条件（where）の反対側。印を立てた行が合計から外れるかを見る。",
      record: { ...base, [field.field]: [{ ...row(field), [flag.field]: true }] },
    });
  }

  // 行どうしの規則（同じ値の行を2つ）。
  for (const field of typedIn(form)) {
    const unique = rule(field, ValidatorTypes.unique);
    const of = unique?.params.of;
    if (unique === undefined || typeof of !== "string") continue;
    const one = row(field);
    cases.push({
      name: `「${field.label}」に同じ ${of} の行が2つ`,
      $comment: "行の中の検証は1行ずつしか見ないので、これは行どうしの規則だけが拾う。",
      record: { ...base, [field.field]: [one, { ...one }] },
    });
  }

  // 条件が成立した形（`requiredWhen` / `visibleWhen`）。リーフだけ作る。
  for (const field of typedIn(form)) {
    for (const [key, label] of [
      ["requiredWhen", "必須になる"],
      ["visibleWhen", "出る"],
    ] as const) {
      const condition = field[key];
      if (!isRecord(condition)) continue;
      const leaf = leafValue(condition);
      if (leaf === undefined) {
        todo.push(
          `「${field.label}」の ${key} は組み合わせ条件（all / any / not）なので、` +
            `成立する形は人が書いてください。`,
        );
        continue;
      }
      cases.push({
        name: `${leaf.field} が ${JSON.stringify(leaf.value)}（「${field.label}」が${label}）`,
        $comment: `${key} が成立した形。反対の形は「全部埋めた」が持っている。`,
        record: { ...base, [leaf.field]: leaf.value },
      });
    }
  }

  const kept = cases.slice(0, DRAFT_CASE_LIMIT);
  if (cases.length > kept.length) {
    todo.push(
      `作れる形は ${cases.length} 件ありましたが、${DRAFT_CASE_LIMIT} 件で切りました` +
        `（残りは hatake run --cover が「まだ試していない所」として挙げます）。`,
    );
  }

  // 期待は**動かした結果**を写す（すぐ回せる形にする）。合わない期待は書かない。
  for (const one of kept) {
    const answer = runCase(page, one, registries);
    one.expect = {
      errors: answer.errors,
      ...(Object.keys(answer.computed).length > 0
        ? { computed: answer.computed }
        : {}),
      ...(answer.hidden.length > 0 ? { hidden: answer.hidden } : {}),
      ...(answer.required.length > 0 ? { required: answer.required } : {}),
    };
    // 写したものが本当に通ることを、その場で確かめる（下書きが最初から落ちない）。
    const mismatches = compareAnswer(one.expect, answer);
    if (mismatches.length > 0) {
      todo.push(
        `「${one.name}」の期待を写せませんでした（道具の不具合です。中身を見てください）。`,
      );
    }
    for (const line of answer.cannot) todo.push(line);
  }

  return {
    file: {
      $comment:
        "hatake run --draft が作った下書き。**期待はいまの答えを写したもの**なので、" +
        "「業務としてこれが正しいか」は人が見てから使ってください。",
      ...(page.id !== undefined ? { page: page.id } : {}),
      cases: kept,
    },
    todo: [...new Set(todo)],
  };
}

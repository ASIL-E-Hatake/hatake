// まだ試していない分岐から、**次に書く1件**を起こす（`run --cover --draft`）。
//
// `--cover` は「まだ見ていない側」を挙げる所まで来たが、そこから**書くのは人**だった。
// 判断を投げられた AI は止まるか勝手に決める（後者のほうが悪い）ので、挙げた時点で
// 読めている条件から1件ずつ起こす。
//
// いちばん大事な決めごとは**起こしたものを実際に回して確かめる**こと。分岐が埋まらな
// かった下書きは配らず、「起こせなかった」として理由つきで並べる ── 当たっていない
// 下書きを配ると、`--cover` が永久にゼロにならない道具になる（それは嘘をつくのと同じ）。
//
// 起こせないものも決まっている:
//   ・**組み合わせの条件**（`all` / `any` / `not`）… どのリーフを動かすかは意図なので人
//   ・**明細の行に対する条件**（`computed.where`）… 行を作る話で、レコードに1つ値を
//     置いても動かない
//   ・**計算が値を出す形**… 計算の中身（プラグイン）は枠組みの外
//   ・`equals` 以外のリーフ… 満たす値が1つに決まらない（`gte` は無限にある）

import {
  formFields,
  type FieldDefinition,
  type FormDefinition,
  type PageDefinition,
} from "./definition.js";
import { plausible, row, ruleOf } from "./fieldValues.js";
import { ValidatorTypes } from "./definition.js";
import {
  formOf,
  runCase,
  type ScenarioAnswer,
  type ScenarioCase,
  type ScenarioFile,
  type ScenarioRegistries,
} from "./scenario.js";
import { coverScenario, type CoverPoint, type CoverReport } from "./scenarioCover.js";

/** 起こす件数の上限（`--draft` と同じ考え＝読まれない量を出さない）。 */
export const COVER_DRAFT_LIMIT = 12;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 条件のリーフ（`{ field, operator: equals, value }`）。組み合わせは見ない。 */
function leaf(
  condition: Record<string, unknown>,
): { field: string; value: unknown } | null {
  const field = condition.field;
  const operator = condition.operator ?? "equals";
  if (typeof field !== "string" || operator !== "equals") return null;
  return { field, value: condition.value };
}

/** その項目に「この値ではない」値（条件を**成立させない**ために要る）。 */
function otherThan(field: FieldDefinition | undefined, value: unknown): unknown {
  const options = field?.options;
  if (Array.isArray(options)) {
    const other = options.find((one) => one.value !== value);
    if (other !== undefined) return other.value;
  }
  if (typeof value === "number") return value + 1;
  if (typeof value === "boolean") return !value;
  return `${String(value)}_ではない`;
}

/** 全部埋めた1件（起こす下書きの土台）。 */
function base(form: FormDefinition): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const field of formFields(form)) {
    if (field.computed !== undefined) continue;
    record[field.field] = plausible(field);
  }
  return record;
}

/** 1件ぶんの候補（回して確かめる前のもの）。 */
interface Candidate {
  point: CoverPoint;
  side: string;
  one: ScenarioCase;
}

/** 起こせなかった分岐1件。 */
export interface CoverDraftSkipped {
  at: string;
  missing: string;
  why: string;
}

export interface CoverDraftResult {
  /** そのまま `--scenario` に渡せる形。 */
  file: ScenarioFile;
  /** 埋めた分岐（起こした件と、どの側を埋めたか）。 */
  filled: { at: string; side: string; name: string }[];
  /** 起こせなかったもの（黙って落とさない）。 */
  skipped: CoverDraftSkipped[];
  /** 人がやること。 */
  todo: string[];
}

/**
 * まだ見ていない側から下書きを起こす。
 *
 * `cases` / `answers` は**いま回したもの**をそのまま渡す（`--cover` と同じ答えを見る
 * ため。ここで作り直すと、道具が2回計算して答えがずれる元になる）。
 */
export function draftForCover(
  page: PageDefinition,
  report: CoverReport,
  cases: ScenarioCase[],
  answers: ScenarioAnswer[],
  registries: ScenarioRegistries = {},
): CoverDraftResult {
  const form = formOf(page);
  const skipped: CoverDraftSkipped[] = [];
  const todo: string[] = [];
  if (form === undefined) {
    return {
      file: { $comment: "入力の枠が無い画面なので、入れる値がありません。", cases: [] },
      filled: [],
      skipped: [],
      todo: [],
    };
  }
  const fields = new Map(formFields(form).map((one) => [one.field, one]));
  const start = base(form);
  const candidates: Candidate[] = [];

  for (const point of report.pending) {
    for (const side of point.missing) {
      const made = candidate(point, side, start, fields);
      if (typeof made === "string") {
        skipped.push({ at: point.at, missing: side, why: made });
        continue;
      }
      candidates.push({ point, side, one: made });
    }
  }

  // **回して確かめる。** 埋まらなかった下書きは配らない（当たっていない下書きを配ると、
  // --cover が永久にゼロにならない）。1件ずつ足して、その分岐が埋まったかを見る。
  const kept: Candidate[] = [];
  const filled: CoverDraftResult["filled"] = [];
  const runCases = [...cases];
  const runAnswers = [...answers];
  for (const made of candidates) {
    if (kept.length >= COVER_DRAFT_LIMIT) break;
    const answer = runCase(page, made.one, registries);
    const after = coverScenario(
      page,
      [...runCases, made.one],
      [...runAnswers, answer],
    );
    const still = after.points.find((one) => one.at === made.point.at);
    if (still !== undefined && still.missing.includes(made.side)) {
      skipped.push({
        at: made.point.at,
        missing: made.side,
        why:
          "起こした形を回しても、その側は埋まりませんでした" +
          "（条件が他の値にも依っています＝ここは人が書いてください）",
      });
      continue;
    }
    made.one.expect = {
      errors: answer.errors.map((error) => ({
        field: error.field,
        message: error.message,
      })),
    };
    kept.push(made);
    runCases.push(made.one);
    runAnswers.push(answer);
    filled.push({ at: made.point.at, side: made.side, name: made.one.name });
  }

  const left = candidates.length - kept.length - 0;
  if (left > COVER_DRAFT_LIMIT) {
    todo.push(
      `起こせる形は他にもありますが、${COVER_DRAFT_LIMIT} 件で切りました` +
        "（回してから、もう一度 --cover --draft を呼んでください）。",
    );
  }
  if (skipped.length > 0) {
    todo.push(
      `${skipped.length} 件は機械では起こせませんでした（下の理由つきの一覧）。` +
        "組み合わせの条件と、明細の行に対する条件は**どれを動かすかが意図**なので、" +
        "人が書いてください。",
    );
  }

  return {
    file: {
      $comment:
        "hatake run --cover --draft が**まだ試していない分岐**から起こした下書き。" +
        "期待（expect）は動かした結果を写したものなので、**業務として正しいかは人が" +
        "見てください**（定義が間違っていれば、間違ったまま写ります）。",
      cases: kept.map((one) => one.one),
    },
    filled,
    skipped,
    todo,
  };
}

/** 1件作る。作れなければ理由（文字）を返す。 */
function candidate(
  point: CoverPoint,
  side: string,
  start: Record<string, unknown>,
  fields: Map<string, FieldDefinition>,
): ScenarioCase | string {
  const source = point.source;
  if (source === undefined) return "この分岐は定義から値を作れません";
  if (source.kind === "computed") {
    return "計算が値を出す形は、計算の中身（プラグイン）次第なので作れません";
  }
  if (source.kind === "validators") {
    const field = fields.get(source.field);
    if (field === undefined) return "その項目が入力の枠にありません";
    if (side === "通った") {
      return {
        name: `「${field.label}」が通る形`,
        $comment: "検証の通る側。全部埋めた形と同じ値。",
        record: { ...start },
      };
    }
    if (field.required) {
      const record = { ...start };
      delete record[field.field];
      return {
        name: `必須の「${field.label}」を空にした`,
        $comment: "検証の落ちる側。required は画面でも API でも同じ規則で効く。",
        record,
      };
    }
    const max = ruleOf(field, ValidatorTypes.maxLength)?.params.value;
    if (typeof max === "number") {
      return {
        name: `「${field.label}」が ${max + 1} 文字`,
        $comment: "検証の落ちる側。文字数を1つ超えた形。",
        record: { ...start, [field.field]: "X".repeat(max + 1) },
      };
    }
    return (
      "落ちる値が定義から決まりません" +
      "（必須でも文字数でもない検証は、業務の値を知らないと作れません）"
    );
  }
  if (source.kind === "rowValidators") {
    const field = fields.get(source.field);
    const rowField = field?.rowFields?.find((one) => one.field === source.rowField);
    if (field === undefined || rowField === undefined) {
      return "その明細か、行の項目が入力の枠にありません";
    }
    const one = row(field);
    if (side === "通った") {
      return {
        name: `明細「${field.label}」の1行目が通る形`,
        $comment: "行の中の検証の通る側。行の値は定義の制約から作ってある。",
        record: { ...start, [field.field]: [one] },
      };
    }
    if (rowField.required) {
      delete one[rowField.field];
      return {
        name: `明細「${field.label}」の1行目で必須の「${rowField.label}」を空にした`,
        $comment:
          "行の中のエラーは <項目>[<行番号>].<行の項目> で返る（行番号は 0 から）。",
        record: { ...start, [field.field]: [one] },
      };
    }
    const max = ruleOf(rowField, ValidatorTypes.maxLength)?.params.value;
    if (typeof max === "number") {
      return {
        name: `明細「${field.label}」の1行目の「${rowField.label}」が ${max + 1} 文字`,
        $comment: "行の中の検証の落ちる側。文字数を1つ超えた形。",
        record: {
          ...start,
          [field.field]: [{ ...one, [rowField.field]: "X".repeat(max + 1) }],
        },
      };
    }
    const min = ruleOf(rowField, ValidatorTypes.min)?.params.value;
    if (typeof min === "number") {
      return {
        name: `明細「${field.label}」の1行目の「${rowField.label}」が ${min - 1}`,
        $comment: "行の中の検証の落ちる側。下限を1つ下回った形。",
        record: {
          ...start,
          [field.field]: [{ ...one, [rowField.field]: min - 1 }],
        },
      };
    }
    return (
      "落ちる値が定義から決まりません" +
      "（必須でも文字数でも下限でもない検証は、業務の値を知らないと作れません）"
    );
  }
  // 条件（`visibleWhen` / `requiredWhen` / `enabledWhen` / `where`）。
  if (source.on === "row") {
    return "明細の**行**に対する条件なので、レコードに値を置いても動きません（行を作る話です）";
  }
  const one = leaf(source.condition);
  if (one === null) {
    return "組み合わせの条件（all / any / not）か、equals 以外のリーフです";
  }
  const field = fields.get(one.field);
  const holds = side === "成立した";
  const value = holds ? one.value : otherThan(field, one.value);
  return {
    name: `${one.field} が ${JSON.stringify(value)}（${point.what}が${
      holds ? "成立する" : "成立しない"
    }形）`,
    $comment: `${point.at} の「${side}」側。条件のリーフだけを動かしてある。`,
    record: { ...start, [one.field]: value },
  };
}

/** 人が読む形。 */
export function coverDraftLines(result: CoverDraftResult): string[] {
  const out: string[] = [];
  if (result.file.cases.length === 0) {
    out.push("起こせる下書きはありませんでした。");
  } else {
    out.push(`まだ試していない分岐から ${result.file.cases.length} 件起こしました:`);
    for (const one of result.filled) {
      out.push(`  ・${one.at} の「${one.side}」側  ← ${one.name}`);
    }
  }
  if (result.skipped.length > 0) {
    out.push("");
    out.push("起こせなかった分岐（人が書いてください）:");
    for (const one of result.skipped) {
      out.push(`  ・${one.at} の「${one.missing}」側 … ${one.why}`);
    }
  }
  if (result.todo.length > 0) {
    out.push("");
    for (const one of result.todo) out.push(`・${one}`);
  }
  out.push("");
  out.push(COVER_DRAFT_NOTE);
  return out;
}

/** この下書きが何で、何でないかを毎回書く。 */
export const COVER_DRAFT_NOTE =
  "※ 起こした形は**回して確かめてあります**（その分岐が本当に埋まることを見てから" +
  "配っています）。期待（expect）は**いまの答えを写したもの**なので、業務として" +
  "正しいかは人が見てください。組み合わせの条件と明細の行に対する条件は、" +
  "**どれを動かすかが意図**なので機械では起こしません。";

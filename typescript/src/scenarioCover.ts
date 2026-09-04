// **まだ試していない所**を、定義の分岐から数える。
//
// AI は「もう十分書いた」の判断ができない（人も同じ）。行数で数えるカバレッジは
// 定義ファーストでは意味が薄いので、**定義が持っている分岐**で数える:
//
//   ・条件（`visibleWhen` / `requiredWhen` / `enabledWhen` / `computed.where`）は
//     **成立した形と、しなかった形の両方**
//   ・検証は**通った形と、落ちた形の両方**（項目ごと。1項目1件しか出ないので、
//     どの規則で落ちたかまでは数えない＝そう書いておく）
//   ・計算項目は**値が出たか**
//
// 落とすための道具ではない（好みではなく「まだ見ていない」を挙げるだけ）。次に書く
// シナリオが決まるのが値打ち。

import { evaluateCondition } from "./conditionEvaluator.js";
import {
  ActionScopes,
  FieldTypes,
  formFields,
  type PageDefinition,
} from "./definition.js";
import { formOf, type ScenarioAnswer, type ScenarioCase } from "./scenario.js";

/** 数える分岐1つ。 */
export interface CoverPoint {
  /** どこか（`page.form.fields[2].visibleWhen` のような道）。 */
  at: string;
  /** 何を見ているか（人が読む言葉）。 */
  what: string;
  /** 見た側（条件なら true / false、検証なら 通った / 落ちた）。 */
  seen: string[];
  /** まだ見ていない側。 */
  missing: string[];
}

export interface CoverReport {
  points: CoverPoint[];
  /** まだ見ていない側がある分岐だけ。 */
  pending: CoverPoint[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const BOTH = ["成立した", "しなかった"];
const PASSED_FAILED = ["通った", "落ちた"];

/**
 * シナリオが**定義の分岐をどれだけ通ったか**。
 *
 * 答え（[answers]）は [runCase] が返したものをそのまま渡す＝同じ順で回したものを見る
 * （道具が2回計算しないため。答えの作り方は1か所に置く）。
 */
export function coverScenario(
  page: PageDefinition,
  cases: ScenarioCase[],
  answers: ScenarioAnswer[],
): CoverReport {
  const points: CoverPoint[] = [];
  const add = (at: string, what: string, sides: string[], seen: Set<string>): void => {
    points.push({
      at,
      what,
      seen: sides.filter((side) => seen.has(side)),
      missing: sides.filter((side) => !seen.has(side)),
    });
  };

  const form = formOf(page);
  if (form !== undefined) {
    form.sections.forEach((section, s) => {
      if (isRecord(section.visibleWhen)) {
        const seen = new Set<string>();
        answers.forEach((answer, i) => {
          const holds = evaluateCondition(
            section.visibleWhen as Record<string, unknown>,
            answer.record,
            cases[i].mode,
          );
          seen.add(holds ? BOTH[0] : BOTH[1]);
        });
        add(
          `form.sections[${s}].visibleWhen`,
          `枠「${section.title ?? s}」が出る条件`,
          BOTH,
          seen,
        );
      }
    });

    for (const field of formFields(form)) {
      for (const [key, what] of [
        ["visibleWhen", "が出る条件"],
        ["requiredWhen", "が必須になる条件"],
      ] as const) {
        const condition = field[key];
        if (!isRecord(condition)) continue;
        const seen = new Set<string>();
        answers.forEach((answer, i) => {
          const holds = evaluateCondition(condition, answer.record, cases[i].mode);
          seen.add(holds ? BOTH[0] : BOTH[1]);
        });
        add(`${field.field}.${key}`, `「${field.label}」${what}`, BOTH, seen);
      }

      // 畳む前に行を絞る条件（`where`）。行ごとに見る（1行でも残れば「成立した」）。
      const where = field.computed?.where;
      if (isRecord(where)) {
        const seen = new Set<string>();
        for (const answer of answers) {
          const rows = answer.record[String(field.computed?.field)];
          if (!Array.isArray(rows)) continue;
          for (const raw of rows) {
            if (!isRecord(raw)) continue;
            seen.add(evaluateCondition(where, raw) ? BOTH[0] : BOTH[1]);
          }
        }
        add(
          `${field.field}.computed.where`,
          `「${field.label}」が畳む行を絞る条件`,
          BOTH,
          seen,
        );
      }

      if (field.computed !== undefined) {
        const seen = new Set<string>();
        for (const answer of answers) {
          const value = answer.computed[field.field];
          seen.add(value === undefined || value === null ? "空だった" : "値が出た");
        }
        add(
          `${field.field}.computed`,
          `「${field.label}」の計算`,
          ["値が出た"],
          seen,
        );
      }

      if (field.validators.length === 0 && !field.required) continue;
      const seen = new Set<string>();
      answers.forEach((answer, i) => {
        if (answer.hidden.includes(field.field)) return;
        const failed = answer.errors.some(
          (error) =>
            error.field === field.field ||
            error.field.startsWith(`${field.field}[`),
        );
        seen.add(failed ? PASSED_FAILED[1] : PASSED_FAILED[0]);
        void i;
      });
      add(
        `${field.field}.validators`,
        `「${field.label}」の検証（どの規則で落ちたかまでは数えない）`,
        PASSED_FAILED,
        seen,
      );
    }
  }

  const actions = "actions" in page ? page.actions : [];
  for (const action of actions) {
    if (action.enabledWhen === undefined) continue;
    if (action.scope === ActionScopes.selection) continue;
    const seen = new Set<string>();
    answers.forEach((answer, i) => {
      const value = answer.enabled[action.id];
      if (value === undefined) return;
      seen.add(value ? BOTH[0] : BOTH[1]);
      void i;
    });
    add(`${action.id}.enabledWhen`, `「${action.label}」が押せる条件`, BOTH, seen);
  }

  // 明細の行の中の検証（行が在るときだけ数える）。
  if (form !== undefined) {
    for (const field of formFields(form)) {
      if (field.type !== FieldTypes.subTable) continue;
      for (const rowField of field.rowFields) {
        if (rowField.validators.length === 0 && !rowField.required) continue;
        const seen = new Set<string>();
        for (const answer of answers) {
          const rows = answer.record[field.field];
          if (!Array.isArray(rows) || rows.length === 0) continue;
          const failed = answer.errors.some((error) =>
            error.field.startsWith(`${field.field}[`) &&
            error.field.endsWith(`.${rowField.field}`),
          );
          seen.add(failed ? PASSED_FAILED[1] : PASSED_FAILED[0]);
        }
        add(
          `${field.field}[].${rowField.field}`,
          `明細「${field.label}」の行の「${rowField.label}」の検証`,
          PASSED_FAILED,
          seen,
        );
      }
    }
  }

  return { points, pending: points.filter((one) => one.missing.length > 0) };
}

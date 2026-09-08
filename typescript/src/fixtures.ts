// サーバ側の**試験データ**を定義から出す。
//
// 契約（`hatake schema` / `openapi` / `types`）は出せるようになったが、**試すデータ**は
// サーバを書く人が手で作っている。制約は定義に在るので出せる＝画面（`run --draft`）と
// サーバ（これ）が**同じ境界**で試される（別々に作ると必ずどちらかが緩い）。
//
// 出すのは「サーバが受け取る形」（DTO の request）に入れるレコードと、**通るはずか／
// 弾かれるはずか**。値の作り方は画面側の下書きと同じ所（[fieldValues]）。
//
// **言い切る前に自分で確かめる。** 「弾かれるはず」と書いた形が実際には通ってしまう
// ことがある（条件で隠れている項目の必須など）。そういう件は**出さずに理由を残す**
// ＝道具が嘘をつくより、言わないほうがいい。
//
// 確かめるのに使うのは `hatake run` の中身そのまま（[runCase]）＝**画面と同じ順**で
// 動かす（`normalize` → `computed` → 状態 → 検証）。出すレコードもその答え、つまり
// **サーバが実際に受け取る形**（整えたあと・計算した値つき）になる。

import {
  FieldTypes,
  ValidatorTypes,
  formFields,
  type FieldDefinition,
  type FormDefinition,
  type PageDefinition,
} from "./definition.js";
import { deriveDto, type DtoShape } from "./dto.js";
import { numParam, plausible, row, ruleOf } from "./fieldValues.js";
import { formOf, runCase } from "./scenario.js";

/** 出す件数の上限（読まれない量を出さない。`run --draft` と同じ考え）。 */
export const FIXTURE_LIMIT = 20;

/** 試験データ1件。 */
export interface FixtureRecord {
  /** 何を試す形か（日本語）。 */
  name: string;
  /** サーバが**受け取るべき**か（false なら弾くのが正しい）。 */
  valid: boolean;
  /** そう言える理由（定義のどこから来たか）。 */
  why: string;
  /** 弾かれるはずのとき、どの項目で落ちるか。 */
  field?: string;
  record: Record<string, unknown>;
}

export interface FixtureFile {
  $comment: string;
  page?: string;
  /** 入れる先の形の名前（`hatake schema` / `openapi` に出てくる名前）。 */
  shape?: string;
  records: FixtureRecord[];
  /** 言えなかったこと（人が書く所）。 */
  notes: string[];
}

/** 手で入れる項目（計算項目と、別テーブルに持つ明細は入れない）。 */
const typedIn = (form: FormDefinition): FieldDefinition[] =>
  formFields(form).filter(
    (field) =>
      field.computed === undefined &&
      !(field.type === FieldTypes.subTable && field.source !== undefined),
  );

function filled(form: FormDefinition): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const field of typedIn(form)) {
    record[field.field] = plausible(field);
  }
  return record;
}

/** リクエストの形（サーバが受け取る側）。無ければ undefined。 */
function requestShape(page: PageDefinition): DtoShape | undefined {
  return deriveDto(page).shapes.find((shape) => shape.role === "request");
}

/**
 * 定義から試験データを起こす。
 *
 * 出す形は5種類。どれも**定義に書いてあること**から作る:
 *
 *   1. 全部埋めた形（通るはず）
 *   2. 必須を1つずつ空にした形（弾かれるはず）
 *   3. 文字数・数の境界（ぴったり＝通る／1つ超え＝弾かれる）
 *   4. 明細の行の必須を空にした形・同じ値の行を2つ（`unique`）
 *   5. サーバが決める項目（`readOnly` / `computed`）を**送ってきた**形
 *      （弾いてはいけない＝画面はレコードごと送るので、閉じた形で弾くと保存できない）
 */
export function deriveFixtures(page: PageDefinition): FixtureFile {
  const form = formOf(page);
  const shape = requestShape(page);
  if (form === undefined || shape === undefined) {
    return {
      $comment:
        `${page.kind} の画面はレコードを受け取らないので、試験データがありません` +
        `（サーバに送る形が定義から出ません）。`,
      records: [],
      notes: [],
    };
  }

  const notes: string[] = [];
  const base = filled(form);
  const candidates: FixtureRecord[] = [
    {
      name: "全部埋めた",
      valid: true,
      why: "定義の制約を全部満たした形。業務としてあり得る値かは人が見る。",
      record: base,
    },
  ];

  // 必須（弾かれるはず）。
  for (const field of typedIn(form)) {
    if (!field.required) continue;
    const record = { ...base };
    delete record[field.field];
    candidates.push({
      name: `必須の「${field.label}」が無い`,
      valid: false,
      why: "required: true。画面でもサーバでも同じ規則で効く（同じ定義を読むので）。",
      field: field.field,
      record,
    });
  }

  // 文字数の境界（通る側も出す＝片側だけだと、緩めたことに気づけない）。
  for (const field of typedIn(form)) {
    const max = numParam(ruleOf(field, ValidatorTypes.maxLength)?.params.value);
    if (max === undefined) continue;
    candidates.push({
      name: `「${field.label}」が ${max} 文字ぴったり`,
      valid: true,
      why: `maxLength: ${max}。境界の内側。`,
      record: { ...base, [field.field]: "X".repeat(max) },
    });
    candidates.push({
      name: `「${field.label}」が ${max + 1} 文字`,
      valid: false,
      why: `maxLength: ${max}。1文字超えている。`,
      field: field.field,
      record: { ...base, [field.field]: "X".repeat(max + 1) },
    });
  }

  // 数の境界。
  for (const field of typedIn(form)) {
    const min = numParam(ruleOf(field, ValidatorTypes.min)?.params.value);
    if (min === undefined) continue;
    candidates.push({
      name: `「${field.label}」が下限（${min}）より小さい`,
      valid: false,
      why: `min: ${min}。`,
      field: field.field,
      record: { ...base, [field.field]: min - 1 },
    });
  }
  for (const field of typedIn(form)) {
    const max = numParam(ruleOf(field, ValidatorTypes.max)?.params.value);
    if (max === undefined) continue;
    candidates.push({
      name: `「${field.label}」が上限（${max}）より大きい`,
      valid: false,
      why: `max: ${max}。`,
      field: field.field,
      record: { ...base, [field.field]: max + 1 },
    });
  }

  // 明細の行（行の必須・行どうしの規則）。
  for (const field of typedIn(form)) {
    if (field.type !== FieldTypes.subTable) continue;
    const rowRequired = field.rowFields.find(
      (one) => one.required && one.computed === undefined,
    );
    if (rowRequired !== undefined) {
      const one = row(field);
      delete one[rowRequired.field];
      candidates.push({
        name: `明細「${field.label}」の1行目で必須の「${rowRequired.label}」が無い`,
        valid: false,
        why: "行の中のエラーは <項目>[<行番号>].<行の項目> で返す（行番号は 0 から）。",
        field: `${field.field}[0].${rowRequired.field}`,
        record: { ...base, [field.field]: [one] },
      });
    }
    const unique = ruleOf(field, ValidatorTypes.unique);
    const of = unique?.params.of;
    if (unique !== undefined && typeof of === "string") {
      const one = row(field);
      candidates.push({
        name: `明細「${field.label}」に同じ ${of} の行が2つ`,
        valid: false,
        why: "行どうしの規則（unique）。行を1行ずつ見る検証では拾えない。",
        field: field.field,
        record: { ...base, [field.field]: [one, { ...one }] },
      });
    }
  }

  // サーバが決める項目（`readOnly` / `computed`）は、**どのレコードにも入っている**。
  // 画面はレコードごと送るので、閉じた形で弾くと保存できない画面ができる。別の件を
  // 作るのではなく、全件に入っていることを言う（同じ形を2つ出しても読む手間が増える）。
  const managed = shape.members.filter(
    (member) => member.readOnly || member.computed,
  );
  if (managed.length > 0) {
    notes.push(
      `サーバが決める項目（${managed.map((one) => one.name).join(" / ")}）は、` +
        `どのレコードにも入っています。画面はレコードごと送るので**送られてきます**` +
        `＝無視するのは正しいですが、弾くと保存できない画面になります。`,
    );
  }

  // **言い切る前に確かめる。** 通ると言った形が落ちる／弾かれると言った形が通るなら、
  // それは定義か道具の話で、試験データとしては嘘になる。出さずに理由を残す。
  const records: FixtureRecord[] = [];
  for (const one of candidates) {
    const answer = runCase(page, { name: one.name, record: one.record });
    const errors = answer.errors;
    const passes = errors.length === 0;
    for (const line of answer.cannot) notes.push(line);
    if (passes === one.valid) {
      // 出すのは**サーバが受け取る形**（整えたあと・計算した値つき）。
      records.push({ ...one, record: answer.record });
      continue;
    }
    notes.push(
      one.valid
        ? `「${one.name}」は通るつもりで作りましたが、この定義では落ちます` +
          `（${errors.map((e) => `${e.field}: ${e.message}`).join(" / ")}）。` +
          `出していません。`
        : `「${one.name}」は弾かれるつもりで作りましたが、この定義では通ります` +
          `（隠れている項目や、条件で必須になる項目かもしれません）。出していません。`,
    );
  }

  if (records.length > FIXTURE_LIMIT) {
    notes.push(
      `作れる形は ${records.length} 件ありましたが、${FIXTURE_LIMIT} 件で切りました。`,
    );
  }
  for (const field of typedIn(form)) {
    if (ruleOf(field, ValidatorTypes.pattern) === undefined) continue;
    notes.push(
      `「${field.label}」は形が決まっている項目（pattern）なので、値は作っていません` +
        `（TODO_${field.field} が入っています）。業務としてあり得る値を入れてください。`,
    );
  }

  return {
    $comment:
      "hatake fixtures が定義から作ったサーバ側の試験データ。valid が false の形は" +
      "**弾くのが正しい**。値は定義の制約から作ったもので、業務としてあり得る値かは人が見る。",
    ...(page.id !== undefined ? { page: page.id } : {}),
    shape: shape.name,
    records: records.slice(0, FIXTURE_LIMIT),
    notes: [...new Set(notes)],
  };
}

/** 人が読む形（`--json` でないとき）。 */
export function fixtureLines(file: FixtureFile): string[] {
  const lines: string[] = [];
  if (file.records.length === 0) {
    lines.push(file.$comment);
    return lines;
  }
  lines.push(`${file.shape} に入れる形（${file.records.length} 件）:`);
  for (const one of file.records) {
    lines.push(`  ${one.valid ? "受ける" : "弾く  "}  ${one.name}`);
    lines.push(`          ${one.why}`);
  }
  return lines;
}

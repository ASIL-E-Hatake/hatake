// 定義を**動かして**答えを見る（シナリオ）。
//
// 書く道具（`new` / `fix` / `advise`）と読む道具（`explain` / `diagram` / `paper`）は
// 揃っているのに、**動かす道具**が無かった。`validate` が言うのは「書ける」ことだけ、
// `explain` が言うのは「そう書いてある」ことだけで、
//
//   ・その値でいくらになるのか（計算）
//   ・その状態で何が必須になるのか（条件）
//   ・そのボタンが押せるのか（`enabledWhen`）
//   ・何が弾かれるのか（検証）
//
// は画面を出さないと分からなかった。AI にとっては一番遠い所（Flutter が要る）なので、
// **文字で答える**口を用意する。
//
// 答えの作り方は**画面と同じ順**（ここがズレると、道具の答えが嘘になる）:
//
//   1. `normalize` を当てる（保存前に整える）
//   2. `computed` を**宣言順に1回**当てる（明細の行の中が先、次に親の項目）
//   3. 状態を見る（隠れている項目・いま必須の項目・押せるボタン）
//   4. 検証する（隠れている項目は検証しない＝画面と同じ規則）
//
// **答えられないことは答えない。** プラグインの計算・検証（アプリが登録するもの）は
// この道具の中には無いので、値を作らずに `cannot` に並べる（0 や null を返すと、
// 「計算した結果が 0」と読める）。同じ理由で `source` を持つ明細は畳まない。

import { ConverterRegistry } from "./converter.js";
import { ComputedRegistry } from "./computed.js";
import { evaluateCondition } from "./conditionEvaluator.js";
import {
  ActionScopes,
  FieldTypes,
  formFields,
  type ActionDefinition,
  type FieldDefinition,
  type FormDefinition,
  type PageDefinition,
  wizardForm,
} from "./definition.js";
import { FormValidator, type ValidationError } from "./formValidator.js";
import { normalizeRecord } from "./normalizer.js";
import { ValidatorRegistry } from "./validators.js";

/** レコードを持つ画面（そこに1件在るので、状態で出し分けられる）。 */
const PAGE_KINDS_WITH_RECORD = ["form", "detail", "wizard"];

/** シナリオ1件（「この値を入れたら、こうなる」）。 */
export interface ScenarioCase {
  name: string;
  /** 画面に入っている値。明細は行の配列。 */
  record: Record<string, unknown>;
  /** `{ mode: create }` の判定用（省略＝どちらでもない）。 */
  mode?: string;
  /** 確かめたいこと。**書いた欄だけ**見る（全部書かなくていい）。 */
  expect?: ScenarioExpectation;
  /** 人が読むための覚え書き（下書きが理由を書く所）。 */
  $comment?: string;
}

export interface ScenarioExpectation {
  /** 出る検証エラー。書いたら**順不同で完全一致**（`[]` は「エラー無し」）。 */
  errors?: ValidationError[];
  /** 計算項目の値。**書いたキーだけ**見る。 */
  computed?: Record<string, unknown>;
  /** 押せるかどうか。**書いたキーだけ**見る。 */
  enabled?: Record<string, boolean>;
  /** 隠れている項目。書いたものが**隠れていること**を見る（含む）。 */
  hidden?: string[];
  /** いま必須の項目。書いたものが**必須であること**を見る（含む）。 */
  required?: string[];
}

/** シナリオの束（1つの画面に対して）。 */
export interface ScenarioFile {
  /** アプリ定義のときどの画面か（1枚の定義なら省略）。 */
  page?: string;
  cases: ScenarioCase[];
  $comment?: string;
}

/** 1件を動かした答え。 */
export interface ScenarioAnswer {
  /** 計算を当てたあとのレコード（画面が保存に渡す形）。 */
  record: Record<string, unknown>;
  computed: Record<string, unknown>;
  errors: ValidationError[];
  enabled: Record<string, boolean>;
  hidden: string[];
  required: string[];
  /** **この道具では答えられないこと**（登録が要る計算・検証など）。 */
  cannot: string[];
}

/** 期待と答えの食い違い1つ。 */
export interface ScenarioMismatch {
  /** どの欄か（`computed.subtotal` / `errors` / `enabled.reject` …）。 */
  at: string;
  expected: unknown;
  actual: unknown;
}

export interface ScenarioResult {
  name: string;
  answer: ScenarioAnswer;
  /** 空なら通った。 */
  mismatches: ScenarioMismatch[];
}

/** 画面を動かすのに要る登録（アプリが足したものを渡せる）。 */
export interface ScenarioRegistries {
  validators?: ValidatorRegistry;
  computeds?: ComputedRegistry;
  converters?: ConverterRegistry;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** その画面のフォーム（`wizard` は**保存が満たすべき1枚**に畳む＝既にある口を使う）。 */
export function formOf(page: PageDefinition): FormDefinition | undefined {
  if ("steps" in page) return wizardForm(page);
  if ("form" in page && page.form !== undefined) return page.form;
  return undefined;
}

/** その画面のボタン（無い種別では空）。 */
const actionsOf = (page: PageDefinition): ActionDefinition[] =>
  "actions" in page ? page.actions : [];

/**
 * 計算を**宣言順に1回**当てた写し。明細の行の中を先に当てる（親が行を畳むので）。
 *
 * 登録が無い `op`（アプリが足す計算）は**当てない**＝値を作らない。作ると
 * 「計算した結果が空」と読めてしまうので、答えではなく [cannot] に回す。
 */
function applyComputed(
  form: FormDefinition,
  record: Record<string, unknown>,
  computeds: ComputedRegistry,
  cannot: string[],
): { record: Record<string, unknown>; computed: Record<string, unknown> } {
  const out = { ...record };
  const computed: Record<string, unknown> = {};

  const known = (field: FieldDefinition): boolean => {
    const op = field.computed?.op;
    if (typeof op !== "string") return false;
    if (computeds.has(op)) return true;
    cannot.push(
      `「${field.label}」の計算（op: ${op}）は登録が要ります。この道具には組み込みしか` +
        `無いので、値は出しません（アプリの試験で回してください）。`,
    );
    return false;
  };

  for (const field of formFields(form)) {
    // 明細の行の中の計算（金額＝数量×単価）。行が親のレコードに在るときだけ。
    if (field.type !== FieldTypes.subTable || field.source !== undefined) continue;
    const rows = out[field.field];
    if (!Array.isArray(rows)) continue;
    out[field.field] = rows.map((raw) => {
      if (!isRecord(raw)) return raw;
      const row = { ...raw };
      for (const rowField of field.rowFields) {
        if (rowField.computed === undefined || !known(rowField)) continue;
        row[rowField.field] = computeds.compute(rowField.computed, row);
      }
      return row;
    });
  }

  for (const field of formFields(form)) {
    if (field.computed === undefined) continue;
    if (field.type === FieldTypes.subTable && field.source !== undefined) {
      cannot.push(
        `「${field.label}」は別のテーブルに持つ明細（source つき）なので、行はここに` +
          `ありません（畳めません）。`,
      );
      continue;
    }
    if (!known(field)) continue;
    const value = computeds.compute(field.computed, out);
    out[field.field] = value;
    computed[field.field] = value;
  }
  return { record: out, computed };
}

/** 隠れている項目（項目の `visibleWhen`／その枠の `visibleWhen`）。 */
function hiddenFields(
  form: FormDefinition,
  record: Record<string, unknown>,
  mode: string | undefined,
): Set<string> {
  const hidden = new Set<string>();
  for (const section of form.sections) {
    const sectionShown =
      section.visibleWhen === undefined ||
      evaluateCondition(section.visibleWhen, record, mode);
    for (const field of section.fields) {
      const shown =
        field.visibleWhen === undefined ||
        evaluateCondition(field.visibleWhen, record, mode);
      if (!sectionShown || !shown) hidden.add(field.field);
    }
  }
  return hidden;
}

/**
 * いま必須の項目（`required` と、成立した `requiredWhen`）。
 *
 * **隠れている項目は数えない**（入力できないものは求められない＝検証と同じ規則）。
 */
function requiredFields(
  form: FormDefinition,
  record: Record<string, unknown>,
  mode: string | undefined,
  hidden: Set<string>,
): string[] {
  const found: string[] = [];
  for (const field of formFields(form)) {
    if (hidden.has(field.field)) continue;
    const now =
      field.required ||
      (field.requiredWhen !== undefined &&
        evaluateCondition(field.requiredWhen, record, mode));
    if (now) found.push(field.field);
  }
  return found;
}

/**
 * 押せるボタン（`enabledWhen`）。
 *
 * 判定できるのは**レコードを持つ画面**だけ（一覧の上のボタンには判定する相手が無い
 * ＝`validate` が `enabledwhen-without-record` で言う）。一括のボタンは「選んだ行」で
 * 判定するもので、シナリオは行の選択を持たないので答えない。
 */
function enabledActions(
  page: PageDefinition,
  record: Record<string, unknown>,
  mode: string | undefined,
  cannot: string[],
): Record<string, boolean> {
  const enabled: Record<string, boolean> = {};
  const hasRecord = PAGE_KINDS_WITH_RECORD.includes(page.kind);
  for (const action of actionsOf(page)) {
    if (action.enabledWhen === undefined) {
      enabled[action.id] = true;
      continue;
    }
    if (action.scope === ActionScopes.selection) {
      cannot.push(
        `「${action.label}」は選んだ行で判定するボタンなので、押せるかどうかは` +
          `シナリオでは決まりません（行の選択は画面の状態です）。`,
      );
      continue;
    }
    if (!hasRecord) {
      cannot.push(
        `「${action.label}」の enabledWhen は判定する相手がありません` +
          `（${page.kind} の画面には開いているレコードがない）。`,
      );
      continue;
    }
    enabled[action.id] = evaluateCondition(action.enabledWhen, record, mode);
  }
  return enabled;
}

/**
 * 1件を動かして答えを作る。
 *
 * 順番は画面と同じ（normalize → computed → 状態 → 検証）。渡す登録を差し替えれば、
 * **アプリが足した計算・検証のまま**回せる（同じシナリオを画面の試験でも使える）。
 */
export function runCase(
  page: PageDefinition,
  one: ScenarioCase,
  registries: ScenarioRegistries = {},
): ScenarioAnswer {
  const form = formOf(page);
  const cannot: string[] = [];
  if (form === undefined) {
    return {
      record: { ...one.record },
      computed: {},
      errors: [],
      enabled: enabledActions(page, one.record, one.mode, cannot),
      hidden: [],
      required: [],
      cannot: [
        `${page.kind} の画面には入力の枠（form）がないので、入れる値がありません。`,
        ...cannot,
      ],
    };
  }
  const validators = registries.validators ?? new ValidatorRegistry();
  const computeds = registries.computeds ?? new ComputedRegistry();
  const converters = registries.converters ?? new ConverterRegistry();

  const normalized = normalizeRecord(form, one.record, converters);
  const { record, computed } = applyComputed(form, normalized, computeds, cannot);
  const hidden = hiddenFields(form, record, one.mode);
  const required = requiredFields(form, record, one.mode, hidden);
  const enabled = enabledActions(page, record, one.mode, cannot);

  for (const field of formFields(form)) {
    for (const rule of field.validators) {
      if (validators.has(rule.type)) continue;
      cannot.push(
        `「${field.label}」の検証（type: ${rule.type}）は登録が要ります。この道具には` +
          `組み込みしか無いので、その規則は回していません。`,
      );
    }
  }

  const errors = new FormValidator(validators).validate(form, record, one.mode).errors;
  return {
    record,
    computed,
    errors,
    enabled,
    hidden: [...hidden],
    required,
    cannot,
  };
}

/** 同じ値か（レコードの入れ子も見る）。 */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") {
    return Number.isNaN(a) && Number.isNaN(b) ? true : a === b;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((one, i) => same(one, b[i]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((key) => same(a[key], b[key]));
  }
  return false;
}

const errorKey = (e: ValidationError): string => `${e.field}=${e.message}`;

/**
 * 期待と答えを比べる。**書いた欄だけ**見る。
 *
 * 欄ごとに見方が違うのは、欄の形が違うから:
 *
 * ・`errors` … 順不同で**完全一致**（「これだけ出る」が意味を持つ。`[]` は「出ない」）
 * ・`computed` / `enabled` … 書いた**キーだけ**（1つだけ確かめたいことが多い）
 * ・`hidden` / `required` … 書いたものが**入っていること**（含む）
 */
export function compareAnswer(
  expect: ScenarioExpectation | undefined,
  answer: ScenarioAnswer,
): ScenarioMismatch[] {
  const found: ScenarioMismatch[] = [];
  if (expect === undefined) return found;

  if (expect.errors !== undefined) {
    const wanted = [...expect.errors].map(errorKey).sort();
    const actual = [...answer.errors].map(errorKey).sort();
    if (!same(wanted, actual)) {
      found.push({ at: "errors", expected: expect.errors, actual: answer.errors });
    }
  }
  for (const [name, value] of Object.entries(expect.computed ?? {})) {
    if (!same(value, answer.computed[name])) {
      found.push({
        at: `computed.${name}`,
        expected: value,
        actual: answer.computed[name],
      });
    }
  }
  for (const [name, value] of Object.entries(expect.enabled ?? {})) {
    if (answer.enabled[name] !== value) {
      found.push({
        at: `enabled.${name}`,
        expected: value,
        actual: answer.enabled[name],
      });
    }
  }
  for (const name of expect.hidden ?? []) {
    if (!answer.hidden.includes(name)) {
      found.push({ at: `hidden.${name}`, expected: true, actual: false });
    }
  }
  for (const name of expect.required ?? []) {
    if (!answer.required.includes(name)) {
      found.push({ at: `required.${name}`, expected: true, actual: false });
    }
  }
  return found;
}

/** シナリオを全件動かす。 */
export function runScenario(
  page: PageDefinition,
  file: ScenarioFile,
  registries: ScenarioRegistries = {},
): ScenarioResult[] {
  return file.cases.map((one) => {
    const answer = runCase(page, one, registries);
    return { name: one.name, answer, mismatches: compareAnswer(one.expect, answer) };
  });
}

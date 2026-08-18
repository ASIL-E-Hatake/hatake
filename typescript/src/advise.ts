// 「書き足したほうがいい所」を挙げる。
//
// [minimizeSource] は**書きすぎ**を直す。しかし業務システムで多いのは書きすぎより
// **書き足りない**（並べ替えできない一覧・絞り込みの無い一覧・誰でも消せる画面）。書いて
// いないから困る所は、警告にもスキーマにも出ない。書いていないものは検査できないので。
//
// これは**警告ではなく助言**。この2つは絶対に混ぜない:
//   ・警告 … 書いたのに効かない。事実なので、CI で落としてよい
//   ・助言 … 書いていないから不便かもしれない。**好み**なので、CI で落としてはいけない
// 混ぜると警告の信頼が落ちる（「hatake は好みを押し付ける」になった時点で誰も読まない）。
//
// 嘘をつかないための決めごと: 助言が「これを足せ」と言うキーは、**その場所に本当に書ける
// キー**であること。スキーマから作ったリファレンスで確かめる（試験でも見ている）。名前から
// 推測している助言（「金額らしいのに桁区切りが無い」）には `guess` を立てて、推測だと言う。

import { type DslReference } from "./reference.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const dicts = (v: unknown): Dict[] => list(v).filter(isDict);

/** 助言1件。 */
export interface Advice {
  /** 規則名（安定した識別子）。 */
  rule: string;
  /** 場所（警告と同じ道の書き方）。 */
  where: string;
  /** 何が不便か。 */
  says: string;
  /** 何を書き足すか。 */
  add: string;
  /** 足すキー（その場所に本当に書けるかを確かめるため）。 */
  key: string;
  /** そのキーを書くノード名（リファレンスの名前）。 */
  node: string;
  /** true = 名前から推測している（外れることがある）。 */
  guess?: boolean;
}

/** 保存する画面。ここでしか「必須が無い」は言わない（照会に必須は無関係）。 */
const WRITES = new Set(["crud", "master", "form", "wizard"]);

/** 金額らしい名前（桁区切りが無いと読めない列を拾うための、名前による推測）。 */
const MONEY = /(amount|price|total|cost|fee|salary|金額|価格|単価|合計|税|料金)/i;

/**
 * 助言を集める。素の document を見る（既定値で埋まった姿ではなく、**書いてあるもの**を
 * 見たいので）。
 */
export function findAdvice(document: Dict): Advice[] {
  const found: Advice[] = [];
  const app = isDict(document.app) ? document.app : undefined;
  if (app !== undefined) {
    dicts(app.pages).forEach((page, i) =>
      checkPage(page, `app.pages[${i}]`, found),
    );
  }
  if (isDict(document.page)) checkPage(document.page, "page", found);
  return found;
}

function checkPage(page: Dict, path: string, found: Advice[]): void {
  const kind = str(page.type) ?? "";
  const table = isDict(page.table) ? page.table : undefined;
  const columns = table === undefined ? [] : dicts(table.columns);
  const search = isDict(page.search) ? page.search : undefined;
  const filters = search === undefined ? [] : dicts(search.filters);
  const actions = dicts(page.actions);
  const fields = formFields(page);

  // 一覧はあるのに、並べ替えできる列が1つも無い。
  // 帳票では言わない（印字順は report.sort が決めるので、画面の並べ替えは無い）。
  if (
    kind !== "report" &&
    columns.length >= 3 &&
    !columns.some((column) => column.sortable === true)
  ) {
    found.push({
      rule: "no-sortable-column",
      where: `${path}.table.columns`,
      says: `列が ${columns.length} 本あるのに、並べ替えできる列が1つもありません。`,
      add: "よく並べ替える列に `sortable: true`（日付・金額・コードあたり）。",
      key: "sortable",
      node: "column",
    });
  }

  // 一覧はあるのに、絞り込みが1つも無い（件数が増えると使えなくなる）。
  if (columns.length > 0 && filters.length === 0 && kind !== "report") {
    found.push({
      rule: "no-search-filter",
      where: `${path}.search`,
      says: "絞り込みが無いので、一覧は毎回全件から始まります。件数が増えると使えません。",
      add: "`search.filters` に、現場が必ず使う条件（コード・名称・日付の範囲）。",
      key: "filters",
      node: "search",
    });
  }

  // 1件を指すキーが一覧に出ていない（行を見ても、どのレコードか分からない）。
  const key = str(page.key);
  if (
    key !== undefined &&
    columns.length > 0 &&
    !columns.some((column) => str(column.field) === key)
  ) {
    found.push({
      rule: "key-not-in-table",
      where: `${path}.table.columns`,
      says: `1件を指すキー "${key}" が一覧に出ていないので、行を見てもどのレコードか分かりません。`,
      add: `一覧に \`{ field: ${key}, label: … }\` を足す（現場は id を見て電話で話します）。`,
      key: "columns",
      node: "table",
    });
  }

  // 入力できるのに、必須が1つも無い。
  // 照会（detail）では言わない。項目は並んでいるが、そこから保存はしない。
  if (WRITES.has(kind) && fields.length > 0 && !fields.some((f) => f.required === true)) {
    const conditional = fields.some((field) => field.requiredWhen !== undefined);
    if (!conditional) {
      found.push({
        rule: "no-required-field",
        where: `${path}.form`,
        says: "必須の項目が1つも無いので、空のまま保存できます。",
        add: "本当に必須の項目に `required: true`（条件つきなら `requiredWhen`）。",
        key: "required",
        node: "field",
      });
    }
  }

  // 消せる・持ち出せるのに、誰に見えるかを決めていない。
  for (const [index, action] of actions.entries()) {
    const type = str(action.type) ?? "";
    if (type !== "delete" && type !== "export") continue;
    if (list(action.roles).length > 0) continue;
    found.push({
      rule: "open-dangerous-action",
      where: `${path}.actions[${index}].roles`,
      says:
        type === "delete"
          ? `「${str(action.label) ?? action.id}」は誰でも押せます（消したものは戻りません）。`
          : `「${str(action.label) ?? action.id}」は誰でも押せます（データを持ち出せます）。`,
      add: "`roles` で見える人を決める（権限はアプリ側の判定と合わせて二重にかける）。",
      key: "roles",
      node: "action",
    });
  }

  // 金額らしい列・項目に見せ方が無い（桁区切りが無いと読めない）。
  for (const [index, column] of columns.entries()) {
    const field = str(column.field) ?? "";
    if (!MONEY.test(field) || column.format !== undefined) continue;
    found.push({
      rule: "money-without-format",
      where: `${path}.table.columns[${index}].format`,
      says: `列 "${field}" は金額のようですが、桁区切りが無いので 1234567 と出ます。`,
      add: "`format: currency`（消費税や単価で見せ方を変えるなら `config` で）。",
      key: "format",
      node: "column",
      guess: true,
    });
  }

  // 明細（subTable）を別テーブルに持つのに、行を指すキーが無い。
  for (const field of fields) {
    if (str(field.type) !== "subTable") continue;
    const source = isDict(field.source) ? field.source : undefined;
    if (source === undefined || str(source.parentKey) !== undefined) continue;
    found.push({
      rule: "subtable-without-parent-key",
      where: `${path}.form…${str(field.field) ?? ""}.source.parentKey`,
      says: `明細 "${str(field.label) ?? field.field}" は別テーブルから引くのに、親を指すキーがありません。`,
      add: "`source.parentKey` に、親のどの項目で子を引くかを書く。",
      key: "parentKey",
      node: "subTableSource",
    });
  }

  // 帳票なのに合計が無い（業務帳票で合計が無いことは、まず無い）。
  if (kind === "report") {
    const report = isDict(page.report) ? page.report : {};
    if (list(report.totals).length === 0) {
      found.push({
        rule: "report-without-totals",
        where: `${path}.report.totals`,
        says: "合計が1つもありません。帳票は合計を見るために配られることが多いです。",
        add: "`totals` に集計する項目（`{ field: amount, aggregate: sum }`）。",
        key: "totals",
        node: "report",
      });
    }
  }
}

/** フォームとステップの項目を、区別せず全部。 */
function formFields(page: Dict): Dict[] {
  const fields: Dict[] = [];
  const form = isDict(page.form) ? page.form : undefined;
  if (form !== undefined) {
    for (const section of dicts(form.sections)) fields.push(...dicts(section.fields));
  }
  for (const step of dicts(page.steps)) fields.push(...dicts(step.fields));
  return fields;
}

/**
 * 助言が挙げるキーが、そのノードに**本当に書けるか**を確かめる。
 *
 * 書けないキーを勧めるのは、間違いを教えるのと同じ。スキーマから作ったリファレンスで
 * 照合するので、DSL が変わればここで落ちる。
 */
export function unwritableAdvice(
  advice: Advice[],
  reference: DslReference,
): Advice[] {
  return advice.filter((one) => {
    const node = reference.nodes[one.node];
    if (node === undefined) return true;
    return !node.keys.some((key) => key.key === one.key);
  });
}

/** 人が読む形。**助言であって警告ではない**ことを毎回言う。 */
export function renderAdvice(advice: Advice[]): string {
  if (advice.length === 0) {
    return [
      "書き足したほうがいい所は見つかりませんでした。",
      "",
      ADVICE_NOTE,
    ].join("\n");
  }
  const out = [`書き足すと良さそうな所が ${advice.length} 件:`];
  for (const one of advice) {
    out.push("");
    out.push(`# ${one.where} [${one.rule}]${one.guess === true ? "（名前からの推測）" : ""}`);
    out.push(`  こうなる: ${one.says}`);
    out.push(`  書き足す: ${one.add}`);
  }
  out.push("");
  out.push(ADVICE_NOTE);
  return out.join("\n");
}

/** 助言の位置づけは毎回書く。読み手が警告と混同すると、警告の信頼が落ちる。 */
export const ADVICE_NOTE =
  "※ ここは**助言**（書いていないから不便かもしれない所）で、警告ではありません。" +
  "業務によっては要らないものもあるので、終了コードは変えません。" +
  "「書いたのに効かない」は hatake validate が見ます。";

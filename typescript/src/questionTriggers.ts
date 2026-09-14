// 問いの**引き金**（定義から拾う事実）。
//
// 問い返し（`hatake ask`）がいちばんやってはいけないのは、**思いついたことを聞く**こと。
// 日によって違うことを聞く道具は、3回目から読まれなくなる。だから問いは必ず
// 「定義にこう書いてある」という事実から出す＝その事実の名前を閉じた集合で持つ。
//
// 決めごと:
//
// * **引き金ごとの見つけ方を `Record<QuestionTrigger, …>` で持つ。** 引き金を足したら
//   型が落ちる＝見つけ方を書かずに表だけ増やすことはできない。
// * **何を見てそう言うのかを文で返す。** 「排他はどうしますか」だけ出されても、読む人は
//   なぜ今それを聞かれたのか分からない（`受注入力: 保存できる画面（type: crud）` まで
//   言えば、心当たりのある人はその場で答えられる）。
// * **推測で引かない。** 名前から拾う引き金は1つも置いていない（「金額らしいから端数を
//   聞く」はやらない＝端数は `avg` / `product` という**書いてある事実**から聞く）。

import { ActionScopes, ActionTypes } from "./definition.js";
import { rawFormFields, tableColumns } from "./pageParts.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const dicts = (v: unknown): Dict[] => list(v).filter(isDict);

/** 引き金。**閉じた集合**（増やすと見つけ方も要る＝下の [DETECT] で型が落ちる）。 */
export const QUESTION_TRIGGERS = [
  "saves",
  "creates",
  "deletes",
  "bulk",
  "validates",
  "roles",
  "fractions",
  "conditions",
  "report",
] as const;

export type QuestionTrigger = (typeof QUESTION_TRIGGERS)[number];

/** 定義から拾った事実1件。 */
export interface TriggeredFact {
  trigger: QuestionTrigger;
  /** どの画面か（`app` をまとめて読むときに要る）。 */
  page?: string;
  /** 何を見てそう言うか（1行。読む人が心当たりを思い出せるところまで）。 */
  saw: string;
}

/** 保存できる画面（`detail` と `search` は読むだけなので入らない）。 */
const SAVES = new Set(["crud", "master", "form", "wizard"]);

/** 状態で出し分けている印（`requiredWhen` は入力の話なので入れない）。 */
const CONDITION_KEYS = ["enabledWhen", "visibleWhen", "readOnlyWhen"];

/** 端数が出る畳み方（`sum` / `min` / `max` は入力の桁のままなので出ない）。 */
const FRACTION_OPS = new Set(["avg", "product"]);

/** ボタンの呼び名（無ければ id、それも無ければ種別）。 */
const actionName = (action: Dict): string =>
  str(action.label) ?? str(action.id) ?? str(action.type) ?? "（名前なし）";

/** その画面の中で、そのキーを書いている所を数える。 */
function countKey(node: unknown, key: string): number {
  if (Array.isArray(node)) {
    return node.reduce<number>((sum, one) => sum + countKey(one, key), 0);
  }
  if (!isDict(node)) return 0;
  let found = node[key] === undefined ? 0 : 1;
  for (const [name, value] of Object.entries(node)) {
    if (name === key) continue;
    found += countKey(value, key);
  }
  return found;
}

/**
 * 引き金ごとの見つけ方。事実が在れば「何を見たか」を返し、無ければ null。
 *
 * **1つの引き金につき1件しか返さない**（同じことを3回聞かれても答えは1つなので、
 * 件数だけ添える）。
 */
const DETECT: Record<QuestionTrigger, (page: Dict) => string | null> = {
  saves: (page) => {
    const kind = str(page.type) ?? "";
    return SAVES.has(kind) ? `保存できる画面（type: ${kind}）` : null;
  },

  creates: (page) => {
    const found = dicts(page.actions).find(
      (action) => str(action.type) === ActionTypes.create,
    );
    return found === undefined
      ? null
      : `ボタン「${actionName(found)}」で1件つくる（type: create）`;
  },

  deletes: (page) => {
    const found = dicts(page.actions).find(
      (action) => str(action.type) === ActionTypes.delete,
    );
    if (found !== undefined) {
      return `ボタン「${actionName(found)}」で消せる（type: delete）`;
    }
    const table = isDict(page.table) ? page.table : undefined;
    const rows = table === undefined ? [] : list(table.rowActions).map(str);
    return rows.includes(ActionTypes.delete) ? "行の操作に delete が在る" : null;
  },

  bulk: (page) => {
    const found = dicts(page.actions).filter(
      (action) => str(action.scope) === ActionScopes.selection,
    );
    if (found.length === 0) return null;
    const first = `ボタン「${actionName(found[0])}」は選んだ行にまとめて実行する`;
    return found.length === 1 ? first : `${first}（ほかに ${found.length - 1} 本）`;
  },

  validates: (page) => {
    for (const part of rawFormFields(page)) {
      const node = part.node;
      const name = str(node.field) ?? "";
      if (node.required === true) return `項目 "${name}" は必須（required）`;
      if (node.requiredWhen !== undefined) {
        return `項目 "${name}" は条件つきで必須（requiredWhen）`;
      }
      if (list(node.validators).length > 0) {
        return `項目 "${name}" に検証が書いてある（validators）`;
      }
    }
    return null;
  },

  roles: (page) => {
    // `roles`（見せる相手）と `byRole`（役割ごとの件数）の両方を見る。どちらも
    // 「役割という言葉がこの画面に出てきた」という同じ事実。
    const count = countKey(page, "roles") + countKey(page, "byRole");
    if (count === 0) return null;
    return count === 1
      ? "役割で出し分けている（roles）"
      : `役割で出し分けている（roles を ${count} か所）`;
  },

  fractions: (page) => {
    for (const part of [...rawFormFields(page), ...tableColumns(page)]) {
      const computed = isDict(part.node.computed) ? part.node.computed : undefined;
      const op = computed === undefined ? undefined : str(computed.op);
      if (op !== undefined && FRACTION_OPS.has(op)) {
        return `"${str(part.node.field) ?? ""}" を ${op} で計算している`;
      }
    }
    return null;
  },

  conditions: (page) => {
    for (const key of CONDITION_KEYS) {
      const count = countKey(page, key);
      if (count > 0) {
        return count === 1
          ? `状態で出し分けている（${key}）`
          : `状態で出し分けている（${key} を ${count} か所）`;
      }
    }
    return null;
  },

  report: (page) =>
    str(page.type) === "report" ? "帳票の画面（type: report）" : null,
};

/**
 * 定義から事実を拾う。**素の document を見る**（既定値で埋まった姿ではなく、
 * 書いてあるものを見たいので）。`page` 1枚でも `app` でも同じように読む。
 */
export function factsOf(document: Dict): TriggeredFact[] {
  const pages: Dict[] = [];
  const app = isDict(document.app) ? document.app : undefined;
  if (app !== undefined) pages.push(...dicts(app.pages));
  if (isDict(document.page)) pages.push(document.page);

  const found: TriggeredFact[] = [];
  for (const page of pages) {
    const id = str(page.id);
    for (const trigger of QUESTION_TRIGGERS) {
      const saw = DETECT[trigger](page);
      if (saw === null) continue;
      found.push({ trigger, ...(id === undefined ? {} : { page: id }), saw });
    }
  }
  return found;
}

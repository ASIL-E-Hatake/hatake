// 助言に「**書く値の下書き**」を添える。
//
// 助言は「何を足すか」までは言うが、値（絞り込みに何を出すか・確認の文・1回に何件まで）は
// 業務の決めごとなので言わない。当てる口（[applyAdvice]）ができた今、残っている往復は
// **値を決めるところ**だけ。定義から作れるものは下書きとして出して、決めるのは人に残す。
//
// 嘘をつかないための決めごと:
//   ・下書きは**そのまま当てられる形**にする。当てられない下書きは出さない
//     （試験で全部の下書きを実際に当てて確かめている）
//   ・**何から作ったか**を必ず添える（`draftFrom`）。「ボタンの名前から」「定義に出てくる
//     役割から」「1ページの件数から」。根拠を書かない下書きは、読む側が正解と読む
//   ・作れないものは出さない。文の中身（業務の言葉）・案件の決めごとの値は機械には無い
//
// 下書きは [findAdvice] とは分けてある（呼ぶ側が欲しいときだけ足す）。助言そのものは
// 「書いていない所」の話で、下書きは「書くならこう」の話なので、混ぜない。

import { type Advice, MONEY_WORDS, rowsPerPress } from "./advise.js";
import { DEFAULT_PAGE_SIZE } from "./definition.js";
import { rawFormFields, tableColumns } from "./pageParts.js";
import { roleNames } from "./roles.js";
import { type Path, parsePath, valueAt } from "./shrink.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

/** 下書き1つ。 */
export interface AdviceDraft {
  /** 当てる口（`applyAdvice`）の value にそのまま渡せる値。 */
  value: unknown;
  /** 何から作ったか（1行）。 */
  from: string;
}

/** 助言の道から、その画面の道を取る。 */
const pageOf = (at: Path): Path => (at[0] === "app" ? at.slice(0, 3) : ["page"]);

/**
 * 並べ替え・絞り込みに置きたくなる列らしい名前か。
 *
 * 語尾で見る（`orderNo` / `createdAt`）。`note` に `no` が入っているような当たり方を
 * しないよう、部分一致は日本語の語だけにする。**名前からの推測**なので、下書き止まり。
 */
const looksKeyish = (field: string): boolean =>
  /(No|Code|Id|Date|At|Time|Status|Kind|Type|Name)$/.test(field) ||
  ["no", "code", "id", "date", "time", "status", "name"].includes(field.toLowerCase()) ||
  ["番号", "コード", "日付", "状態", "区分", "名"].some((word) => field.includes(word));

/** 金額らしい列か（見せ方の助言と同じ語で見る）。 */
const looksLikeMoney = (field: string): boolean => {
  const name = field.toLowerCase();
  return MONEY_WORDS.some((word) => name.includes(word.toLowerCase()));
};

/** 数の列か（型が number、または金額らしい名前）。 */
const looksNumeric = (column: Dict): boolean => {
  const field = str(column.field) ?? "";
  return str(column.type) === "number" || looksLikeMoney(field);
};

const fieldsOf = (parts: { node: Dict }[]): string[] =>
  parts
    .map((part) => str(part.node.field))
    .filter((field): field is string => field !== undefined);

/** ボタンの呼び名（確認の文に入れるので、業務の言葉のほうを優先する）。 */
const nameOf = (action: Dict): string =>
  str(action.label) ?? str(action.id) ?? "この操作";

/** その助言の道が指しているボタン（`…actions[2].confirm` → そのボタン）。 */
function actionAt(page: Dict, rest: Path): Dict | undefined {
  if (rest[0] !== "actions" || typeof rest[1] !== "number") return undefined;
  const found = valueAt(page, [rest[0], rest[1]]);
  return isDict(found) ? found : undefined;
}

/** その画面の表（無ければ undefined）。 */
const tableOf = (page: Dict): Dict | undefined =>
  isDict(page.table) ? page.table : undefined;

/** 1ページに出る件数（書いていなければ既定。ページ送りを切ってあれば無し）。 */
function pageSizeOf(page: Dict): number | undefined {
  const table = isDict(page.table) ? page.table : undefined;
  const pagination = isDict(table?.pagination) ? table.pagination : undefined;
  if (pagination?.enabled === false) return undefined; // 全件出る＝件数が決まらない
  return typeof pagination?.pageSize === "number"
    ? pagination.pageSize
    : DEFAULT_PAGE_SIZE;
}

/**
 * その助言の下書き。作れなければ undefined。
 *
 * 引数は document 全体（役割の一覧のように、1枚では出ない下書きがある）。
 */
function draftOf(one: Advice, document: Dict, roles: string[]): AdviceDraft | undefined {
  const at = parsePath(one.where);
  const page = valueAt(document, pageOf(at));
  if (!isDict(page)) return undefined;
  const rest = at.slice(pageOf(at).length);
  const columns = tableColumns(page);

  switch (one.rule) {
    case "no-sortable-column": {
      const names = fieldsOf(columns);
      const likely = names.filter(looksKeyish).slice(0, 3);
      if (likely.length > 0) {
        return { value: likely, from: "列の名前から（日付・コード・状態らしいもの）" };
      }
      return names.length === 0
        ? undefined
        : { value: [names[0]], from: "一覧の最初の列" };
    }

    case "no-search-filter": {
      const likely = columns.filter((part) => looksKeyish(str(part.node.field) ?? ""));
      const pick = (likely.length > 0 ? likely : columns).slice(0, 3);
      const filters = pick.flatMap((part) => {
        const field = str(part.node.field);
        const label = str(part.node.label);
        return field === undefined || label === undefined ? [] : [{ field, label }];
      });
      return filters.length === 0
        ? undefined
        : {
            value: filters,
            from:
              likely.length > 0
                ? "一覧の列から（コード・日付・状態らしいもの）"
                : "一覧の先頭の列から",
          };
    }

    case "no-required-field": {
      const names = fieldsOf(rawFormFields(page));
      const key = str(page.key);
      const pick = key !== undefined && names.includes(key) ? key : names.find(looksKeyish);
      return pick === undefined
        ? undefined
        : {
            value: [pick],
            from:
              pick === key
                ? "1件を指すキー（page.key）から"
                : "項目の名前から（コード・番号らしいもの）",
          };
    }

    case "open-dangerous-action":
      return roles.length === 0
        ? undefined // 定義のどこにも役割が無い＝名前は業務側にしか無い
        : {
            value: roles,
            // 全部並べる（綴りが分かるのが値打ち）。ただし**そのまま当てると全員に見える**
            // ので、絞ってから渡す話だと必ず書く。
            from: "定義に出てくる役割の全部（**絞ってから渡してください**）",
          };

    case "bulk-without-confirm": {
      const action = actionAt(page, rest);
      return action === undefined
        ? undefined
        : {
            value: {
              message: `{count} 件を「${nameOf(action)}」します。よろしいですか？`,
            },
            from: "ボタンの名前から（文は業務の言葉に直してください）",
          };
    }

    case "bulk-without-error-message": {
      const action = actionAt(page, rest);
      return action === undefined
        ? undefined
        : {
            value: {
              message: `「${nameOf(action)}」は {count} 件のうち {failed} 件が失敗しました`,
            },
            from: "ボタンの名前から（文は業務の言葉に直してください）",
          };
    }

    case "bulk-on-many-rows": {
      // 助言そのものが「1回で N 件動かして良いなら、そう書いてあること自体が答え」と
      // 言っているので、下書きは**いま実際に動く件数**（意味を変えない値）。
      const size = pageSizeOf(page);
      return size === undefined
        ? undefined
        : { value: size, from: `いま1回で動く件数（1ページ ${size} 件）から` };
    }

    case "bulk-without-batchsize": {
      // 区切りは「何回に分かれるか」で決まる。1回で動く件数を**5回**に割った件数を
      // 下書きにする（1〜2回では進み具合が出た意味が薄く、20回では止める前に終わる）。
      // 1回で動く件数が決まらないとき（ページ送りを切ってあって上限も無い）は作らない
      // ＝根拠が無い数を出さない。
      const action = actionAt(page, rest);
      const rows = action === undefined ? undefined : rowsPerPress(action, tableOf(page));
      return rows === undefined
        ? undefined
        : {
            value: Math.max(1, Math.ceil(rows / 5)),
            from: `1回で動く件数（${rows} 件）を5回に分ける件数から`,
          };
    }

    case "report-without-totals": {
      const totals = columns
        .filter((part) => looksNumeric(part.node))
        .flatMap((part) => {
          const field = str(part.node.field);
          return field === undefined ? [] : [{ field, aggregate: "sum" }];
        });
      return totals.length === 0
        ? undefined
        : { value: totals, from: "明細の数の列から（金額らしいもの）" };
    }

    default:
      // 文の書き換え・案件の決めごとの値・当てられない助言には下書きを作らない。
      return undefined;
  }
}

/**
 * 助言に下書きを足す（作れたものだけ）。
 *
 * 元の並びは変えない。`draft` は**そのまま当てられる形**なので、読んだ側は中身を見て
 * 直すか、そのまま `picks[].value` に渡すかを選べる。
 */
export function withDrafts(document: Dict, advice: Advice[]): Advice[] {
  const roles = roleNames(document);
  return advice.map((one) => {
    const draft = draftOf(one, document, roles);
    return draft === undefined
      ? one
      : { ...one, draft: draft.value, draftFrom: draft.from };
  });
}

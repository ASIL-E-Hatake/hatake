// その項目を触ると、どこが壊れるか（`hatake ask --impact <項目名>`）。
//
// 「〇〇を消したいんだけど」に対して、人は毎回**頭で辿っている**（この項目、他の画面で
// 使ってなかったっけ）。定義が10枚を超えると辿り切れないので、消してから気づく。
// 辿る材料は定義に全部ある＝機械の仕事。
//
// 決めごと:
//
// * **推測しない。** 出すのは**定義に書いてある所**だけ。外のサーバ・プラグインの中身・
//   Dart のハンドラは見えないので、**見えないと毎回言う**（「他に影響はありません」とは
//   絶対に言わない）
// * **1件ごとに定義の道を持つ。** その道を辿ると本当にその名前に行き当たる＝場所が
//   嘘をつかない（試験がそれを確かめている）
// * **定義のどこにも無い名前は「影響なし」と言わない。** 打ち間違いを黙って通すと、
//   「影響ありません」を見て消す人が出る。**無い**と言う
// * **直さない。** 消す／名前を変える／残して隠すは業務の判断なので、問いを返すだけ

import { labelFor, pageActions, rawFormFields, searchFilters, tableColumns } from "./pageParts.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const dicts = (v: unknown): Dict[] => list(v).filter(isDict);

/** 触ったときに壊れる所の種類。**閉じた集合**（増やすときは言い方も要る）。 */
export const IMPACT_KINDS = [
  "key",
  "column",
  "filter",
  "field",
  "computed",
  "condition",
  "param",
  "report",
] as const;

export type ImpactKind = (typeof IMPACT_KINDS)[number];

/**
 * 種類ごとの言い方（何が壊れるか）。**Record で持つ**ので、種類を足すと型が落ちる
 * ＝言い方を書かずに種類だけ増やすことはできない。
 */
export const IMPACT_WORDS: Record<ImpactKind, string> = {
  key: "**1件を指すキー**です（消すと、編集も削除も遷移もできなくなります）",
  column: "一覧の列です（消すと、その列が画面から消えます）",
  filter: "絞り込みです（消すと、その条件で探せなくなります）",
  field: "入力欄です（消すと、その値を入れられなくなります）",
  computed: "**計算の元**です（消すと、その計算の答えが変わります）",
  condition: "**条件で見ています**（消すと、出し分けの判定が壊れます）",
  param: "**遷移で渡しています**（消すと、受け取る側に値が届きません）",
  report: "**帳票の元**です（合計・並び・まとめが変わります）",
};

/** 触ると壊れる所1件。 */
export interface Impact {
  kind: ImpactKind;
  /** どの画面か。 */
  page?: string;
  /** 定義の道。**この道を辿ると、その名前に行き当たる**。 */
  path: string;
  /** その場所の呼び名（画面の言葉。無ければ項目名）。 */
  label?: string;
}

/** 画面の中の、項目を書く場所1つ（明細の中まで開いたもの）。 */
interface FieldSpot {
  node: Dict;
  path: string;
  kind: "column" | "filter" | "field";
}

/**
 * 項目を書く場所を全部（**明細（`subTable`）の中まで開く**）。
 *
 * 助言の walk（[rawFormFields]）は画面の直下しか見ない。影響を辿るときは中まで要る
 * ＝「明細の単価を消したい」がいちばん多い相談なので、ここで開く（あちらを変えると
 * 助言の鳴り方まで変わるので、この道具の側で開く）。
 */
const pathText = (parts: (string | number)[]): string =>
  parts.reduce<string>(
    (text, one) =>
      typeof one === "number" ? `${text}[${one}]` : text === "" ? one : `${text}.${one}`,
    "",
  );

function fieldSpots(page: Dict): FieldSpot[] {
  const found: FieldSpot[] = [];
  const push = (node: Dict, path: string, kind: FieldSpot["kind"]): void => {
    found.push({ node, path, kind });
    if (str(node.type) !== "subTable") return;
    dicts(node.columns).forEach((child, index) =>
      push(child, `${path}.columns[${index}]`, "column"),
    );
    dicts(node.fields).forEach((child, index) =>
      push(child, `${path}.fields[${index}]`, "field"),
    );
  };
  for (const part of tableColumns(page)) push(part.node, pathText(part.path), "column");
  for (const part of searchFilters(page)) push(part.node, pathText(part.path), "filter");
  for (const part of rawFormFields(page)) push(part.node, pathText(part.path), "field");
  return found;
}

/** 条件が書ける場所（どれも項目名を見ている）。 */
const CONDITION_KEYS = [
  "visibleWhen",
  "enabledWhen",
  "readOnlyWhen",
  "requiredWhen",
];

const pagesOf = (document: Dict): { page: Dict; path: string }[] => {
  const found: { page: Dict; path: string }[] = [];
  const app = isDict(document.app) ? document.app : undefined;
  if (app !== undefined) {
    dicts(app.pages).forEach((page, index) =>
      found.push({ page, path: `app.pages[${index}]` }),
    );
  }
  if (isDict(document.page)) found.push({ page: document.page, path: "page" });
  return found;
};

/** 条件の中で、その項目名を見ている所を全部（入れ子の all / any / not も辿る）。 */
function inCondition(node: unknown, field: string, at: string, found: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((one, index) => inCondition(one, field, `${at}[${index}]`, found));
    return;
  }
  if (!isDict(node)) return;
  if (str(node.field) === field) found.push(`${at}.field`);
  for (const key of ["all", "any", "not"]) {
    if (node[key] !== undefined) inCondition(node[key], field, `${at}.${key}`, found);
  }
}

/** 計算の中で、その項目名を見ている所を全部。 */
function inComputed(computed: Dict, field: string, at: string, found: string[]): void {
  list(computed.fields).forEach((one, index) => {
    if (one === field) found.push(`${at}.fields[${index}]`);
  });
  if (str(computed.field) === field) found.push(`${at}.field`);
  // `of` は**畳む相手の行の項目**（`op: sum, field: lines, of: amount`）。
  if (str(computed.of) === field) found.push(`${at}.of`);
  if (computed.where !== undefined) {
    inCondition(computed.where, field, `${at}.where`, found);
  }
}

/**
 * その項目名を触ると壊れる所を、定義から全部拾う。
 *
 * 空の並びが返ったら「定義のどこにも出てこない」＝呼ぶ側は**影響なしではなく、無い**と
 * 言うこと（[impactLines] がそうしている）。
 */
export function impactOf(document: Dict, field: string): Impact[] {
  const found: Impact[] = [];
  for (const { page, path } of pagesOf(document)) {
    const id = str(page.id);
    const add = (kind: ImpactKind, at: string, label?: string): void => {
      found.push({
        kind,
        ...(id === undefined ? {} : { page: id }),
        path: `${path}.${at}`,
        ...(label === undefined ? {} : { label }),
      });
    };

    if (str(page.key) === field) add("key", "key");

    for (const spot of fieldSpots(page)) {
      const at = spot.path;
      if (str(spot.node.field) === field) {
        add(spot.kind, `${at}.field`, str(spot.node.label));
      }
      // 計算・条件は「その項目を持っている所」ではなく「その項目を見ている所」。
      const computed = isDict(spot.node.computed) ? spot.node.computed : undefined;
      if (computed !== undefined) {
        const hits: string[] = [];
        inComputed(computed, field, `${at}.computed`, hits);
        for (const hit of hits) {
          add("computed", hit, str(spot.node.label) ?? str(spot.node.field));
        }
      }
      for (const key of CONDITION_KEYS) {
        if (spot.node[key] === undefined) continue;
        const hits: string[] = [];
        inCondition(spot.node[key], field, `${at}.${key}`, hits);
        for (const hit of hits) {
          add("condition", hit, str(spot.node.label) ?? str(spot.node.field));
        }
      }
    }

    for (const part of pageActions(page)) {
      const at = pathText(part.path);
      const label = str(part.node.label) ?? str(part.node.id);
      for (const key of CONDITION_KEYS) {
        if (part.node[key] === undefined) continue;
        const hits: string[] = [];
        inCondition(part.node[key], field, `${at}.${key}`, hits);
        for (const hit of hits) add("condition", hit, label);
      }
      // 遷移のパラメータ（`$row.<項目名>` で行の値を渡す）。
      const params = isDict(part.node.params) ? part.node.params : undefined;
      if (params !== undefined) {
        for (const [name, value] of Object.entries(params)) {
          if (str(value) === `$row.${field}`) add("param", `${at}.params.${name}`, label);
        }
      }
    }

    const report = isDict(page.report) ? page.report : undefined;
    if (report !== undefined) {
      list(report.groupBy).forEach((one, index) => {
        if (one === field) add("report", `report.groupBy[${index}]`);
      });
      dicts(report.totals).forEach((total, index) => {
        if (str(total.field) === field) add("report", `report.totals[${index}].field`);
      });
      const sort = isDict(report.sort) ? report.sort : undefined;
      if (sort !== undefined && str(sort.field) === field) {
        add("report", "report.sort.field");
      }
    }
  }
  return found;
}

/** その名前が定義のどこかに出てくるか（「無い」と「影響なし」を分けるため）。 */
export const nameExists = (document: Dict, field: string): boolean =>
  impactOf(document, field).length > 0 ||
  pagesOf(document).some(({ page }) => labelFor(page, field) !== undefined);

/** 人が読む形。**何を見ていないか**を必ず添える。 */
export function impactLines(document: Dict, field: string): string[] {
  const found = impactOf(document, field);
  if (found.length === 0) {
    // 影響なしではなく「無い」と言う（打ち間違いを黙って通すと、それを見て消す人が出る）。
    return [
      `"${field}" は定義のどこにも出てきません。`,
      "",
      "**影響が無い、ではありません**（名前が違うのかもしれません）。" +
        "`npx hatake explain <定義>` で項目名を確かめてください。",
    ];
  }

  const out: string[] = [
    `"${field}" を触ると、定義の ${found.length} か所に響きます。`,
    "",
    "どうしますか（消す／名前を変える／残して画面から隠す）。",
  ];
  for (const kind of IMPACT_KINDS) {
    const mine = found.filter((one) => one.kind === kind);
    if (mine.length === 0) continue;
    out.push("");
    out.push(`${IMPACT_WORDS[kind]}:`);
    for (const one of mine) {
      out.push(
        `  ・${one.page === undefined ? "" : `${one.page}: `}${one.path}` +
          `${one.label === undefined ? "" : `（${one.label}）`}`,
      );
    }
  }
  out.push("");
  out.push(IMPACT_NOTE);
  return out;
}

/** 見えない所を毎回言う（「他に影響はありません」とは言わない）。 */
export const IMPACT_NOTE =
  "※ 辿ったのは**この定義の中だけ**です。サーバ（この名前で返している項目）・" +
  "プラグインの中身・アプリ側のハンドラ・試験は**見えません**ので、そちらは人が" +
  "確かめてください。名前を変えるなら、その名前で話している所も一緒に直す必要があります。";

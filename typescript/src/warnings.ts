// 構造の間違いの静的検出。
//
// strict パースは「知らないキー」を弾く。スキーマは「型と必須」を見る。どちらも
// 通るのに**意図どおり動かない**定義がまだ書ける:
//   ・`rowActions: [approve]` … その id のアクションが無いので、ボタンが黙って出ない
//   ・`navigate` の行き先ページが無い … 押しても何も起きない
//   ・`groupBy` に `sort` が無い … グループが分裂して小計が何度も出る
//   ・条件で `between` … 条件は理解しないので、その項目が永久に出てこない
//   ・`sum` に `field` が無い … 集計が null になる
// どれも**エラーにならず、画面を見ても気づきにくい**。だから警告として言う。
//
// 見るのは素の document（strict と同じ）。解析後のモデルでは、落とされた情報や
// 既定値で埋まった情報が見えなくなるものがあるので。

import { ConditionOperators } from "./conditionEvaluator.js";
import { AggregateOps } from "./definition.js";

/** 構造の間違い1つ。`pitfall` があれば対照表（spec/pitfalls.json）を引ける。 */
export interface DefinitionWarning {
  /** 規則名。安定した識別子（機械で抑制・集計するため）。 */
  rule: string;
  /** 場所（`app.pages[2].table.rowActions[0]` のような道）。 */
  path: string;
  /** 何が起きるか。 */
  message: string;
  /** どう直すか。 */
  fix: string;
  /** 対応する対照表の id。 */
  pitfall?: string;
}

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

/** 組み込みの行アクション。宣言しなくても効く。 */
const BUILT_IN_ROW_ACTIONS = new Set(["edit", "delete"]);

/**
 * document の中の「通るけれど意図どおりに動かない」書き方を全部返す。
 * 並びは見つけた順（上から下）。
 */
export function findWarnings(document: Dict): DefinitionWarning[] {
  const found: DefinitionWarning[] = [];
  const app = isDict(document.app) ? document.app : undefined;
  const page = isDict(document.page) ? document.page : undefined;

  if (app !== undefined) {
    const pages = list(app.pages).filter(isDict);
    const pageIds = new Set(
      pages.map((p) => str(p.id)).filter((id): id is string => id !== undefined),
    );
    checkApp(app, pages, pageIds, found);
    pages.forEach((p, i) =>
      checkPage(p, `app.pages[${i}]`, pageIds, found),
    );
  }
  if (page !== undefined) {
    // 単票の定義では他のページを知らないので、遷移先の存在は確かめられない。
    checkPage(page, "page", null, found);
  }
  return found;
}

function warn(
  found: DefinitionWarning[],
  rule: string,
  path: string,
  message: string,
  fix: string,
  pitfall?: string,
): void {
  found.push({ rule, path, message, fix, ...(pitfall ? { pitfall } : {}) });
}

/** アプリ全体で辻褄が合っているか（ページの重複・初期ルート・メニューの行き先）。 */
function checkApp(
  app: Dict,
  pages: Dict[],
  pageIds: Set<string>,
  found: DefinitionWarning[],
): void {
  const seen = new Set<string>();
  pages.forEach((page, i) => {
    const id = str(page.id);
    if (id === undefined) return;
    if (seen.has(id)) {
      warn(
        found,
        "duplicate-page-id",
        `app.pages[${i}].id`,
        `ページ id "${id}" が重複しています。id でページを引くので、後ろの1枚は開けません。`,
        "どちらかの id を変えてください。",
      );
    }
    seen.add(id);
  });

  const home = str(app.home);
  if (home !== undefined) {
    const menuIds = new Set<string>();
    collectMenu(list(app.menu), menuIds);
    if (!menuIds.has(home) && !pageIds.has(home)) {
      warn(
        found,
        "unknown-home",
        "app.home",
        `初期ルート "${home}" に当たるメニュー項目もページもありません。先頭のページが開きます。`,
        "menu の id か pages の id を書いてください。",
      );
    }
  }

  walkMenu(list(app.menu), "app.menu", pageIds, found);
}

function collectMenu(items: unknown[], into: Set<string>): void {
  for (const item of items) {
    if (!isDict(item)) continue;
    const id = str(item.id);
    if (id !== undefined) into.add(id);
    collectMenu(list(item.items), into);
  }
}

function walkMenu(
  items: unknown[],
  path: string,
  pageIds: Set<string>,
  found: DefinitionWarning[],
): void {
  items.forEach((item, i) => {
    if (!isDict(item)) return;
    const at = `${path}[${i}]`;
    const page = str(item.page);
    if (page !== undefined && !pageIds.has(page)) {
      warn(
        found,
        "unknown-page",
        `${at}.page`,
        `メニューが開こうとしているページ "${page}" が pages にありません。選んでも何も出ません。`,
        "pages に定義するか、既にある id に直してください。",
      );
    }
    walkMenu(list(item.items), `${at}.items`, pageIds, found);
  });
}

/** 1ページの中の辻褄。[pageIds] が null なら遷移先の検査だけ飛ばす。 */
function checkPage(
  page: Dict,
  path: string,
  pageIds: Set<string> | null,
  found: DefinitionWarning[],
): void {
  const actions = list(page.actions).filter(isDict);
  const actionIds = new Set(
    actions.map((a) => str(a.id)).filter((id): id is string => id !== undefined),
  );

  checkActions(actions, `${path}.actions`, pageIds, found);
  checkTable(page, actionIds, path, found);
  checkForm(page, path, found);
  checkDashboard(page, actionIds, path, found);
  checkReport(page, path, found);
}

function checkActions(
  actions: Dict[],
  path: string,
  pageIds: Set<string> | null,
  found: DefinitionWarning[],
): void {
  const seen = new Set<string>();
  actions.forEach((action, i) => {
    const at = `${path}[${i}]`;
    const id = str(action.id);
    if (id !== undefined) {
      if (seen.has(id)) {
        warn(
          found,
          "duplicate-action-id",
          `${at}.id`,
          `アクション id "${id}" が重複しています。id で引くので、後ろの1つは使われません。`,
          "どちらかの id を変えてください。",
        );
      }
      seen.add(id);
    }
    // navigate の行き先と、onSuccess の遷移先。
    checkTarget(str(action.page), `${at}.page`, pageIds, found);
    const onSuccess = isDict(action.onSuccess) ? action.onSuccess : undefined;
    if (onSuccess !== undefined) {
      checkTarget(str(onSuccess.page), `${at}.onSuccess.page`, pageIds, found);
    }
  });
}

function checkTarget(
  page: string | undefined,
  path: string,
  pageIds: Set<string> | null,
  found: DefinitionWarning[],
): void {
  if (page === undefined || pageIds === null) return;
  if (pageIds.has(page)) return;
  warn(
    found,
    "unknown-page",
    path,
    `遷移先のページ "${page}" が pages にありません。押しても何も起きません。`,
    "pages に定義するか、既にある id に直してください。",
  );
}

function checkTable(
  page: Dict,
  actionIds: Set<string>,
  path: string,
  found: DefinitionWarning[],
): void {
  const table = isDict(page.table) ? page.table : undefined;
  if (table === undefined) return;
  list(table.rowActions).forEach((raw, i) => {
    const at = `${path}.table.rowActions[${i}]`;
    const id = str(raw);
    if (id === undefined) {
      warn(
        found,
        "rowactions-as-objects",
        at,
        "rowActions の要素が文字列ではありません。行アクションとして扱われません。",
        "アクション id の文字列を並べてください（実体は actions に書く）。",
        "rowactions-as-objects",
      );
      return;
    }
    if (!BUILT_IN_ROW_ACTIONS.has(id) && !actionIds.has(id)) {
      warn(
        found,
        "rowaction-not-declared",
        at,
        `行アクション "${id}" に対応する actions の定義がありません。ボタンが出ません。`,
        `actions に { id: ${id}, type: …, label: … } を足してください`
          + "（組み込みは edit / delete のみ）。",
      );
    }
  });
}

/** フォーム（と wizard のステップ）の中の項目を見る。 */
function checkForm(page: Dict, path: string, found: DefinitionWarning[]): void {
  const groups: { fields: unknown[]; path: string }[] = [];
  const form = isDict(page.form) ? page.form : undefined;
  if (form !== undefined) {
    list(form.sections).forEach((section, i) => {
      if (isDict(section)) {
        groups.push({
          fields: list(section.fields),
          path: `${path}.form.sections[${i}].fields`,
        });
      }
    });
  }
  list(page.steps).forEach((step, i) => {
    if (isDict(step)) {
      groups.push({ fields: list(step.fields), path: `${path}.steps[${i}].fields` });
    }
  });

  // フォーム全体の項目名。`optionsFrom` の指す先があるかを見るために先に集める
  // （親が子より後ろに書かれていることもある）。
  const names = new Set<string>();
  for (const group of groups) {
    for (const raw of group.fields) {
      if (!isDict(raw)) continue;
      const name = str(raw.field);
      if (name !== undefined) names.add(name);
    }
  }

  // 同じ項目名が2回あると、後ろが前を上書きして片方は無かったことになる。
  const seen = new Map<string, string>();
  for (const group of groups) {
    group.fields.forEach((raw, i) => {
      if (!isDict(raw)) return;
      const at = `${group.path}[${i}]`;
      const name = str(raw.field);
      if (name !== undefined) {
        const first = seen.get(name);
        if (first !== undefined) {
          warn(
            found,
            "duplicate-field",
            `${at}.field`,
            `項目 "${name}" が2回書かれています（${first} と同じ）。同じ値を2箇所で編集することになります。`,
            "片方を消すか、別の項目名にしてください。",
          );
        } else {
          seen.set(name, at);
        }
      }
      checkFieldEntry(raw, at, found, names);
    });
  }
}

function checkFieldEntry(
  field: Dict,
  path: string,
  found: DefinitionWarning[],
  siblings: Set<string> = new Set(),
): void {
  checkOptions(field, path, found, siblings);
  list(field.validators).forEach((raw, i) => {
    if (isDict(raw)) return;
    warn(
      found,
      "required-as-validator-only",
      `${path}.validators[${i}]`,
      "validators の要素がオブジェクトではありません。検証は足されません。",
      "`- { type: email }` の形で書いてください。",
      "required-as-validator-only",
    );
  });
  for (const key of ["visibleWhen", "enabledWhen"]) {
    const condition = field[key];
    if (isDict(condition)) checkCondition(condition, `${path}.${key}`, found);
  }
  // 明細（subTable）の行の項目も同じ規則で見る（親子は行の中で閉じている）。
  const rowFields = new Set(
    list(field.fields)
      .filter(isDict)
      .map((raw) => str(raw.field))
      .filter((name): name is string => name !== undefined),
  );
  list(field.fields).forEach((raw, i) => {
    if (isDict(raw)) {
      checkFieldEntry(raw, `${path}.fields[${i}]`, found, rowFields);
    }
  });
}

/** 選択肢の連動（`optionsFrom` / `when` / `optionsSource`）の辻褄。 */
function checkOptions(
  field: Dict,
  path: string,
  found: DefinitionWarning[],
  siblings: Set<string>,
): void {
  const parent = str(field.optionsFrom);
  const hasWhen = list(field.options)
    .filter(isDict)
    .some((option) => option.when !== undefined);

  if (parent === undefined && hasWhen) {
    warn(
      found,
      "option-when-without-optionsfrom",
      `${path}.options`,
      "選択肢に `when` があるのに `optionsFrom` が無いので、どの項目と連動するのか決まりません。全部の選択肢がそのまま出ます。",
      "`optionsFrom: <親の項目名>` を足してください。",
    );
  }
  if (parent !== undefined && siblings.size > 0 && !siblings.has(parent)) {
    warn(
      found,
      "optionsfrom-unknown-field",
      `${path}.optionsFrom`,
      `親に指定した "${parent}" がこのフォームにありません。親の値が取れないので、\`when\` 付きの選択肢は出ません。`,
      "同じフォームにある項目名を書いてください（別のフォームの項目は見えません）。",
    );
  }

  const source = isDict(field.optionsSource) ? field.optionsSource : undefined;
  if (source === undefined) return;
  if (str(source.parentKey) !== undefined && parent === undefined) {
    warn(
      found,
      "optionssource-parentkey-without-optionsfrom",
      `${path}.optionsSource.parentKey`,
      "絞り込みに使う親の値が決まらないので、`parentKey` が効きません（全件を引きます）。",
      "`optionsFrom: <親の項目名>` を足してください（親の値が `parentKey` の名前で Repository に渡ります）。",
    );
  }
  if (list(field.options).length > 0) {
    warn(
      found,
      "options-and-optionssource",
      `${path}.optionsSource`,
      "`options` と `optionsSource` の両方があります。引いてくる方が勝つので、書いた `options` は出ません。",
      "どちらかにしてください（静的な選択肢だけなら `optionsSource` を消す）。",
    );
  }
}

/** 条件は結合（all / any / not）で入れ子になる。葉の演算子だけを見る。 */
function checkCondition(
  condition: Dict,
  path: string,
  found: DefinitionWarning[],
): void {
  for (const key of ["all", "any"]) {
    list(condition[key]).forEach((raw, i) => {
      if (isDict(raw)) checkCondition(raw, `${path}.${key}[${i}]`, found);
    });
  }
  if (isDict(condition.not)) checkCondition(condition.not, `${path}.not`, found);

  const operator = str(condition.operator);
  if (operator === undefined) return;
  if ((ConditionOperators as readonly string[]).includes(operator)) return;
  warn(
    found,
    "condition-operator-unsupported",
    `${path}.operator`,
    `条件は演算子 "${operator}" を理解しません。常に false になり、この項目は出てきません。`,
    `使えるのは ${ConditionOperators.join(" / ")}`
      + "（`between` は検索専用。範囲は all + gte/lte で書く）。",
    operator === "between" ? "between-in-condition" : undefined,
  );
}

function checkDashboard(
  page: Dict,
  actionIds: Set<string>,
  path: string,
  found: DefinitionWarning[],
): void {
  list(page.items).forEach((raw, i) => {
    if (!isDict(raw)) return;
    const at = `${path}.items[${i}]`;
    const action = str(raw.action);
    if (action !== undefined && !actionIds.has(action)) {
      warn(
        found,
        "unknown-action",
        `${at}.action`,
        `カードが指しているアクション "${action}" が actions にありません。押しても何も起きません。`,
        "actions に足すか、既にある id に直してください。",
      );
    }
    if (isDict(raw.value)) checkAggregate(raw.value, `${at}.value`, found);
    if (isDict(raw.chart)) checkAggregate(raw.chart, `${at}.chart`, found);
  });
}

/** `count` 以外は畳み込む対象が要る。無いと結果が null になる（0 ではない）。 */
function checkAggregate(
  node: Dict,
  path: string,
  found: DefinitionWarning[],
): void {
  const aggregate = str(node.aggregate);
  if (aggregate === undefined || aggregate === AggregateOps.count) return;
  const field = str(node.field) ?? str(node.valueField);
  if (field !== undefined) return;
  warn(
    found,
    "aggregate-without-field",
    `${path}.aggregate`,
    `"${aggregate}" は畳み込む項目が要りますが field がありません。結果は null になります。`,
    "field（チャートなら valueField）を書いてください。count なら field は不要です。",
  );
}

function checkReport(page: Dict, path: string, found: DefinitionWarning[]): void {
  const report = isDict(page.report) ? page.report : undefined;
  if (report === undefined) return;
  const groups = list(report.groupBy);

  if (groups.length > 0 && !isDict(report.sort)) {
    warn(
      found,
      "groupby-without-sort",
      `${path}.report.groupBy`,
      "グループはコントロールブレイクなので、行がその順で届かないとグループが分裂し、小計が何度も出ます。",
      "report.sort に印刷したい並びを書いてください（並べ替えは Repository の責務）。",
      "groupby-without-sort",
    );
  }

  const table = isDict(page.table) ? page.table : undefined;
  const columns = new Set(
    list(table?.columns)
      .filter(isDict)
      .map((c) => str(c.field))
      .filter((f): f is string => f !== undefined),
  );
  if (columns.size === 0) return; // 列が無いページは別の問題（スキーマ側）
  list(report.totals).forEach((raw, i) => {
    if (!isDict(raw)) return;
    const field = str(raw.field);
    if (field === undefined || columns.has(field)) return;
    warn(
      found,
      "total-without-column",
      `${path}.report.totals[${i}].field`,
      `合計の対象 "${field}" が table.columns にありません。合計は列の下に出るので、どこにも表示されません。`,
      "その項目を table.columns に足すか、列にある項目で合計してください。",
    );
  });
}

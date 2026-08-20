// 定義が「画面の外」に要求しているもの。
//
// 定義は自分だけでは動かない。`repository: orderRepository` と書いたら、アプリ側が
// その名前で Repository を登録していないと**画面は出るがデータが来ない**。`format:
// currency` や `plugin: csvExport` も同じで、名前が合っていなければ黙って効かない。
//
// strict パースもスキーマも、この手の**外との不一致は見られない**（登録済みの一覧を
// 知らないので）。だから2つに分けた:
//
//   ・`collectRefs` … 定義が外に要求しているものを**全部列挙する**（判断はしない）
//   ・警告 … 呼び出し側が「登録済みの一覧」を渡したときだけ、無いものを指摘する
//
// 前者はアプリを配線する人（や AI）が「何を登録すればいいか」を知るために使う。
// 後者は CI で「消したのに参照が残っている」を見つけるために使う。

import {
  ActionTypes,
  AggregateOps,
  ChartKinds,
  ColumnTypes,
  DashboardItemTypes,
  FieldTypes,
  ValidatorTypes,
} from "./definition.js";
import { builtinComputeds } from "./computed.js";
import { builtinConverters } from "./converter.js";
import { builtinFormatters } from "./formatter.js";

/** 参照の種類。登録済み一覧（[DefinitionRegistry]）のキーと同じ名前。 */
export const RefKinds = {
  repositories: "repositories",
  plugins: "plugins",
  /** 出力先（`exportSink` / `printSink`）＝アプリ側で登録する「口」。 */
  sinks: "sinks",
  pages: "pages",
  fieldTypes: "fieldTypes",
  columnTypes: "columnTypes",
  actionTypes: "actionTypes",
  validators: "validators",
  formatters: "formatters",
  converters: "converters",
  computedOps: "computedOps",
  aggregates: "aggregates",
  dashboardItemTypes: "dashboardItemTypes",
  chartKinds: "chartKinds",
} as const;

export type RefKind = (typeof RefKinds)[keyof typeof RefKinds];

/** 参照1件。 */
export interface DefinitionRef {
  kind: RefKind;
  /** 参照している名前。 */
  name: string;
  /** どこで参照しているか（`app.pages[0].table.columns[2].format` のような道）。 */
  path: string;
  /**
   * Framework に組み込みで在るか。false なら**アプリ側で登録が要る**
   * （Repository / プラグインのように、組み込みが存在しない種類は常に false）。
   */
  builtIn: boolean;
}

/** 種類ごとにまとめた参照（重複なし・名前順）。 */
export type GroupedRefs = Partial<Record<RefKind, string[]>>;

/**
 * アプリ側で登録済みのものの一覧。**渡されたキーだけ**が突き合わせの対象になる
 * （知らないカテゴリを勝手に厳しくしないため）。組み込みの名前は自動で足されるので、
 * ここに書くのは**自分で足したもの**だけでよい。
 */
export type DefinitionRegistry = Partial<Record<RefKind, string[]>>;

/** 種類ごとの組み込み名。空の種類は「組み込みが無い＝必ず登録が要る」。 */
export const builtInNames: Record<RefKind, string[]> = {
  repositories: [],
  plugins: [],
  // 出力先に組み込みは無い。Framework は文書までを作り、I/O はしない。
  sinks: [],
  pages: [],
  fieldTypes: Object.values(FieldTypes),
  columnTypes: Object.values(ColumnTypes),
  actionTypes: Object.values(ActionTypes),
  validators: Object.values(ValidatorTypes),
  formatters: Object.keys(builtinFormatters),
  converters: Object.keys(builtinConverters),
  computedOps: Object.keys(builtinComputeds),
  aggregates: Object.values(AggregateOps),
  dashboardItemTypes: Object.values(DashboardItemTypes),
  chartKinds: Object.values(ChartKinds),
};

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

/**
 * document が外に要求しているものを、見つけた順に全部返す。
 *
 * 見るのは素の document（strict と同じ）。解析後のモデルでは既定値で埋まった名前と
 * 「書いてある名前」の区別が付かなくなるので。
 */
export function collectRefs(document: Dict): DefinitionRef[] {
  const app = isDict(document.app) ? document.app : undefined;
  // 自分が抱えているページは「外への要求」ではない（メニューや遷移先がその中に
  // 在るかは定義の中だけで確かめられる＝既存の警告 unknown-page の担当）。
  const declared = new Set<string>();
  if (app !== undefined) {
    for (const page of list(app.pages)) {
      const id = isDict(page) ? str(page.id) : undefined;
      if (id !== undefined) declared.add(id);
    }
  }
  const ctx: Ctx = { found: [], declared };

  if (app !== undefined) {
    list(app.pages).forEach((page, i) => {
      if (isDict(page)) collectPage(page, `app.pages[${i}]`, ctx);
    });
    collectMenu(list(app.menu), "app.menu", ctx);
    // `home` は「メニュー項目の id か、ページ id」＝どちらもこの定義の中にあるもの
    // なので、外への要求ではない（在るかは既存の警告 unknown-home の担当）。
  }
  if (isDict(document.page)) collectPage(document.page, "page", ctx);
  return ctx.found;
}

/** 走査中の持ち物（見つけたもの＋この定義が抱えているページ id）。 */
interface Ctx {
  found: DefinitionRef[];
  declared: Set<string>;
}

/** [collectRefs] の結果を種類ごとにまとめる（重複なし・名前順）。 */
export function groupRefs(refs: DefinitionRef[]): GroupedRefs {
  const grouped: GroupedRefs = {};
  for (const kind of Object.values(RefKinds)) {
    const names = [...new Set(refs.filter((r) => r.kind === kind).map((r) => r.name))];
    if (names.length > 0) grouped[kind] = names.sort();
  }
  return grouped;
}

/** 組み込みに無い＝アプリ側で登録が要る参照だけ（種類ごとにまとめて返す）。 */
export function refsNeedingRegistration(refs: DefinitionRef[]): GroupedRefs {
  return groupRefs(refs.filter((r) => !r.builtIn));
}

/**
 * 登録してあるのに、どの定義も参照していない名前（逆向きの突き合わせ）。
 *
 * [collectRefs] は「定義 → 外」を見て、足りない登録を警告にする。こちらは逆で
 * 「外 → 定義」。**消し忘れた登録は、次に読む人に「使われている」と誤解させる**
 * （消した画面の Repository がまだ在ると、そこに繋がる何かがまだ在ると読ませる）。
 * 片方向の突き合わせしか無いと、増える方向にだけ掃除が効かない。
 *
 * 見るのは [registry] に書いてある種類だけ（`collectRefs` と同じ考え方＝知らない
 * カテゴリを勝手に厳しくしない）。組み込みの名前を上書き登録している場合は、その名前を
 * 定義が使っていれば「使われている」＝出さない。
 *
 * **[refs] は突き合わせたい定義の全部から集めたものであること。** 1枚だけ渡すと、
 * 他の画面が使っている登録まで「使われていない」と出る。
 */
export function unusedRegistrations(
  registry: DefinitionRegistry,
  refs: DefinitionRef[],
): GroupedRefs {
  const used = new Set(refs.map((ref) => `${ref.kind}/${ref.name}`));
  const unused: GroupedRefs = {};
  for (const kind of Object.values(RefKinds)) {
    const registered = registry[kind];
    if (registered === undefined) continue;
    const names = [...new Set(registered)]
      .filter((name) => !used.has(`${kind}/${name}`))
      .sort();
    if (names.length > 0) unused[kind] = names;
  }
  return unused;
}

function push(ctx: Ctx, kind: RefKind, name: string, path: string): void {
  // 同じ定義の中に在るページは外への要求ではない。
  if (kind === "pages" && ctx.declared.has(name)) return;
  ctx.found.push({
    kind,
    name,
    path,
    builtIn: builtInNames[kind].includes(name),
  });
}

function collectMenu(items: unknown[], path: string, ctx: Ctx): void {
  items.forEach((raw, i) => {
    if (!isDict(raw)) return;
    const at = `${path}[${i}]`;
    const page = str(raw.page);
    if (page !== undefined) push(ctx, "pages", page, `${at}.page`);
    // 入れ子のメニューは `items`（解析後のモデルでは children だが、書く側は items）。
    collectMenu(list(raw.items), `${at}.items`, ctx);
  });
}

function collectPage(page: Dict, path: string, ctx: Ctx): void {
  const repository = str(page.repository);
  if (repository !== undefined) {
    push(ctx, "repositories", repository, `${path}.repository`);
  }

  list(page.actions).forEach((raw, i) => {
    if (isDict(raw)) collectAction(raw, `${path}.actions[${i}]`, ctx);
  });

  const search = isDict(page.search) ? page.search : undefined;
  if (search !== undefined) {
    list(search.filters).forEach((raw, i) => {
      if (!isDict(raw)) return;
      const at = `${path}.search.filters[${i}]`;
      const type = str(raw.type);
      if (type !== undefined) push(ctx, "fieldTypes", type, `${at}.type`);
      collectOptionsSource(raw.optionsSource, at, ctx);
    });
  }

  const table = isDict(page.table) ? page.table : undefined;
  if (table !== undefined) {
    collectColumns(list(table.columns), `${path}.table.columns`, ctx);
  }

  const form = isDict(page.form) ? page.form : undefined;
  if (form !== undefined) {
    list(form.sections).forEach((raw, i) => {
      if (!isDict(raw)) return;
      collectFields(list(raw.fields), `${path}.form.sections[${i}].fields`, ctx);
    });
  }
  list(page.steps).forEach((raw, i) => {
    if (!isDict(raw)) return;
    collectFields(list(raw.fields), `${path}.steps[${i}].fields`, ctx);
  });

  list(page.items).forEach((raw, i) => {
    if (!isDict(raw)) return;
    const at = `${path}.items[${i}]`;
    const type = str(raw.type);
    if (type !== undefined) push(ctx, "dashboardItemTypes", type, `${at}.type`);
    const repo = str(raw.repository);
    if (repo !== undefined) push(ctx, "repositories", repo, `${at}.repository`);
    const format = str(raw.format);
    if (format !== undefined) push(ctx, "formatters", format, `${at}.format`);
    collectDashboardValue(raw.value, `${at}.value`, ctx);
    const chart = isDict(raw.chart) ? raw.chart : undefined;
    if (chart !== undefined) {
      const kind = str(chart.kind);
      if (kind !== undefined) push(ctx, "chartKinds", kind, `${at}.chart.kind`);
      const aggregate = str(chart.aggregate);
      if (aggregate !== undefined) {
        push(ctx, "aggregates", aggregate, `${at}.chart.aggregate`);
      }
    }
    collectColumns(list(raw.columns), `${at}.columns`, ctx);
    // カードの `action` はアクション id（同じページの actions を指す）なので、
    // 外への参照ではない。宣言があるかは既存の警告 `unknown-action` の担当。
  });

  const report = isDict(page.report) ? page.report : undefined;
  if (report !== undefined) {
    list(report.totals).forEach((raw, i) => {
      if (!isDict(raw)) return;
      const aggregate = str(raw.aggregate);
      if (aggregate !== undefined) {
        push(ctx, "aggregates", aggregate, `${path}.report.totals[${i}].aggregate`);
      }
    });
  }
}

function collectAction(action: Dict, path: string, ctx: Ctx): void {
  const type = str(action.type);
  if (type !== undefined) push(ctx, "actionTypes", type, `${path}.type`);
  // 出す口。Framework は文書（CSV の文字列・紙の中身）までしか作らないので、
  // アプリ側に出力先が無ければ**ボタンは出るのに何も起きない**。定義から分かる
  // 要求なので、Repository やプラグインと同じ列に並べる。
  if (type === ActionTypes.export) {
    push(ctx, "sinks", "exportSink", `${path}.type`);
  } else if (type === ActionTypes.print) {
    push(ctx, "sinks", "printSink", `${path}.type`);
  }
  const plugin = str(action.plugin);
  if (plugin !== undefined) push(ctx, "plugins", plugin, `${path}.plugin`);
  const page = str(action.page);
  if (page !== undefined) push(ctx, "pages", page, `${path}.page`);
  const success = isDict(action.onSuccess) ? action.onSuccess : undefined;
  const next = success === undefined ? undefined : str(success.page);
  if (next !== undefined) push(ctx, "pages", next, `${path}.onSuccess.page`);
}

function collectColumns(columns: unknown[], path: string, ctx: Ctx): void {
  columns.forEach((raw, i) => {
    if (!isDict(raw)) return;
    const at = `${path}[${i}]`;
    const type = str(raw.type);
    if (type !== undefined) push(ctx, "columnTypes", type, `${at}.type`);
    const format = str(raw.format);
    if (format !== undefined) push(ctx, "formatters", format, `${at}.format`);
  });
}

function collectFields(fields: unknown[], path: string, ctx: Ctx): void {
  fields.forEach((raw, i) => {
    if (!isDict(raw)) return;
    const at = `${path}[${i}]`;
    const type = str(raw.type);
    if (type !== undefined) push(ctx, "fieldTypes", type, `${at}.type`);
    const format = str(raw.format);
    if (format !== undefined) push(ctx, "formatters", format, `${at}.format`);
    list(raw.normalize).forEach((name, j) => {
      const converter = str(name);
      if (converter !== undefined) {
        push(ctx, "converters", converter, `${at}.normalize[${j}]`);
      }
    });
    list(raw.validators).forEach((rule, j) => {
      if (!isDict(rule)) return;
      const validator = str(rule.type);
      if (validator !== undefined) {
        push(ctx, "validators", validator, `${at}.validators[${j}].type`);
      }
    });
    const computed = isDict(raw.computed) ? raw.computed : undefined;
    const op = computed === undefined ? undefined : str(computed.op);
    if (op !== undefined) push(ctx, "computedOps", op, `${at}.computed.op`);
    collectOptionsSource(raw.optionsSource, at, ctx);
    // 明細（subTable）: 子行の Repository と、行の項目も同じ規則で見る。
    const source = isDict(raw.source) ? raw.source : undefined;
    const child = source === undefined ? undefined : str(source.repository);
    if (child !== undefined) {
      push(ctx, "repositories", child, `${at}.source.repository`);
    }
    collectColumns(list(raw.columns), `${at}.columns`, ctx);
    collectFields(list(raw.fields), `${at}.fields`, ctx);
  });
}

function collectOptionsSource(
  raw: unknown,
  path: string,
  ctx: Ctx,
): void {
  const source = isDict(raw) ? raw : undefined;
  const repository = source === undefined ? undefined : str(source.repository);
  if (repository !== undefined) {
    push(ctx, "repositories", repository, `${path}.optionsSource.repository`);
  }
}

function collectDashboardValue(
  raw: unknown,
  path: string,
  ctx: Ctx,
): void {
  const value = isDict(raw) ? raw : undefined;
  if (value === undefined) return;
  const aggregate = str(value.aggregate);
  if (aggregate !== undefined) {
    push(ctx, "aggregates", aggregate, `${path}.aggregate`);
  }
}

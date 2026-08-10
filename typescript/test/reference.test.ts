import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ActionTypes,
  AggregateOps,
  buildReference,
  builtinAggregates,
  builtinComputeds,
  builtinConverters,
  builtinFormatters,
  builtinValidators,
  ChartKinds,
  ColumnTypes,
  DashboardItemTypes,
  DOCUMENT_NODE,
  FieldTypes,
  filterByPageKind,
  FilterOperators,
  lookupReference,
  PaperSizes,
  strictKeyTable,
  type ReferenceKey,
} from "../src/index.js";

const schema = JSON.parse(
  readFileSync("../spec/hatake-page.schema.json", "utf8"),
);
const reference = buildReference(schema);

const node = (name: string) => {
  const found = reference.nodes[name];
  expect(found, `${name} というノードが無い`).toBeDefined();
  return found;
};

const key = (nodeName: string, keyName: string): ReferenceKey => {
  const found = node(nodeName).keys.find((k) => k.key === keyName);
  expect(found, `${nodeName}.${keyName} が無い`).toBeDefined();
  return found!;
};

const sorted = (values: readonly string[]): string[] => [...values].sort();

describe("DSL リファレンス", () => {
  it("ページ種別を仕様書と同じ並びで並べる", () => {
    expect(reference.pageKinds.map((k) => k.type)).toEqual([
      "crud",
      "search",
      "master",
      "detail",
      "form",
      "wizard",
      "dashboard",
      "report",
    ]);
    const crud = reference.pageKinds[0];
    expect(crud.node).toEqual("crudPage");
    expect(crud.required).toEqual(["id", "repository", "title", "type"]);
  });

  it("型・既定値・最小値をスキーマから拾う", () => {
    expect(key("column", "width").type).toEqual("number");
    expect(key("column", "sortable")).toMatchObject({
      type: "boolean",
      default: false,
      required: false,
    });
    expect(key("pagination", "pageSize")).toMatchObject({
      type: "integer",
      default: 50,
      minimum: 1,
    });
    expect(key("column", "field").required).toBe(true);
    // 値が何でもいい所は any（`condition.value` は型を決めない）。
    expect(key("condition", "value").type).toEqual("any");
    expect(key("field", "defaultValue").type).toEqual(
      "string|number|boolean|null",
    );
  });

  it("閉じた集合と「組み込みの一覧」を区別する", () => {
    // enum = これ以外書けない。
    expect(key("paper", "orientation")).toMatchObject({
      values: ["portrait", "landscape"],
      open: false,
    });
    // examples = 開いた文字列。Registry で足せる。
    expect(key("paper", "size")).toMatchObject({
      values: ["A4", "A3", "B5", "letter"],
      open: true,
    });
  });

  it("入れ子は名前で辿れる（配列も要素のノード名を出す）", () => {
    expect(key(DOCUMENT_NODE, "page").nodes).toEqual([
      "crudPage",
      "searchPage",
      "masterPage",
      "detailPage",
      "formPage",
      "wizardPage",
      "dashboardPage",
      "reportPage",
    ]);
    expect(key("table", "columns")).toMatchObject({
      type: "array",
      nodes: ["column"],
    });
    // $defs に無い入れ子は <親>.<キー>（strict のキー表と同じ命名）。
    expect(key("report", "sort").nodes).toEqual(["report.sort"]);
    expect(node("report.sort").keys.map((k) => k.key)).toEqual([
      "field",
      "ascending",
    ]);
    // 文字列の配列は要素の型と取れる値を持つ。
    expect(key("field", "normalize")).toMatchObject({
      type: "array",
      items: "string",
      open: true,
    });
    expect(key("field", "normalize").values).toContain("toHankaku");
  });

  it("どのページ種別で有効かを到達関係から出す", () => {
    expect(node("report").pageKinds).toEqual(["report"]);
    expect(node("wizardStep").pageKinds).toEqual(["wizard"]);
    // ページングは一覧を持つページだけ（入力専用ページには無い）。
    expect(node("pagination").pageKinds).toEqual([
      "crud",
      "master",
      "report",
      "search",
    ]);
    // 入力項目は一覧だけのページには無い。
    expect(node("field").pageKinds).toEqual([
      "crud",
      "detail",
      "form",
      "master",
      "wizard",
    ]);
    // app / menu はページ種別に属さない。
    expect(node("menuItem").pageKinds).toEqual([]);
  });

  it("どこに書くキーかを索引で引ける", () => {
    expect(reference.keyIndex.rowsPerPage).toEqual(["report"]);
    expect(reference.keyIndex.pageSize).toEqual([
      "pagination",
      "subTableSource",
    ]);
    expect(node("column").parents).toEqual(["dashboardItem", "field", "table"]);
  });

  it("自由な入れ物は closed: false で、そう書いてある", () => {
    expect(node("field").closed).toBe(true);
    expect(node("config").closed).toBe(false);
    expect(node("config").keys).toEqual([]);
    expect(node("validator").closed).toBe(false);
  });
});

// リファレンスと strict のキー表は同じ DSL を説明している。別々に持つとズレるので、
// 片方が知らないノード/キーがあれば落とす。
describe("リファレンス vs strict のキー表", () => {
  const strictName = (name: string) => (name === "" ? DOCUMENT_NODE : name);

  it("閉じたノードのキーが1つずつ一致する", () => {
    for (const [name, keys] of Object.entries(strictKeyTable)) {
      const target = node(strictName(name));
      expect(target.closed, strictName(name)).toBe(true);
      expect(sorted(target.keys.map((k) => k.key)), strictName(name)).toEqual(
        sorted(keys),
      );
    }
  });

  it("リファレンスが閉じているノードは全部キー表にもある", () => {
    const known = new Set(Object.keys(strictKeyTable).map(strictName));
    const missing = Object.entries(reference.nodes)
      .filter(([name, n]) => n.closed && !known.has(name))
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });
});

// リファレンスの価値は「嘘をつかない」ことだけなので、載せた組み込みの名前が
// 実装のレジストリと一致することを機械で確かめる。
describe("組み込みの一覧が実装と一致する", () => {
  const values = (nodeName: string, keyName: string): string[] =>
    sorted(key(nodeName, keyName).values ?? []);

  it("フィールド型 / 列型 / アクション型", () => {
    expect(values("field", "type")).toEqual(sorted(Object.values(FieldTypes)));
    // 検索条件は subTable を取らない（子行は検索の入力にならない）。
    expect(values("filter", "type")).toEqual(
      sorted(Object.values(FieldTypes).filter((t) => t !== FieldTypes.subTable)),
    );
    expect(values("column", "type")).toEqual(sorted(Object.values(ColumnTypes)));
    expect(values("action", "type")).toEqual(sorted(Object.values(ActionTypes)));
    expect(values("dashboardItem", "type")).toEqual(
      sorted(Object.values(DashboardItemTypes)),
    );
    expect(values("chart", "kind")).toEqual(sorted(Object.values(ChartKinds)));
    expect(values("paper", "size")).toEqual(sorted(Object.values(PaperSizes)));
  });

  it("演算子は検索と条件で違う（どちらも FilterOperators の語彙）", () => {
    const all = sorted(Object.values(FilterOperators));
    const filter = values("filter", "operator");
    const condition = values("condition", "operator");
    expect(filter.every((o) => all.includes(o))).toBe(true);
    expect(condition.every((o) => all.includes(o))).toBe(true);
    // 語彙を使い切っている（片方にしか無い演算子はあってよい）。
    expect(sorted([...new Set([...filter, ...condition])])).toEqual(all);
    // 検索は範囲や前方一致を持ち、条件は空判定を持つ。
    expect(filter).toContain("between");
    expect(condition).not.toContain("between");
    expect(condition).toContain("isEmpty");
  });

  it("フォーマッタ / コンバータ / バリデータ / 集約 / 計算", () => {
    const formatters = sorted(Object.keys(builtinFormatters));
    for (const [nodeName, keyName] of [
      ["column", "format"],
      ["field", "format"],
      ["dashboardItem", "format"],
    ] as const) {
      expect(values(nodeName, keyName), `${nodeName}.${keyName}`).toEqual(
        formatters,
      );
    }
    expect(values("field", "normalize")).toEqual(
      sorted(Object.keys(builtinConverters)),
    );
    expect(values("validator", "type")).toEqual(
      sorted(Object.keys(builtinValidators())),
    );
    expect(values("field.computed", "op")).toEqual(
      sorted(Object.keys(builtinComputeds)),
    );
    const aggregates = sorted(Object.keys(builtinAggregates));
    expect(aggregates).toEqual(sorted(Object.values(AggregateOps)));
    for (const [nodeName, keyName] of [
      ["dashboardValue", "aggregate"],
      ["chart", "aggregate"],
      ["reportTotal", "aggregate"],
    ] as const) {
      expect(values(nodeName, keyName), `${nodeName}.${keyName}`).toEqual(
        aggregates,
      );
    }
  });

  it("説明文の「Built-ins:」と機械可読な値がズレていない", () => {
    // スキーマは同じことを2箇所に書いている（人が読む説明文と examples）。
    // 片方だけ直すのが一番ありそうな事故なので、ここで縛る。
    let checked = 0;
    for (const [name, target] of Object.entries(reference.nodes)) {
      for (const entry of target.keys) {
        const prose = /Built-ins?: ([^.]*)\./.exec(entry.description ?? "");
        if (prose === null) continue;
        checked++;
        expect(prose[1].split(", "), `${name}.${entry.key}`).toEqual(
          entry.values,
        );
      }
    }
    expect(checked).toBeGreaterThan(8);
  });

  it("条件の演算子は conformance に実例がある", () => {
    // 「書けると書いてあるのに3言語で動きが揃っていない」を防ぐ。
    const fixture = JSON.parse(
      readFileSync("../spec/conformance/conditions.json", "utf8"),
    ) as { condition: Record<string, unknown> }[];
    const used = new Set(
      fixture.map((c) => c.condition.operator).filter(Boolean),
    );
    for (const operator of key("condition", "operator").values ?? []) {
      expect(used.has(operator), `${operator} の conformance が無い`).toBe(true);
    }
  });
});

describe("引き方", () => {
  it("名前1つで、ノード・キー・ページ種別を同時に見る", () => {
    // report はノード名（紙の構造）でもページ種別でもある。両方返す。
    const found = lookupReference(reference, "report");
    expect(found?.node?.name).toEqual("report");
    expect(found?.pageKind?.node).toEqual("reportPage");
    expect(found?.keys?.map((k) => k.node)).toEqual(["reportPage"]);

    // キー名だけのときは「どのノードに書けるか」が答え。
    const label = lookupReference(reference, "label");
    expect(label?.node).toBeUndefined();
    expect(label?.keys?.length).toBeGreaterThan(3);

    expect(lookupReference(reference, "witdh")).toBeNull();
  });

  it("ページ種別で絞ると、その画面に関係するところだけ残る", () => {
    const only = filterByPageKind(reference, "report");
    expect(only).not.toBeNull();
    expect(only!.pageKinds.map((k) => k.type)).toEqual(["report"]);
    expect(Object.keys(only!.nodes)).toContain("report");
    expect(Object.keys(only!.nodes)).not.toContain("wizardStep");
    // 索引も一緒に絞る（残っていないノードを指さない）。
    expect(only!.keyIndex.steps).toBeUndefined();
    expect(only!.keyIndex.rowsPerPage).toEqual(["report"]);
    expect(filterByPageKind(reference, "nope")).toBeNull();
  });
});

describe("spec/reference.json", () => {
  it("コミットしてある生成物が最新である", () => {
    // 生の URL で取れる形で置いてあるので、古いままだと AI が古い仕様を読む。
    // 直し方: cd typescript && npm run build && node dist/cli.js reference \
    //         --out ../spec/reference.json
    // 改行は Windows のチェックアウト（core.autocrlf）で CRLF になるので揃えて比べる。
    const committed = readFileSync("../spec/reference.json", "utf8").replace(
      /\r\n/g,
      "\n",
    );
    expect(committed).toEqual(`${JSON.stringify(reference, null, 2)}\n`);
  });
});

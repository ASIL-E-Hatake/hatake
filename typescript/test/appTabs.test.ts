import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  diffDefinitions,
  explainSource,
  findWarnings,
  MAX_TABS,
  parseAppYaml,
  parsePageYaml,
} from "../src/index.js";

/// 画面を**並べて開く**（`app.navigation`）と、**遷移のボタンがどこに開くか**
/// （`action.open`）。
///
/// 業務システムによって作法が違う（1件ずつ処理する伝票と、見比べながら直すマスタ）ので、
/// どちらかに決め打ちしない。定義が既定を言い、アプリ側が上書きする。
///
/// 道具の側で言うことは3つ: **効かない所を言う**（並べないアプリの `open: tab`・遷移
/// ではないボタン・知らない値）・**読み返す**（どう開くか／このボタンは別のタブか）・
/// **変わったら言う**（開き方が変わるのは使い方が変わること）。
type Dict = Record<string, unknown>;

const app = (extra: string, actionExtra = "") => `
app:
  id: shop
  title: 店
${extra}  menu:
    - { id: c, label: 顧客, page: customers }
  pages:
    - type: search
      id: customers
      title: 顧客一覧
      repository: repo
      table:
        columns: [{ field: code, label: コード }]
        rowActions: [open]
      actions:
        - id: open
          type: navigate
          label: 詳細
          page: customer_detail
${actionExtra}
    - type: detail
      id: customer_detail
      title: 顧客詳細
      repository: repo
      form: { sections: [{ fields: [{ field: code, label: コード }] }] }
`;

const TABS = "  navigation: tabs\n";
const OPEN_TAB = "          open: tab";

const rules = (source: string): string[] =>
  findWarnings(parseYaml(source) as Dict).map((one) => one.rule);

describe("解析", () => {
  it("書かなければ 1画面ずつ（後方互換）", () => {
    const parsed = parseAppYaml(app(""), { strict: true });
    expect(parsed.navigation).toBe("single");
    expect(parsed.pages[0].type).toBe("search");
  });

  it("並べて開くと書ける（strict でも通る）", () => {
    expect(parseAppYaml(app(TABS), { strict: true }).navigation).toBe("tabs");
  });

  it("遷移のボタンは、どこに開くかを1件ずつ書ける（既定は同じ画面の続き）", () => {
    const page = parsePageYaml(
      `page:
  type: search
  id: customers
  title: 顧客一覧
  repository: repo
  table:
    columns: [{ field: code, label: コード }]
  actions:
    - { id: a, type: navigate, label: 詳細, page: d }
    - { id: b, type: navigate, label: 別タブ, page: d, open: tab }
`,
      { strict: true },
    );
    expect(page.actions[0].open).toBe("same");
    expect(page.actions[1].open).toBe("tab");
  });
});

describe("効かない所を言う", () => {
  it("並べて開くアプリなら黙る", () => {
    expect(rules(app(TABS, OPEN_TAB))).toEqual([]);
  });

  it("並べないアプリの `open: tab` は効かない", () => {
    const found = findWarnings(parseYaml(app("", OPEN_TAB)) as Dict);
    expect(found.map((one) => one.rule)).toEqual(["open-without-tabs"]);
    expect(found[0].path).toBe("app.pages[0].actions[0].open");
    expect(found[0].message).toContain("同じ画面の続き");
    // アプリ側で上書きしている場合もあるので、そう書いておく（嘘の断定をしない）。
    expect(found[0].fix).toContain("アプリ側で上書き");
  });

  it("遷移ではないボタンに書いても、開く先が無い", () => {
    const found = findWarnings(
      parseYaml(`page:
  type: search
  id: customers
  title: 顧客一覧
  repository: repo
  table:
    columns: [{ field: code, label: コード }]
  actions:
    - { id: csv, type: export, label: CSV, open: tab }
`) as Dict,
    );
    expect(found.map((one) => one.rule)).toEqual(["open-without-navigate"]);
  });

  it("知らない値は黙って既定になるので、そう言う", () => {
    expect(rules(app("  navigation: split\n"))).toContain("unknown-navigation");
    expect(rules(app(TABS, "          open: window"))).toContain("unknown-open");
  });
});

describe("読み返す", () => {
  const opening = (source: string): string[] =>
    explainSource(source).sections.find((one) => one.title === "画面の開き方")
      ?.lines ?? [];

  it("どう開くかを言う（上限も・上書きできることも）", () => {
    const tabs = opening(app(TABS));
    expect(tabs[0]).toContain("並べて開く");
    expect(tabs[0]).toContain(`最大 ${MAX_TABS} 枚`);
    expect(tabs[1]).toContain("アプリ側で上書きできます");

    expect(opening(app(""))[0]).toContain("1画面ずつ開く");
  });

  it("別のタブで開くボタンは、そう読み返す", () => {
    const actions = explainSource(app(TABS, OPEN_TAB), { page: "customers" })
      .sections.find((one) => one.title === "できる操作");
    expect(actions?.lines.join("\n")).toContain("別のタブで開く");
    // 既定（same）のボタンには何も足さない（当たり前のことを言わない）。
    const plain = explainSource(app(TABS), { page: "customers" }).sections.find(
      (one) => one.title === "できる操作",
    );
    expect(plain?.lines.join("\n")).not.toContain("別のタブ");
  });
});

describe("変わったら言う", () => {
  it("開き方が変わるのは、使い方が変わること", () => {
    const { changes } = diffDefinitions(
      parseYaml(app("")) as Dict,
      parseYaml(app(TABS)) as Dict,
    );
    const one = changes.find((c) => c.kind === "navigation-changed");
    expect(one?.impact).toBe("caution");
    expect(one?.message).toContain("並べて開く");
    expect(one?.message).toContain("同じ画面は2枚開きません");
  });

  it("ボタンの開き方も言う（増えるだけなので safe）", () => {
    const { changes } = diffDefinitions(
      parseYaml(app(TABS)) as Dict,
      parseYaml(app(TABS, OPEN_TAB)) as Dict,
    );
    const one = changes.find((c) => c.kind === "open-changed");
    expect(one?.impact).toBe("safe");
    expect(one?.message).toContain("別のタブで開く");
  });
});

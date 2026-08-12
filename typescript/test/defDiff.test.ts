import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { type DefinitionChange, diffDefinitions } from "../src/index.js";

const doc = (source: string): Record<string, unknown> =>
  parseYaml(source) as Record<string, unknown>;

const diff = (before: string, after: string) =>
  diffDefinitions(doc(before), doc(after));

const kindsOf = (changes: DefinitionChange[]): string[] =>
  changes.map((c) => c.kind);

/** 顧客マスタ。差し替えたい所だけ渡す。 */
const page = ({
  columns = "      - { field: code, label: コード }\n      - { field: amount, label: 金額, format: currency }",
  fields = "          - { field: code, label: コード, required: true }",
  actions = "    - { id: remove, type: delete, label: 削除, confirm: { message: 消しますか } }",
  filters = "      - { field: name, label: 顧客名, operator: contains }",
}: {
  columns?: string;
  fields?: string;
  actions?: string;
  filters?: string;
} = {}) => `
page:
  type: crud
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  key: id
  search:
    filters:
${filters}
  table:
    columns:
${columns}
  form:
    sections:
      - fields:
${fields}
  actions:
${actions}
`;

describe("画面の差分", () => {
  it("同じものなら何も出ない", () => {
    const result = diff(page(), page());
    expect(result.changes).toEqual([]);
    expect(result.compatible).toBe(true);
    expect(result.quiet).toBe(true);
  });

  it("列が消えたら、画面の話としても契約の話としても出る", () => {
    const result = diff(
      page(),
      page({ columns: "      - { field: code, label: コード }" }),
    );
    const removed = result.changes.filter((c) => c.kind === "column-removed");
    expect(removed).toHaveLength(1);
    expect(removed[0].area).toBe("ui");
    expect(removed[0].impact).toBe("caution");
    expect(removed[0].path).toBe("page.table.columns.amount");
    expect(result.quiet).toBe(false);
    // 一覧の列は「返す形」そのものなので、api 側にも（壊す変更として）出る。
    // 同じ1つの編集を、画面の話と契約の話の両方から言う。
    expect(result.compatible).toBe(false);
    expect(
      result.changes.filter((c) => c.area === "api" && c.kind === "member-removed"),
    ).toHaveLength(1);
  });

  it("列が増えるのは安全", () => {
    const result = diff(
      page({ columns: "      - { field: code, label: コード }" }),
      page(),
    );
    expect(kindsOf(result.changes)).toContain("column-added");
    expect(result.quiet).toBe(true);
  });

  it("見せ方（format）が変わったら要確認", () => {
    const result = diff(
      page(),
      page({
        columns:
          "      - { field: code, label: コード }\n      - { field: amount, label: 金額 }",
      }),
    );
    const change = result.changes.find(
      (c) => c.kind === "column-format-changed",
    );
    expect(change?.from).toBe("currency");
    expect(change?.to).toBeUndefined();
  });

  it("ボタンが消えたら要確認", () => {
    const result = diff(page(), page({ actions: "    []" }));
    expect(kindsOf(result.changes)).toContain("action-removed");
  });

  it("確認ダイアログが消えたら要確認（押した瞬間に実行される）", () => {
    const result = diff(
      page(),
      page({ actions: "    - { id: remove, type: delete, label: 削除 }" }),
    );
    const change = result.changes.find((c) => c.kind === "confirm-removed");
    expect(change?.impact).toBe("caution");
    // delete は宣言が無くても確認するので、そこは正しく言う。
    expect(change?.message).toContain("delete は宣言が無くても確認する");
  });

  it("選択肢が消えたら要確認（既存データの値が選び直せない）", () => {
    const withOptions = (options: string) =>
      page({
        fields: `          - field: status
            label: ステータス
            type: select
            options:
${options}`,
      });
    const result = diff(
      withOptions(
        "              - { value: active, label: 有効 }\n              - { value: hold, label: 保留 }",
      ),
      withOptions("              - { value: active, label: 有効 }"),
    );
    const change = result.changes.find((c) => c.kind === "option-removed");
    expect(change?.impact).toBe("caution");
    expect(change?.from).toBe('"hold"');
  });

  it("条件が変わったら要確認", () => {
    const result = diff(
      page(),
      page({
        fields:
          "          - { field: code, label: コード, required: true, readOnlyWhen: { mode: edit } }",
      }),
    );
    const change = result.changes.find((c) => c.kind === "condition-changed");
    expect(change?.path).toBe("page.form.fields.code.readOnlyWhen");
    expect(change?.message).toContain("条件が付いた");
  });

  it("検索条件の突合が変わったら要確認（同じ入力で結果が変わる）", () => {
    const result = diff(
      page(),
      page({ filters: "      - { field: name, label: 顧客名, operator: equals }" }),
    );
    const change = result.changes.find(
      (c) => c.kind === "filter-operator-changed",
    );
    expect(change?.from).toBe("contains");
    expect(change?.to).toBe("equals");
  });

  it("API の形を壊す変更は今までどおり「破壊的」", () => {
    const result = diff(
      page(),
      page({
        fields:
          "          - { field: code, label: コード, required: true, type: number }",
      }),
    );
    expect(result.compatible).toBe(false);
    expect(result.changes.some((c) => c.area === "api" && c.impact === "breaking")).toBe(
      true,
    );
  });
});

describe("権限の差分", () => {
  const withRoles = (roles: string) =>
    page({
      columns: `      - { field: code, label: コード }
      - { field: amount, label: 金額, format: currency${roles} }`,
    });

  it("狭まったら「見えなくなる人がいる」", () => {
    const result = diff(withRoles(""), withRoles(", roles: [admin]"));
    const change = result.changes.find((c) => c.area === "access");
    expect(change?.kind).toBe("roles-narrowed");
    expect(change?.from).toBe("全員");
    expect(change?.to).toBe("admin");
  });

  it("広がったら「見せすぎていないか」を言う", () => {
    const result = diff(withRoles(", roles: [admin]"), withRoles(""));
    const change = result.changes.find((c) => c.area === "access");
    expect(change?.kind).toBe("roles-widened");
    expect(change?.message).toContain("見せすぎ");
  });

  it("顔ぶれが入れ替わったら「変わった」", () => {
    const result = diff(
      withRoles(", roles: [admin]"),
      withRoles(", roles: [staff]"),
    );
    expect(result.changes.find((c) => c.area === "access")?.kind).toBe(
      "roles-changed",
    );
  });

  it("増えただけなら広がった扱い", () => {
    const result = diff(
      withRoles(", roles: [admin]"),
      withRoles(", roles: [admin, staff]"),
    );
    expect(result.changes.find((c) => c.area === "access")?.kind).toBe(
      "roles-widened",
    );
  });
});

describe("アプリ全体の差分", () => {
  const app = ({
    home = "  home: menu_orders",
    menu = "    - { id: menu_orders, label: 受注, page: order_search }",
    pages = "",
    theme = "",
  }: {
    home?: string;
    menu?: string;
    pages?: string;
    theme?: string;
  } = {}) => `
app:
  id: sales
  title: 販売管理
  dsl_version: "1.0"
${home}
${theme}
  menu:
${menu}
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      key: id
      table:
        columns:
          - { field: id, label: ID }
${pages}
`;

  const extraPage = `    - type: detail
      id: order_detail
      title: 受注詳細
      repository: orderRepository
      key: id
      form:
        sections:
          - fields:
              - { field: id, label: ID }`;

  it("ページが増えたら安全、消えたら要確認", () => {
    const added = diff(app(), app({ pages: extraPage }));
    expect(kindsOf(added.changes)).toEqual(["page-added"]);
    expect(added.quiet).toBe(true);

    const removed = diff(app({ pages: extraPage }), app());
    const change = removed.changes.find((c) => c.kind === "page-removed");
    expect(change?.impact).toBe("caution");
    expect(change?.message).toContain("ブックマーク");
  });

  it("メニューから消えたら要確認、移っただけなら安全", () => {
    const removed = diff(app(), app({ menu: "    - { id: nothing, label: 何か }" }));
    expect(kindsOf(removed.changes)).toContain("menu-removed");

    const moved = diff(
      app(),
      app({
        menu: `    - group: 販売
      items:
        - { id: menu_orders, label: 受注, page: order_search }`,
      }),
    );
    const change = moved.changes.find((c) => c.kind === "menu-moved");
    expect(change?.impact).toBe("safe");
    expect(change?.to).toBe("販売 > 受注");
  });

  it("最初に開く画面が変わったら要確認", () => {
    const result = diff(app(), app({ home: "  home: order_search" }));
    const change = result.changes.find((c) => c.kind === "home-changed");
    expect(change?.from).toBe("menu_orders");
    expect(change?.to).toBe("order_search");
  });

  it("テーマは変わっても安全", () => {
    const result = diff(app(), app({ theme: "  theme: { primaryColor: '#1565C0' }" }));
    expect(kindsOf(result.changes)).toEqual(["theme-changed"]);
    expect(result.quiet).toBe(true);
  });

  it("ページの中の変更も、どのページの話か分かる形で出る", () => {
    const result = diff(
      app(),
      app().replace(
        "          - { field: id, label: ID }",
        "          - { field: id, label: ID }\n          - { field: amount, label: 金額 }",
      ),
    );
    const change = result.changes.find((c) => c.kind === "column-added");
    expect(change?.path).toBe("pages.order_search.table.columns.amount");
  });

  it("app と単票を比べようとしたら、差分ではなく指定間違いとして言う", () => {
    expect(() => diff(app(), page())).toThrowError(/同じ種類のもの同士/);
  });
});

describe("同梱の例", () => {
  it("例を自分自身と比べれば変更ゼロ（＝判定が壊れていない）", () => {
    const dir = "../spec/examples";
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".yaml"))) {
      const source = readFileSync(`${dir}/${file}`, "utf8");
      const result = diffDefinitions(doc(source), doc(source));
      expect(result.changes, file).toEqual([]);
      expect(result.compatible, file).toBe(true);
      expect(result.quiet, file).toBe(true);
    }
  });
});

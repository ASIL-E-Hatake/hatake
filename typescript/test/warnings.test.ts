import { readdirSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  buildReference,
  ConditionOperators,
  findWarnings,
  type PitfallCatalog,
} from "../src/index.js";

/** YAML を1つ食わせて、出た規則名を並べる。 */
const rulesOf = (yaml: string): string[] =>
  findWarnings(parseYaml(yaml) as Record<string, unknown>).map((w) => w.rule);

const warningsOf = (yaml: string) =>
  findWarnings(parseYaml(yaml) as Record<string, unknown>);

describe("行アクション", () => {
  it("宣言していない id は、ボタンが出ないことを指摘する", () => {
    // strict もスキーマも通る。実行すると黙ってボタンが消えるだけ。
    const found = warningsOf(`
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  table:
    rowActions: [edit, approve]
    columns: [{ field: orderNo, label: 受注番号 }]
`);
    expect(found.map((w) => w.rule)).toEqual(["rowaction-not-declared"]);
    expect(found[0].path).toBe("page.table.rowActions[1]");
    expect(found[0].message).toContain("approve");
    expect(found[0].fix).toContain("edit / delete");
  });

  it("組み込み（edit / delete）と宣言済みは黙る", () => {
    expect(
      rulesOf(`
page:
  type: crud
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  table:
    rowActions: [edit, delete, detail]
    columns: [{ field: code, label: コード }]
  actions:
    - { id: detail, type: plugin, plugin: openDetail, label: 詳細 }
`),
    ).toEqual([]);
  });

  it("文字列でない要素は行アクションにならない", () => {
    expect(
      rulesOf(`
page:
  type: search
  id: s
  title: S
  repository: r
  table:
    rowActions: [{ id: edit, label: 編集 }]
    columns: [{ field: a, label: A }]
`),
    ).toEqual(["rowactions-as-objects"]);
  });
});

describe("遷移先", () => {
  const app = (pages: string, extra = "") => `
app:
  id: sales
  title: 販売管理
${extra}  pages:
${pages}
`;

  it("存在しないページへの navigate を指摘する", () => {
    const found = warningsOf(
      app(`    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      actions:
        - { id: detail, type: navigate, label: 詳細, page: order_detail }`),
    );
    expect(found.map((w) => w.rule)).toEqual(["unknown-page"]);
    expect(found[0].path).toBe("app.pages[0].actions[0].page");
  });

  it("onSuccess の遷移先も見る", () => {
    expect(
      rulesOf(
        app(`    - type: crud
      id: customer_master
      title: 顧客マスタ
      repository: customerRepository
      actions:
        - id: delete
          type: delete
          label: 削除
          onSuccess: { message: 削除しました, page: customer_list }`),
      ),
    ).toEqual(["unknown-page"]);
  });

  it("メニューの行き先と初期ルートも見る", () => {
    const found = warningsOf(
      app(
        `    - { type: search, id: order_search, title: 受注照会, repository: orderRepository }`,
        `  home: nowhere
  menu:
    - { id: orders, label: 受注, page: missing_page }
`,
      ),
    );
    expect(found.map((w) => w.rule)).toEqual(["unknown-home", "unknown-page"]);
  });

  it("単票の定義では遷移先を判定しない（他のページを知らないので）", () => {
    expect(
      rulesOf(`
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  actions:
    - { id: detail, type: navigate, label: 詳細, page: order_detail }
`),
    ).toEqual([]);
  });

  it("ページ id の重複を指摘する", () => {
    expect(
      rulesOf(
        app(`    - { type: search, id: dup, title: A, repository: r }
    - { type: master, id: dup, title: B, repository: r }`),
      ),
    ).toEqual(["duplicate-page-id"]);
  });
});

describe("条件", () => {
  const withCondition = (condition: string) => `
page:
  type: form
  id: customer_form
  title: 顧客入力
  repository: customerRepository
  form:
    sections:
      - fields:
          - { field: age, label: 年齢, type: number }
          - field: note
            label: 備考
            visibleWhen:
${condition}
`;

  it("条件が理解しない演算子を指摘する（黙って false になる）", () => {
    const found = warningsOf(
      withCondition("              { field: age, operator: between, value: [20, 65] }"),
    );
    expect(found.map((w) => w.rule)).toEqual(["condition-operator-unsupported"]);
    expect(found[0].message).toContain("常に false");
    // 対照表を引けるようにしておく。
    expect(found[0].pitfall).toBe("between-in-condition");
  });

  it("入れ子（all / any / not）の中も見る", () => {
    expect(
      rulesOf(
        withCondition(`              all:
                - { field: age, operator: gte, value: 20 }
                - { field: name, operator: startsWith, value: 山 }`),
      ),
    ).toEqual(["condition-operator-unsupported"]);
  });

  it("使える演算子は全部黙る", () => {
    for (const operator of ConditionOperators) {
      expect(
        rulesOf(withCondition(`              { field: age, operator: ${operator} }`)),
        operator,
      ).toEqual([]);
    }
  });
});

describe("集計", () => {
  it("count 以外で field が無いと null になることを指摘する", () => {
    const found = warningsOf(`
page:
  type: dashboard
  id: sales_dashboard
  title: 売上
  repository: orderRepository
  items:
    - { id: total, title: 売上合計, value: { aggregate: sum } }
    - { id: byCustomer, type: chart, title: 顧客別,
        chart: { kind: bar, labelField: customer, aggregate: sum } }
`);
    expect(found.map((w) => w.rule)).toEqual([
      "aggregate-without-field",
      "aggregate-without-field",
    ]);
    expect(found[1].fix).toContain("valueField");
  });

  it("count は field が無くてよい", () => {
    expect(
      rulesOf(`
page:
  type: dashboard
  id: d
  title: D
  repository: r
  items:
    - { id: count, title: 件数, value: { aggregate: count } }
    - { id: plain, title: 件数 }
`),
    ).toEqual([]);
  });
});

describe("帳票", () => {
  const report = (body: string) => `
page:
  type: report
  id: sales_report
  title: 売上明細表
  repository: orderRepository
  table:
    columns:
      - { field: customer, label: 顧客名 }
      - { field: amount, label: 金額, type: number }
  report:
${body}
`;

  /** 列と紙を指定できる帳票（紙に入るかを見るため）。 */
  const paper = (columns: string, body = "    rowsPerPage: 30") => `
page:
  type: report
  id: sales_report
  title: 売上明細表
  repository: orderRepository
  table:
    columns:
${columns}
  report:
${body}
`;

  describe("紙に入らない", () => {
    it("列の幅の合計が紙幅を超えたら言う（画面の px をそのまま書いた形）", () => {
      const source = paper(`      - { field: a, label: あ, width: 200 }
      - { field: b, label: い, width: 200 }
      - { field: c, label: う, width: 200 }`);
      expect(rulesOf(source)).toContain("columns-wider-than-paper");
      const found = warningsOf(source).find(
        (w) => w.rule === "columns-wider-than-paper",
      );
      // 数を出す（「入りません」だけでは、どれだけ減らせばいいか分からない）。
      expect(found?.message).toContain("A4 縦の紙幅 595.28pt");
      expect(found?.message).toContain("最低 600pt");
      expect(found?.fix).toContain("landscape");
    });

    it("幅の指定が無い列にも最低幅を数える（残りに何も渡らない形）", () => {
      const source = paper(`      - { field: a, label: あ, width: 560 }
      - { field: b, label: い }`);
      expect(rulesOf(source)).toContain("columns-wider-than-paper");
      expect(
        warningsOf(source).find((w) => w.rule === "columns-wider-than-paper")
          ?.message,
      ).toContain("指定の無い 1 列に最低 40pt");
    });

    it("横向きなら入るものは言わない", () => {
      const source = paper(
        `      - { field: a, label: あ, width: 300 }
      - { field: b, label: い, width: 300 }`,
        "    paper: { size: A4, orientation: landscape }",
      );
      expect(rulesOf(source)).not.toContain("columns-wider-than-paper");
    });

    it("同梱の例のような幅なら言わない（誤検出しない）", () => {
      const source = paper(`      - { field: a, label: あ, width: 140 }
      - { field: b, label: い, width: 120 }
      - { field: c, label: う, width: 100 }
      - { field: d, label: え }`);
      expect(rulesOf(source)).not.toContain("columns-wider-than-paper");
    });

    it("1枚の行数が多すぎたら、1行あたりの高さを出して言う", () => {
      const source = paper(
        "      - { field: a, label: あ }",
        "    rowsPerPage: 120",
      );
      expect(rulesOf(source)).toContain("rows-per-page-too-many");
      const found = warningsOf(source).find(
        (w) => w.rule === "rows-per-page-too-many",
      );
      expect(found?.message).toContain("1枚 120 行だと1行あたり 7.02pt");
      expect(found?.message).toContain("A4 縦の高さ 841.89pt ÷ 120 行");
    });

    it("A4 に 40 行は言わない（既定の使い方を否定しない）", () => {
      const source = paper(
        "      - { field: a, label: あ }",
        "    rowsPerPage: 40",
      );
      expect(rulesOf(source)).not.toContain("rows-per-page-too-many");
    });

    it("知らない紙には何も言わない（Renderer が独自の紙を知っていてよい）", () => {
      const source = paper(
        `      - { field: a, label: あ, width: 2000 }`,
        "    paper: { size: ハトロン判 }\n    rowsPerPage: 500",
      );
      expect(rulesOf(source)).not.toContain("columns-wider-than-paper");
      expect(rulesOf(source)).not.toContain("rows-per-page-too-many");
    });
  });

  it("sort の無い groupBy を指摘する", () => {
    const found = warningsOf(
      report("    groupBy: [{ field: customer, label: 顧客 }]"),
    );
    expect(found.map((w) => w.rule)).toEqual(["groupby-without-sort"]);
    expect(found[0].pitfall).toBe("groupby-without-sort");
  });

  it("sort があれば黙る", () => {
    expect(
      rulesOf(
        report(`    sort: { field: customer }
    groupBy: [{ field: customer, label: 顧客 }]`),
      ),
    ).toEqual([]);
  });

  it("列に無い項目の合計は、どこにも出ないことを指摘する", () => {
    const found = warningsOf(report("    totals: [{ field: tax, aggregate: sum }]"));
    expect(found.map((w) => w.rule)).toEqual(["total-without-column"]);
    expect(found[0].message).toContain("tax");
  });
});

describe("フォーム", () => {
  it("同じ項目を2回書くと片方が無かったことになる", () => {
    const found = warningsOf(`
page:
  type: form
  id: f
  title: F
  repository: r
  form:
    sections:
      - { title: 基本, fields: [{ field: code, label: コード }] }
      - { title: 詳細, fields: [{ field: code, label: コード（再） }] }
`);
    expect(found.map((w) => w.rule)).toEqual(["duplicate-field"]);
    expect(found[0].path).toBe("page.form.sections[1].fields[0].field");
  });

  it("validators に文字列を並べても検証は増えない", () => {
    expect(
      rulesOf(`
page:
  type: form
  id: f
  title: F
  repository: r
  form:
    sections:
      - fields:
          - { field: mail, label: メール, validators: [required, email] }
`),
    ).toEqual(["required-as-validator-only", "required-as-validator-only"]);
  });

  it("wizard のステップも同じ規則で見る", () => {
    expect(
      rulesOf(`
page:
  type: wizard
  id: w
  title: W
  repository: r
  steps:
    - { id: a, title: A, fields: [{ field: code, label: コード }] }
    - { id: b, title: B, fields: [{ field: code, label: コード }] }
`),
    ).toEqual(["duplicate-field"]);
  });
});

describe("選択肢の連動", () => {
  const form = (fields: string) => `
page:
  type: form
  id: customer_form
  title: 顧客入力
  repository: customerRepository
  form:
    sections:
      - fields:
${fields}
`;

  it("when があるのに optionsFrom が無いと、絞り込みが効かない", () => {
    expect(
      rulesOf(
        form(`          - field: city
            label: 市区町村
            type: select
            options:
              - { value: shibuya, label: 渋谷区, when: tokyo }`),
      ),
    ).toEqual(["option-when-without-optionsfrom"]);
  });

  it("親に指定した項目がフォームに無いと、子の選択肢が出ない", () => {
    const found = warningsOf(
      form(`          - field: city
            label: 市区町村
            type: select
            optionsFrom: prefecture
            options:
              - { value: shibuya, label: 渋谷区, when: tokyo }`),
    );
    expect(found.map((w) => w.rule)).toEqual(["optionsfrom-unknown-field"]);
    expect(found[0].message).toContain("prefecture");
  });

  it("親が同じフォームにあれば黙る", () => {
    expect(
      rulesOf(
        form(`          - { field: prefecture, label: 都道府県, type: select }
          - field: city
            label: 市区町村
            type: select
            optionsFrom: prefecture
            options:
              - { value: shibuya, label: 渋谷区, when: tokyo }`),
      ),
    ).toEqual([]);
  });

  it("parentKey があるのに optionsFrom が無いと、全件引いてしまう", () => {
    expect(
      rulesOf(
        form(`          - field: city
            label: 市区町村
            type: select
            optionsSource: { repository: cityRepository, parentKey: prefecture }`),
      ),
    ).toEqual(["optionssource-parentkey-without-optionsfrom"]);
  });

  it("options と optionsSource の両方は書けない（引いた方が勝つ）", () => {
    expect(
      rulesOf(
        form(`          - field: city
            label: 市区町村
            type: select
            options: [{ value: shibuya, label: 渋谷区 }]
            optionsSource: { repository: cityRepository }`),
      ),
    ).toEqual(["options-and-optionssource"]);
  });

  it("検索条件でも同じ規則で見る（親は同じ検索欄の条件）", () => {
    const search = (filters: string) => `
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  search:
    filters:
${filters}
  table:
    columns:
      - { field: orderNo, label: 受注番号 }
`;
    const found = warningsOf(
      search(`      - field: city
        label: 市区町村
        type: select
        optionsFrom: prefecture
        options:
          - { value: shibuya, label: 渋谷区, when: tokyo }`),
    );
    expect(found.map((w) => w.rule)).toEqual(["optionsfrom-unknown-field"]);
    expect(found[0].message).toContain("検索欄");
    // 親を足せば黙る。
    expect(
      rulesOf(
        search(`      - { field: prefecture, label: 都道府県, type: select }
      - field: city
        label: 市区町村
        type: select
        optionsFrom: prefecture
        options:
          - { value: shibuya, label: 渋谷区, when: tokyo }`),
      ),
    ).toEqual([]);
  });
});

describe("項目制御の条件", () => {
  const form = (field: string) => `
page:
  type: form
  id: customer_form
  title: 顧客入力
  repository: customerRepository
  form:
    sections:
      - fields:
${field}
`;

  it("required: true と requiredWhen の両方は、条件の方が意味を持たない", () => {
    expect(
      rulesOf(
        form(`          - field: invoiceNo
            label: 登録番号
            required: true
            requiredWhen: { field: kind, value: corp }`),
      ),
    ).toEqual(["requiredwhen-with-required"]);
  });

  it("readOnly: true と readOnlyWhen の両方も同じ", () => {
    expect(
      rulesOf(
        form(`          - field: memberNo
            label: 会員番号
            readOnly: true
            readOnlyWhen: { field: kind, value: personal }`),
      ),
    ).toEqual(["readonlywhen-with-readonly"]);
  });

  it("条件つきの指定だけなら黙る", () => {
    expect(
      rulesOf(
        form(`          - field: invoiceNo
            label: 登録番号
            requiredWhen: { field: kind, value: corp }
            readOnlyWhen: { field: kind, value: personal }`),
      ),
    ).toEqual([]);
  });

  it("条件つき必須・読み取り専用の中の演算子も見る", () => {
    expect(
      rulesOf(
        form(`          - field: invoiceNo
            label: 登録番号
            requiredWhen: { field: amount, operator: between, value: [1, 2] }`),
      ),
    ).toEqual(["condition-operator-unsupported"]);
  });

  it("セクションの条件の中の演算子も見る", () => {
    expect(
      rulesOf(`
page:
  type: form
  id: customer_form
  title: 顧客入力
  repository: customerRepository
  form:
    sections:
      - title: 請求先
        visibleWhen: { field: amount, operator: between, value: [1, 2] }
        fields:
          - { field: billingCode, label: 請求先コード }
`),
    ).toEqual(["condition-operator-unsupported"]);
  });
});

describe("項目間の検証（compare）", () => {
  const form = (validators: string) => `page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - { field: startDate, label: 開始日, type: date }
          - field: endDate
            label: 終了日
            type: date
            validators:
${validators}
`;

  // 相手が見つからないと**黙って通る**ので、画面を見ても気づけない。
  it("相手の項目名が同じフォームに無ければ言う（近い名前も出す）", () => {
    const found = warningsOf(
      form("              - { type: compare, operator: gte, field: startDte }"),
    ).filter((one) => one.rule === "compare-unknown-field");
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain("黙って通ります");
    expect(found[0].fix).toContain("startDate");
  });

  it("相手が書いていなければ言う", () => {
    const found = warningsOf(form("              - { type: compare, operator: gte }"));
    expect(found.map((one) => one.rule)).toContain("compare-without-field");
  });

  it("自分と比べていれば言う（いつも同じ値）", () => {
    const found = warningsOf(
      form("              - { type: compare, operator: gte, field: endDate }"),
    );
    expect(found.map((one) => one.rule)).toContain("compare-with-itself");
  });

  it("大小を比べられない突合は言う（何が使えるかまで）", () => {
    const found = warningsOf(
      form("              - { type: compare, operator: contains, field: startDate }"),
    ).filter((one) => one.rule === "compare-bad-operator");
    expect(found).toHaveLength(1);
    expect(found[0].fix).toContain("gte");
  });

  it("畳む項目が無い集約は言う（count 以外）", () => {
    const found = warningsOf(
      form(
        "              - { type: compare, operator: equals, field: startDate, aggregate: sum }",
      ),
    );
    expect(found.map((one) => one.rule)).toContain("compare-aggregate-without-of");
  });

  it("正しく書いてあれば何も言わない", () => {
    expect(
      rulesOf(form("              - { type: compare, operator: gte, field: startDate }")),
    ).toEqual([]);
  });

  it("共有フィクスチャ（conformance）は警告ゼロで書けている", () => {
    // 「書けると書いてあるのに、その書き方が警告される」を防ぐ。
    const fixture = JSON.parse(
      readFileSync("../spec/conformance/cross_field_validation.json", "utf8"),
    );
    expect(findWarnings(fixture.page)).toEqual([]);
  });
});

describe("開ける人が居ない画面", () => {
  /** admin だけの画面から manager だけのボタンで繋ぐ＝両方持っている人が居ない。 */
  const app = (roles: string) => `app:
  id: sales
  title: 販売
  menu:
    - group: マスタ
      roles: [admin]
      items:
        - { label: 顧客, page: customer_master }
  pages:
    - type: master
      id: customer_master
      title: 顧客マスタ
      repository: customerRepository
      key: code
      table:
        columns: [{ field: code, label: コード }]
      actions:
        - { id: openPrice, type: navigate, label: 単価, page: price_master${roles} }
    - type: master
      id: price_master
      title: 単価マスタ
      repository: priceRepository
      key: code
      table:
        columns: [{ field: code, label: コード }]
`;

  // ページに roles は書けないので、1枚ずつ読んでも絶対に出てこない。
  it("入口の権限が食い違っていると言う（どこを直すかまで）", () => {
    const found = warningsOf(app(", roles: [manager]")).filter(
      (one) => one.rule === "page-nobody-can-open",
    );
    expect(found).toHaveLength(1);
    expect(found[0].path).toBe("app.pages[1]");
    expect(found[0].message).toContain('画面 "price_master" を開ける人が居ません');
    // 入口と、その手前の画面を開ける人を言う（これが無いと直せない）。
    expect(found[0].message).toContain("customer_master の「単価」= manager");
    expect(found[0].message).toContain("admin だけ");
    expect(found[0].fix).toContain("roles");
  });

  it("噛み合っていれば言わない", () => {
    expect(rulesOf(app(", roles: [admin]"))).not.toContain("page-nobody-can-open");
    expect(rulesOf(app(""))).not.toContain("page-nobody-can-open");
  });

  // 入口が無いのは「アプリ側のコードから開く」ことがある＝意図の話なので、警告にはしない。
  it("入口がまったく無い画面は言わない（意図の話は助言の担当）", () => {
    const orphan = `app:
  id: sales
  title: 販売
  menu:
    - { id: customers, label: 顧客, page: customer_master }
  pages:
    - type: master
      id: customer_master
      title: 顧客マスタ
      repository: customerRepository
      key: code
      table:
        columns: [{ field: code, label: コード }]
    - type: master
      id: price_master
      title: 単価マスタ
      repository: priceRepository
      key: code
      table:
        columns: [{ field: code, label: コード }]
`;
    expect(rulesOf(orphan)).not.toContain("page-nobody-can-open");
  });

  it("単票の定義では言わない（入口の話が無い）", () => {
    const page = `page:
  type: master
  id: price_master
  title: 単価マスタ
  repository: priceRepository
  key: code
  table:
    columns: [{ field: code, label: コード }]
`;
    expect(rulesOf(page)).not.toContain("page-nobody-can-open");
  });

  it("同梱の見本（roles-app.yaml）はこの警告を1件持っている", () => {
    // わざと残してある（図と警告の両方の見本）。消えたら、見本が見本でなくなる。
    const source = readFileSync("../docs/diagrams/roles-app.yaml", "utf8");
    expect(rulesOf(source).filter((one) => one === "page-nobody-can-open")).toHaveLength(1);
  });
});

describe("同梱の資料との辻褄", () => {
  it("同梱の例はすべて警告ゼロ（＝規則がうるさすぎない証拠）", () => {
    const dir = "../spec/examples";
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".yaml"))) {
      const found = warningsOf(readFileSync(`${dir}/${file}`, "utf8"));
      expect(found, `${file}: ${JSON.stringify(found, null, 2)}`).toEqual([]);
    }
  });

  it("デモの定義も警告ゼロ", () => {
    const demo = readFileSync(
      "../flutter/packages/hatake_example/assets/sales_app.yaml",
      "utf8",
    );
    expect(warningsOf(demo)).toEqual([]);
  });

  it("対照表の「落ちない類」は、静的検出でも拾えるものは拾う", () => {
    // 対照表に載せた bad の無い項目のうち、定義を見れば分かるものは警告で拾いたい。
    const catalog = JSON.parse(
      readFileSync("../spec/pitfalls.json", "utf8"),
    ) as PitfallCatalog;
    const detectable = ["groupby-without-sort", "between-in-condition",
      "rowactions-as-objects", "required-as-validator-only"];
    for (const id of detectable) {
      expect(catalog.pitfalls.some((p) => p.id === id), id).toBe(true);
    }
  });

  it("警告が指す対照表の id は実在する", () => {
    const catalog = JSON.parse(
      readFileSync("../spec/pitfalls.json", "utf8"),
    ) as PitfallCatalog;
    const ids = new Set(catalog.pitfalls.map((p) => p.id));
    const samples = [
      `page: { type: report, id: r, title: R, repository: repo,
        table: { columns: [{ field: a, label: A }] },
        report: { groupBy: [{ field: a, label: A }] } }`,
      `page: { type: form, id: f, title: F, repository: repo,
        form: { sections: [{ fields: [{ field: a, label: A,
          visibleWhen: { field: b, operator: between, value: 1 } }] }] } }`,
    ];
    for (const sample of samples) {
      for (const warning of warningsOf(sample)) {
        if (warning.pitfall === undefined) continue;
        expect(ids.has(warning.pitfall), warning.pitfall).toBe(true);
      }
    }
  });

  it("条件の演算子一覧が spec と一致する", () => {
    // 警告はこの一覧で判定するので、ズレると「使えるのに警告が出る」になる。
    const reference = buildReference(
      JSON.parse(readFileSync("../spec/hatake-page.schema.json", "utf8")),
    );
    const declared = reference.nodes.condition.keys.find(
      (k) => k.key === "operator",
    )?.values;
    expect([...ConditionOperators].sort()).toEqual([...declared!].sort());
  });
});

describe("実行前に聞くボタン", () => {
  const action = (body: string) => `
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  search:
    filters: [{ field: status, label: 状態 }]
  table:
    columns: [{ field: orderNo, label: 受注番号, sortable: true }]
  actions:
${body}
`;

  it("聞いた値を受け取れない型なら、そう言う", () => {
    const found = warningsOf(action(`    - id: csv
      type: export
      label: CSV出力
      prompt:
        fields: [{ field: memo, label: メモ }]`));
    const w = found.find((x) => x.rule === "prompt-unsupported-type");
    expect(w?.path).toBe("page.actions[0].prompt");
    expect(w?.message).toContain("入力は捨てられます");
    expect(w?.fix).toContain("ActionContext.input");
  });

  it("plugin なら黙る", () => {
    expect(
      rulesOf(action(`    - id: reject
      type: plugin
      plugin: rejectOrders
      label: 却下
      roles: [manager]
      prompt:
        fields: [{ field: reason, label: 理由, required: true }]`)),
    ).toEqual([]);
  });

  it("聞くことが1つも無い prompt は読めない（confirm の領分）", () => {
    expect(() =>
      warningsOf(action(`    - id: reject
      type: plugin
      plugin: rejectOrders
      label: 却下
      prompt:
        fields: []`)),
    ).not.toThrow(); // 素の document を見る警告は落ちない
  });
});

describe("埋まらない差し込み", () => {
  const action = (body: string) => `
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    columns: [{ field: orderNo, label: 受注番号, sortable: true }]
  search:
    filters: [{ field: status, label: 状態 }]
  actions:
${body}
`;

  it("件数の差し込みは一括のときだけ埋まる", () => {
    const found = warningsOf(action(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 承認
      onSuccess: { message: '{count} 件を承認しました' }`));
    const w = found.find((x) => x.rule === "placeholder-not-filled");
    expect(w?.path).toBe("page.actions[0].onSuccess.message");
    expect(w?.message).toContain("{count}");
    expect(w?.message).toContain("scope: selection");
  });

  it("一括なら言わない", () => {
    expect(
      rulesOf(action(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 一括承認
      scope: selection
      roles: [admin]
      confirm: { message: 承認します }
      onSuccess: { message: '{count} 件を承認しました' }
      onError: { message: '{failed} 件は締め済みでした' }`)),
    ).toEqual([]);
  });

  it("成功の文言に {error} は埋まらない（失敗の理由が無い）", () => {
    const found = warningsOf(action(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 承認
      onSuccess: { message: '承認しました（{error}）' }`));
    const w = found.find((x) => x.rule === "placeholder-not-filled");
    expect(w?.path).toBe("page.actions[0].onSuccess.message");
    expect(w?.fix).toContain("onError.message");
  });

  it("失敗の文言の {error} は埋まる（言わない）", () => {
    expect(
      rulesOf(action(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 承認
      onError: { message: '承認できません（{error}）' }`)),
    ).toEqual([]);
  });

  // 項目名を書くのは「差し込みは開いている」と思ったとき。開いていないので、
  // そのまま文字で出る（押すまで気づけない）。
  it("知らない差し込み（項目名）は埋まらない", () => {
    const found = warningsOf(action(`    - id: save
      type: plugin
      plugin: saveOrder
      label: 登録
      onSuccess: { message: '受注 {orderNo} を登録しました' }`));
    const w = found.find((x) => x.rule === "placeholder-not-filled");
    expect(w?.path).toBe("page.actions[0].onSuccess.message");
    expect(w?.message).toContain("{orderNo}");
    expect(w?.message).toContain("{count} / {failed} / {total} / {error}");
    expect(w?.fix).toContain("文言に差し込めません");
  });

  it("知らない差し込みは同じものを2回言わない", () => {
    const found = warningsOf(action(`    - id: save
      type: plugin
      plugin: saveOrder
      label: 登録
      onSuccess: { message: '{orderNo} と {orderNo} と {customer}' }`));
    const w = found.filter((x) => x.rule === "placeholder-not-filled");
    expect(w).toHaveLength(1);
    expect(w[0].message).toContain("{orderNo} / {customer}");
  });

  it("form の画面に置いた新規登録のボタンは押しても何も起きない", () => {
    const found = warningsOf(`page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections: [{ fields: [{ field: orderNo, label: 受注番号 }] }]
  actions:
    - { id: create, type: create, label: 新規登録 }
`);
    const w = found.find((x) => x.rule === "create-action-unusable");
    expect(w?.path).toBe("page.actions[0].type");
    expect(w?.message).toContain("押しても何も起きません");
    expect(w?.fix).toContain("保存ボタンが最初から出ています");
  });

  it("crud / master の新規登録は言わない（そこが本来の置き場所）", () => {
    for (const kind of ["crud", "master"]) {
      const found = warningsOf(`page:
  type: ${kind}
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  key: id
  table:
    columns: [{ field: id, label: ID }]
  form:
    sections: [{ fields: [{ field: id, label: ID }] }]
  actions:
    - { id: create, type: create, label: 新規登録 }
`);
      expect(found.map((x) => x.rule), kind).not.toContain(
        "create-action-unusable",
      );
    }
  });

  it("一覧だけの画面でも言う（開く先の枠が無い）", () => {
    const found = warningsOf(`page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    columns: [{ field: orderNo, label: 受注番号 }]
  actions:
    - { id: create, type: create, label: 新規登録 }
`);
    const w = found.find((x) => x.rule === "create-action-unusable");
    expect(w?.fix).toContain("navigate");
  });

  it("差し込みが無ければ言わない", () => {
    expect(
      rulesOf(action(`    - id: save
      type: plugin
      plugin: saveOrder
      label: 登録
      onSuccess: { message: '登録しました' }`)),
    ).toEqual([]);
  });
});

describe("選んだ行に対して実行するボタン", () => {
  it("表の無い画面に置いたら、選ぶ手段が無いと言う", () => {
    const found = warningsOf(`
page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  form:
    sections:
      - fields: [{ field: orderNo, label: 受注番号, required: true }]
  actions:
    - { id: approve, type: plugin, plugin: approveOrders, label: 一括承認, scope: selection }
`);
    const w = found.find((x) => x.rule === "selection-without-table");
    expect(w?.path).toBe("page.actions[0].scope");
    expect(w?.message).toContain("表が");
    expect(w?.fix).toContain("search");
  });

  it("plugin 以外の型に書いたら、実行されないと言う", () => {
    const found = warningsOf(`
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    columns: [{ field: orderNo, label: 受注番号 }]
  actions:
    - { id: csv, type: export, label: 一括出力, scope: selection }
`);
    const w = found.find((x) => x.rule === "selection-unsupported-type");
    expect(w?.path).toBe("page.actions[0].type");
    expect(w?.fix).toContain("type: plugin");
  });

  it("一覧に置いた plugin なら黙る", () => {
    expect(
      rulesOf(`
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  search:
    filters: [{ field: status, label: 状態 }]
  table:
    columns: [{ field: orderNo, label: 受注番号, sortable: true }]
  actions:
    - { id: approve, type: plugin, plugin: approveOrders, label: 一括承認, scope: selection, roles: [manager] }
`),
    ).toEqual([]);
  });
});

describe("出す口が繋がっていない", () => {
  const report = `
page:
  type: report
  id: sales_report
  title: 売上明細表
  repository: orderRepository
  table:
    columns: [{ field: amount, label: 金額, type: number }]
  report:
    rowsPerPage: 30
  actions:
    - { id: csv, type: export, label: CSV出力 }
    - { id: printPdf, type: print, label: 印刷 }
`;

  it("出力先が未登録なら、押す前に言う", () => {
    const found = findWarnings(parseYaml(report) as Record<string, unknown>, {
      registry: { repositories: ["orderRepository"], sinks: ["exportSink"] },
    });
    const sink = found.find((w) => w.rule === "unregistered-sink");
    // CSV の口は在る。無いのは印刷の口だけ。
    expect(found.filter((w) => w.rule === "unregistered-sink")).toHaveLength(1);
    expect(sink?.message).toContain("printSink");
    expect(sink?.path).toBe("page.actions[1].type");
    expect(sink?.fix).toContain("HatakeScope");
  });

  it("両方登録してあれば黙る", () => {
    expect(
      findWarnings(parseYaml(report) as Record<string, unknown>, {
        registry: {
          repositories: ["orderRepository"],
          sinks: ["exportSink", "printSink"],
        },
      }),
    ).toEqual([]);
  });

  it("一覧を渡していない種類は見ない（知らないものを厳しくしない）", () => {
    expect(
      findWarnings(parseYaml(report) as Record<string, unknown>, {
        registry: { repositories: ["orderRepository"] },
      }),
    ).toEqual([]);
  });
});

describe("紙の無い画面の印刷ボタン", () => {
  it("report が無い画面の type: print を指摘する", () => {
    const found = warningsOf(`
page:
  type: crud
  id: order_list
  title: 受注一覧
  repository: orderRepository
  key: orderNo
  table:
    columns: [{ field: orderNo, label: 受注番号 }]
  actions:
    - { id: printPdf, type: print, label: 印刷 }
`);
    const print = found.find((w) => w.rule === "print-without-report");
    expect(print?.path).toBe("page.actions[0].type");
    expect(print?.message).toContain("「印刷」");
    expect(print?.message).toContain("report がありません");
    // 持ち出したいだけなら CSV がある、まで言う（直し方が2つあるので）。
    expect(print?.fix).toContain("type: export");
    // 対照表が引ける（間違い → 正しい書き方）。
    expect(print?.pitfall).toBe("print-without-report");
  });

  it("帳票に置いた印刷ボタンには何も言わない", () => {
    expect(
      rulesOf(`
page:
  type: report
  id: sales_report
  title: 売上明細表
  repository: orderRepository
  table:
    columns: [{ field: amount, label: 金額, type: number }]
  report:
    rowsPerPage: 30
  actions:
    - { id: printPdf, type: print, label: 印刷, config: { filename: 売上明細 } }
`),
    ).toEqual([]);
  });
});

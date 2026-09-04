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
    // `search` に組み込みの `edit` を書いても行には出ない（一覧＋フォームを持つ画面の
    // 機能なので）。approve は宣言が無いので出ない。**どちらも黙って消える**。
    expect(found.map((w) => w.rule)).toEqual([
      "builtin-rowaction-unsupported",
      "rowaction-not-declared",
    ]);
    expect(found[0].path).toBe("page.table.rowActions[0]");
    expect(found[1].path).toBe("page.table.rowActions[1]");
    expect(found[1].message).toContain("approve");
    expect(found[1].fix).toContain("edit / delete");
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
      table:
        rowActions: [delete]
        columns: [{ field: code, label: コード }]
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

describe("上位だけ畳む・並べる（sort / limit / overflow）", () => {
  /** 明細つきのフォーム1枚。[totals] がそのまま「金額」の枠になる。 */
  const form = (totals: string) => `page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - field: lines
            label: 明細
            type: subTable
            fields:
              - { field: item, label: 品名 }
              - { field: amount, label: 金額, type: number }
      - title: 金額
        fields:
${totals}
`;

  it("正しく書けば何も言わない", () => {
    expect(
      rulesOf(
        form(`          - { field: itemNames, label: 主な品名,
              computed: { op: join, field: lines, of: item, separator: "、",
                          sort: { field: amount, ascending: false }, limit: 3 } }
          - { field: top3, label: 上位3件の合計,
              computed: { op: sum, field: lines, of: amount,
                          sort: { field: amount, ascending: false }, limit: 3 } }`),
      ),
    ).toEqual([]);
  });

  it("並べる項目が無ければ、並べ替えが効かないと言う", () => {
    const found = warningsOf(
      form(`          - { field: itemNames, label: 主な品名,
              computed: { op: join, field: lines, of: item, sort: { ascending: false }, limit: 3 } }`),
    );
    const w = found.find((x) => x.rule === "computed-sort-without-field");
    expect(w?.path).toBe("page.form.sections[1].fields[0].computed.sort.field");
    expect(w?.message).toContain("並べ替えは効きません");
  });

  it("並べる項目が行に無ければ、綴り違いを疑う", () => {
    const found = warningsOf(
      form(`          - { field: itemNames, label: 主な品名,
              computed: { op: join, field: lines, of: item,
                          sort: { field: amont, ascending: false }, limit: 3 } }`),
    );
    const w = found.find((x) => x.rule === "computed-sort-unknown-field");
    expect(w?.message).toContain("amont");
    expect(w?.fix).toContain("amount");
  });

  it("切っていないのに「ほか N 件」を書いても出ない", () => {
    const found = warningsOf(
      form(`          - { field: itemNames, label: 主な品名,
              computed: { op: join, field: lines, of: item, overflow: "他 {count} 件" } }`),
    );
    const w = found.find((x) => x.rule === "computed-overflow-unused");
    expect(w?.message).toContain("行は切りません");
    expect(w?.fix).toContain("limit: 3");
  });

  it("数を畳む計算に「ほか N 件」を書いても出ない", () => {
    const found = warningsOf(
      form(`          - { field: subtotal, label: 小計,
              computed: { op: sum, field: lines, of: amount, limit: 3,
                          overflow: "他 {count} 件" } }`),
    );
    const w = found.find((x) => x.rule === "computed-overflow-unused");
    expect(w?.message).toContain("数を1つにする");
  });

  it("同じレコードの項目を畳むのに、行を並べる指定を書いた", () => {
    const found = warningsOf(
      form(`          - { field: total, label: 合計,
              computed: { op: sum, fields: [subtotal, tax],
                          sort: { field: amount }, limit: 2 } }`),
    );
    const w = found.find((x) => x.rule === "computed-sort-without-rows");
    expect(w?.message).toContain("効きません");
    expect(w?.fix).toContain("field: <明細の項目名>");
  });
});

describe("明細の行どうしの検証（unique）", () => {
  const form = (validators: string, extra = "") => `page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - field: lines
            label: 明細
            type: subTable
            validators: ${validators}
${extra}            fields:
              - { field: item, label: 品名 }
              - { field: qty, label: 数量, type: number }
`;

  it("正しく書けば何も言わない", () => {
    expect(rulesOf(form("[{ type: unique, of: item }]"))).toEqual([]);
  });

  it("見る項目が無ければ、何も判定しないと言う", () => {
    const found = warningsOf(form("[{ type: unique }]"));
    const w = found.find((x) => x.rule === "unique-without-of");
    expect(w?.message).toContain("何も判定しません");
    expect(w?.fix).toContain("of: <行の項目名>");
  });

  it("見る項目が行に無ければ、綴り違いを疑う", () => {
    const found = warningsOf(form("[{ type: unique, of: itme }]"));
    const w = found.find((x) => x.rule === "unique-unknown-field");
    expect(w?.message).toContain("黙って通ります");
    expect(w?.fix).toContain("item");
  });

  it("明細ではない項目に書いたら、見る行が無いと言う", () => {
    const found = warningsOf(`
page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, validators: [{ type: unique, of: item }] }
`);
    const w = found.find((x) => x.rule === "unique-without-subtable");
    expect(w?.message).toContain("明細（`type: subTable`）ではありません");
  });

  it("別テーブルに持つ明細では、行が揃っていないと言う", () => {
    const found = warningsOf(
      form(
        "[{ type: unique, of: item }]",
        "            source: { repository: orderLineRepository, parentKey: orderNo }\n",
      ),
    );
    const w = found.find((x) => x.rule === "unique-on-paged-subtable");
    expect(w?.message).toContain("ページ");
    expect(w?.fix).toContain("サーバ側");
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
    // 書けるものを全部並べて言う（並びは一覧のまま。数ではなく名前で見る）。
    for (const known of ["{count}", "{total}", "{failed}", "{failedKeys}", "{error}"]) {
      expect(w?.message, known).toContain(known);
    }
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

  it("行に並べたら、行には出ないと言う（押した行ではなくチェックした行に実行される）", () => {
    const found = warningsOf(`
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    rowActions: [approve]
    columns: [{ field: orderNo, label: 受注番号 }]
  actions:
    - { id: approve, type: plugin, plugin: approveOrders, label: 一括承認, scope: selection }
`);
    const w = found.find((x) => x.rule === "selection-as-rowaction");
    expect(w?.path).toBe("page.table.rowActions");
    expect(w?.message).toContain("行には出ません");
    expect(w?.fix).toContain("rowActions");
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

describe("明細の行を畳む計算（computed に field / of）", () => {
  /** 明細つきのフォーム1枚。[totals] がそのまま「金額」の枠になる。 */
  const form = (totals: string, source = "") => `page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - field: lines
            label: 明細
            type: subTable
${source}            fields:
              - { field: productName, label: 品名 }
              - { field: quantity, label: 数量, type: number }
              - { field: amount, label: 金額, type: number }
      - title: 金額
        fields:
${totals}
`;

  it("正しく書けば何も言わない", () => {
    expect(
      rulesOf(
        form(`          - { field: subtotal, label: 小計, computed: { op: sum, field: lines, of: amount } }
          - { field: rows, label: 行数, computed: { op: count, field: lines } }`),
      ),
    ).toEqual([]);
  });

  it("of が無ければ畳めない（count 以外）", () => {
    const found = warningsOf(
      form(`          - { field: subtotal, label: 小計, computed: { op: sum, field: lines } }`),
    );
    const w = found.find((x) => x.rule === "computed-aggregate-without-of");
    expect(w?.path).toBe("page.form.sections[1].fields[0].computed.of");
    expect(w?.message).toContain("「小計」は空欄になります");
    expect(w?.fix).toContain("count");
  });

  it("行を畳めない op なら言う", () => {
    const found = warningsOf(
      form(`          - { field: subtotal, label: 小計, computed: { op: product, field: lines, of: amount } }`),
    );
    const w = found.find((x) => x.rule === "computed-rows-unsupported-op");
    expect(w?.message).toContain("product では明細の行をまとめられません");
    expect(w?.message).toContain("count / sum / avg / min / max");
  });

  it("行を畳む op に相手が無ければ言う（逆向き）", () => {
    const found = warningsOf(
      form(`          - { field: rows, label: 行数, computed: { op: avg, fields: [a, b] } }`),
    );
    const w = found.find((x) => x.rule === "computed-rows-unsupported-op");
    expect(w?.message).toContain("avg は**明細の行をまとめる**計算");
    expect(w?.fix).toContain("field: <明細の項目名>");
  });

  it("field と fields の両方は、片方が効かない", () => {
    const found = warningsOf(
      form(`          - { field: subtotal, label: 小計,
              computed: { op: sum, field: lines, of: amount, fields: [a, b] } }`),
    );
    const w = found.find((x) => x.rule === "computed-field-and-fields");
    expect(w?.message).toContain("`field` が勝つ");
  });

  it("相手の綴り違いは近い名前を出す", () => {
    const found = warningsOf(
      form(`          - { field: subtotal, label: 小計, computed: { op: sum, field: line, of: amount } }`),
    );
    const w = found.find((x) => x.rule === "computed-of-unknown-field");
    expect(w?.path).toBe("page.form.sections[1].fields[0].computed.field");
    expect(w?.fix).toContain("lines");
  });

  it("相手が明細でなければ言う", () => {
    const found = warningsOf(`page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - { field: memo, label: 備考, type: textarea }
          - { field: subtotal, label: 小計, computed: { op: sum, field: memo, of: amount } }
`);
    const w = found.find((x) => x.rule === "computed-of-unknown-field");
    expect(w?.message).toContain("明細ではありません");
    expect(w?.fix).toContain("subTable");
  });

  it("行に無い項目を畳もうとしたら言う", () => {
    const found = warningsOf(
      form(`          - { field: subtotal, label: 小計, computed: { op: sum, field: lines, of: amout } }`),
    );
    const w = found.find((x) => x.rule === "computed-of-unknown-field");
    expect(w?.path).toBe("page.form.sections[1].fields[0].computed.of");
    expect(w?.fix).toContain("amount");
  });

  it("ページ送りの明細は畳めない（行が揃っていない）", () => {
    const found = warningsOf(
      form(
        `          - { field: subtotal, label: 小計, computed: { op: sum, field: lines, of: amount } }`,
        "            source: { repository: orderLineRepository, parentKey: orderNo, key: lineNo }\n",
      ),
    );
    const w = found.find((x) => x.rule === "computed-of-paged-subtable");
    expect(w?.message).toContain("ページ送りで");
    expect(w?.fix).toContain("サーバ側で計算");
  });

  // `field` は独自の op のパラメータ名としても普通に使う（「どの項目から計算するか」）。
  // 知らない op の中身に口を出すと、正しい定義に嘘の警告を出すことになる。
  it("独自の op の field には口を出さない", () => {
    expect(
      rulesOf(`page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - { field: subtotal, label: 小計, type: number }
          - { field: tax, label: 消費税, computed: { op: consumptionTax, field: subtotal } }
          - { field: rate, label: 率, computed: { op: discount, field: subtotal, of: nothing } }
`),
    ).toEqual([]);
  });

  it("同じレコードの項目を畳む形は今までどおり（何も言わない）", () => {
    expect(
      rulesOf(
        form(`          - { field: total, label: 合計, computed: { op: sum, fields: [subtotal, tax] } }
          - { field: subtotal, label: 小計, type: number }
          - { field: tax, label: 消費税, type: number }`),
      ),
    ).toEqual([]);
  });
});

describe("行を絞ってから畳む（where）と、並べて1行にする（join）", () => {
  /** 明細つきのフォーム1枚。[totals] がそのまま「金額」の枠になる。 */
  const form = (totals: string) => `page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - field: lines
            label: 明細
            type: subTable
            fields:
              - { field: item, label: 品名 }
              - { field: amount, label: 金額, type: number }
              - { field: cancelled, label: 取消, type: checkbox }
      - title: 金額
        fields:
${totals}
`;

  it("正しく書けば何も言わない", () => {
    expect(
      rulesOf(
        form(`          - { field: subtotal, label: 小計,
              computed: { op: sum, field: lines, of: amount,
                          where: { field: cancelled, operator: notEquals, value: true } } }
          - { field: itemNames, label: 品名,
              computed: { op: join, field: lines, of: item, separator: "、" } }`),
      ),
    ).toEqual([]);
  });

  it("join に of が無ければ「並べる項目が無い」と言う", () => {
    const found = warningsOf(
      form(`          - { field: itemNames, label: 品名, computed: { op: join, field: lines } }`),
    );
    const w = found.find((x) => x.rule === "computed-aggregate-without-of");
    // 「畳む」ではなく「並べる」。join は数ではなく文字を作る。
    expect(w?.message).toContain("join で並べる項目");
  });

  it("join は同じレコードの項目には効かない（それは concat）", () => {
    const found = warningsOf(
      form(`          - { field: name, label: 名前, computed: { op: join, fields: [a, b] } }`),
    );
    const w = found.find((x) => x.rule === "computed-rows-unsupported-op");
    expect(w?.message).toContain("join は**明細の行をまとめる**計算");
  });

  it("畳めない op の直し方に join を出す（並べたいのか合計したいのか）", () => {
    const found = warningsOf(
      form(`          - { field: x, label: X, computed: { op: product, field: lines, of: amount } }`),
    );
    const w = found.find((x) => x.rule === "computed-rows-unsupported-op");
    expect(w?.message).toContain("count / sum / avg / min / max / join");
    expect(w?.fix).toContain("`op: join`");
  });

  it("where を同じレコードの形に書いても効かない", () => {
    const found = warningsOf(
      form(`          - { field: total, label: 合計,
              computed: { op: sum, fields: [a, b],
                          where: { field: cancelled, operator: notEquals, value: true } } }`),
    );
    const w = found.find((x) => x.rule === "computed-where-ignored");
    expect(w?.path).toBe("page.form.sections[1].fields[0].computed.where");
    expect(w?.message).toContain("絞られずに計算されます");
  });

  it("where の綴り違いは近い名前を出す", () => {
    const found = warningsOf(
      form(`          - { field: subtotal, label: 小計,
              computed: { op: sum, field: lines, of: amount,
                          where: { field: canceled, operator: notEquals, value: true } } }`),
    );
    const w = found.find((x) => x.rule === "computed-where-unknown-field");
    expect(w?.path).toBe("page.form.sections[1].fields[0].computed.where.field");
    expect(w?.fix).toContain("cancelled");
  });

  it("結合（not / all）の中の綴り違いも見る", () => {
    const found = warningsOf(
      form(`          - { field: subtotal, label: 小計,
              computed: { op: sum, field: lines, of: amount,
                          where: { not: { field: amout, operator: equals, value: 0 } } } }`),
    );
    const w = found.find((x) => x.rule === "computed-where-unknown-field");
    expect(w?.path).toBe("page.form.sections[1].fields[0].computed.where.not.field");
  });

  it("画面に出していない値で絞るのは黙る（行に持っているだけの値もある）", () => {
    // 綴り違いに見えないなら何も言わない。無い名前を一律に責めると嘘になる。
    expect(
      rulesOf(
        form(`          - { field: subtotal, label: 小計,
              computed: { op: sum, field: lines, of: amount,
                          where: { field: deletedFlag, operator: isEmpty } } }`),
      ),
    ).toEqual([]);
  });

  it("where に mode は書けない（行にフォームの状態は無い）", () => {
    const found = warningsOf(
      form(`          - { field: subtotal, label: 小計,
              computed: { op: sum, field: lines, of: amount, where: { mode: create } } }`),
    );
    const w = found.find((x) => x.rule === "computed-where-mode");
    expect(w?.message).toContain("1件も残らない");
  });

  it("where の知らない演算子は、条件と同じ規則が言う", () => {
    const found = warningsOf(
      form(`          - { field: subtotal, label: 小計,
              computed: { op: sum, field: lines, of: amount,
                          where: { field: amount, operator: between, value: [0, 100] } } }`),
    );
    const w = found.find((x) => x.rule === "condition-operator-unsupported");
    expect(w?.path).toBe("page.form.sections[1].fields[0].computed.where.operator");
  });
});

describe("計算の順番", () => {
  /** 計算項目だけを並べたフォーム1枚（順番の話なので他は要らない）。 */
  const form = (fields: string) => `page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
${fields}
`;

  it("前に書いた計算の結果は使える（正しい順番）", () => {
    expect(
      rulesOf(
        form(`          - { field: subtotal, label: 小計, computed: { op: sum, fields: [x, y] } }
          - { field: tax, label: 消費税, computed: { op: product, fields: [subtotal, rate] } }
          - { field: total, label: 合計, computed: { op: sum, fields: [subtotal, tax] } }`),
      ),
    ).toEqual([]);
  });

  it("後ろに書いた計算を使っていたら言う（空のまま計算される）", () => {
    const found = warningsOf(
      form(`          - { field: total, label: 合計, computed: { op: sum, fields: [subtotal, tax] } }
          - { field: subtotal, label: 小計, computed: { op: sum, fields: [x, y] } }
          - { field: tax, label: 消費税, type: number }`),
    );
    expect(found.map((w) => w.rule)).toEqual(["computed-order"]);
    // 手で入れる項目（消費税）は順番に関係ない。指摘は計算項目だけ。
    expect(found[0].path).toBe("page.form.sections[0].fields[0].computed.fields[0]");
    expect(found[0].message).toContain("後ろに");
    expect(found[0].fix).toContain("小計 → 消費税 → 合計");
  });

  it("自分自身を使っていたら言う", () => {
    const found = warningsOf(
      form(`          - { field: total, label: 合計, computed: { op: sum, fields: [total, tax] } }`),
    );
    const w = found.find((x) => x.rule === "computed-self-reference");
    expect(w?.message).toContain("自分自身");
  });

  it("独自の op の fields には口を出さない（意味を知らないので）", () => {
    // `{ op: consumptionTax, fields: [subtotal] }` の fields が「計算に使う項目」だとは
    // 限らない。知らない op の中身に口を出すと、正しい定義に嘘の警告を出す。
    expect(
      rulesOf(
        form(`          - { field: tax, label: 消費税, computed: { op: consumptionTax, fields: [subtotal] } }
          - { field: subtotal, label: 小計, computed: { op: sum, fields: [x, y] } }`),
      ),
    ).toEqual([]);
  });
});

describe("突き合わせも行を絞れる（compare に where）", () => {
  /** 明細と「合計」1つ。[validator] がその合計に付く検証。 */
  const form = (validator: string) => `page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - field: lines
            label: 明細
            type: subTable
            fields:
              - { field: amount, label: 金額, type: number }
              - { field: cancelled, label: 取消, type: checkbox }
          - field: total
            label: 合計
            type: number
            validators:
              - ${validator}
`;

  it("計算と同じ絞り込みなら何も言わない", () => {
    expect(
      rulesOf(
        form(`{ type: compare, operator: equals, field: lines, aggregate: sum, of: amount,
                  where: { field: cancelled, operator: notEquals, value: true } }`),
      ),
    ).toEqual([]);
  });

  it("畳んでいないのに where を書いたら効かない", () => {
    const found = warningsOf(
      form(`{ type: compare, operator: equals, field: lines,
                  where: { field: cancelled, operator: notEquals, value: true } }`),
    );
    const w = found.find((x) => x.rule === "compare-where-ignored");
    expect(w?.path).toBe("page.form.sections[0].fields[1].validators[0].where");
    expect(w?.fix).toContain("aggregate: sum");
  });

  it("綴り違いは近い名前を出す（計算と同じ言い方）", () => {
    const found = warningsOf(
      form(`{ type: compare, operator: equals, field: lines, aggregate: sum, of: amount,
                  where: { field: canceled, operator: notEquals, value: true } }`),
    );
    const w = found.find((x) => x.rule === "compare-where-unknown-field");
    expect(w?.fix).toContain("cancelled");
  });

  it("mode は行では判定できない（計算と同じ言い方）", () => {
    const found = warningsOf(
      form(`{ type: compare, operator: equals, field: lines, aggregate: sum, of: amount,
                  where: { mode: create } }`),
    );
    const w = found.find((x) => x.rule === "compare-where-mode");
    expect(w?.message).toContain("1件も残らない");
  });
});

describe("押す前の文言に書ける差し込み", () => {
  /** 一覧1枚＋ボタン1つ。 */
  const page = (action: string) => `page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  table:
    columns: [{ field: orderNo, label: 受注番号 }]
  actions:
    - ${action}
`;

  it("一括の確認に {count} は書ける（押す前に選んだ数は分かっている）", () => {
    expect(
      rulesOf(
        page(`{ id: a, type: plugin, plugin: p, label: 一括承認, scope: selection,
        confirm: { message: '{count} 件を承認します' } }`),
      ),
    ).toEqual([]);
  });

  it("1件ずつのボタンの確認に {count} は埋まらない", () => {
    const found = warningsOf(
      page(`{ id: a, type: delete, label: 削除,
        confirm: { message: '{count} 件を消します' } }`),
    );
    const w = found.find((x) => x.rule === "placeholder-not-filled");
    expect(w?.path).toBe("page.actions[0].confirm.message");
    expect(w?.message).toContain("scope: selection");
  });

  it("押す前に {failed} は無い（まだ1件も失敗していない）", () => {
    const found = warningsOf(
      page(`{ id: a, type: plugin, plugin: p, label: 一括承認, scope: selection,
        confirm: { message: '{count} 件（{failed} 件は失敗します）' } }`),
    );
    const w = found.find((x) => x.rule === "placeholder-not-filled");
    expect(w?.message).toContain("{failed}");
    expect(w?.message).toContain("まだ実行していない");
    expect(w?.fix).toContain("onSuccess");
  });

  it("聞く形の見出しも見る（そこが確認そのものなので）", () => {
    const found = warningsOf(
      page(`{ id: a, type: plugin, plugin: p, label: 却下, scope: selection,
        prompt: { title: '{count} 件を却下（{error}）', fields: [{ field: r, label: 理由 }] } }`),
    );
    const w = found.find((x) => x.rule === "placeholder-not-filled");
    expect(w?.path).toBe("page.actions[0].prompt.title");
    expect(w?.message).toContain("{error}");
  });

  it("項目名は押す前でも埋まらない（レコードの値は渡っていない）", () => {
    const found = warningsOf(
      page(`{ id: a, type: plugin, plugin: p, label: 一括承認, scope: selection,
        confirm: { message: '{orderNo} を承認します' } }`),
    );
    expect(found.map((w) => w.rule)).toContain("placeholder-not-filled");
  });
});

describe("1回で動かせる件数の上限（maxRows）", () => {
  /** 一覧1枚＋ボタン1つ。[pagination] は表のページ送り。 */
  const page = (action: string, pagination = "") => `page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
${pagination}    columns: [{ field: orderNo, label: 受注番号 }]
  actions:
    - ${action}
`;

  it("一括に上限を書くのは正しい（何も言わない）", () => {
    expect(
      rulesOf(
        page(`{ id: approve, type: plugin, plugin: p, label: 一括承認,
        scope: selection, maxRows: 20, roles: [m],
        confirm: { message: '{count} 件' }, onError: { message: x } }`),
      ),
    ).toEqual([]);
  });

  it("一括でないボタンの上限は効かない", () => {
    const found = warningsOf(
      page(`{ id: csv, type: export, label: CSV出力, maxRows: 20, roles: [m] }`),
    );
    const w = found.find((x) => x.rule === "maxrows-without-selection");
    expect(w?.path).toBe("page.actions[0].maxRows");
    expect(w?.message).toContain("上限は効きません");
  });

  it("1ページの件数より大きい上限は一度も効かない", () => {
    const found = warningsOf(
      page(
        `{ id: approve, type: plugin, plugin: p, label: 一括承認,
        scope: selection, maxRows: 200, roles: [m],
        confirm: { message: '{count} 件' }, onError: { message: x } }`,
        "    pagination: { pageSize: 10 }\n",
      ),
    );
    const w = found.find((x) => x.rule === "maxrows-above-page-size");
    expect(w?.message).toContain("1ページ 10 件");
    expect(w?.fix).toContain("10 件以下");
  });

  it("書かなかったときの1ページの件数は 50（スキーマの既定と同じ）", () => {
    // 既定を51件で超える／50件で超えない、の両方を見る（数がずれたら落ちる）。
    const over = warningsOf(
      page(`{ id: approve, type: plugin, plugin: p, label: 一括承認,
        scope: selection, maxRows: 51, roles: [m],
        confirm: { message: '{count} 件' }, onError: { message: x } }`),
    );
    expect(over.map((w) => w.rule)).toContain("maxrows-above-page-size");
    expect(
      rulesOf(
        page(`{ id: approve, type: plugin, plugin: p, label: 一括承認,
        scope: selection, maxRows: 50, roles: [m],
        confirm: { message: '{count} 件' }, onError: { message: x } }`),
      ),
    ).toEqual([]);
  });

  it("ページ送りを切っている表なら、大きい上限でも効く（全件出るので）", () => {
    expect(
      rulesOf(
        page(
          `{ id: approve, type: plugin, plugin: p, label: 一括承認,
        scope: selection, maxRows: 500, roles: [m],
        confirm: { message: '{count} 件' }, onError: { message: x } }`,
          "    pagination: { enabled: false }\n",
        ),
      ),
    ).toEqual([]);
  });
});

describe("役割ごとの上限（maxRows の byRole）", () => {
  const page = (maxRows: string, extra = "") => `page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    pagination: { pageSize: 30 }
    columns: [{ field: orderNo, label: 受注番号 }]
  actions:
    - id: approve
      type: plugin
      plugin: approveOrders
      label: 一括承認
      scope: selection
${extra}      confirm: { message: '{count} 件' }
      onError: { message: x }
      maxRows:
${maxRows}
`;

  it("役割ごとに書くのは正しい（何も言わない）", () => {
    expect(
      rulesOf(
        page("        default: 20\n        byRole: { manager: 30 }\n",
             "      roles: [staff, manager]\n"),
      ),
    ).toEqual([]);
  });

  it("押せない役割の上限は効かない", () => {
    const found = warningsOf(
      page("        default: 20\n        byRole: { staff: 10 }\n",
           "      roles: [manager]\n"),
    );
    const w = found.find((x) => x.rule === "maxrows-unknown-role");
    expect(w?.path).toBe("page.actions[0].maxRows.byRole.staff");
    expect(w?.message).toContain("押せないので");
  });

  it("どこにも無い役割名は綴り違いを出す", () => {
    // 役割名は定義のどこかに1つでも出ていれば突き合わせる（1つも無ければ黙る＝
    // 何と比べればいいか分からないので）。ここでは manager が列に出ている。
    const found = warningsOf(
      page("        default: 20\n        byRole: { manger: 10 }\n").replace(
        "columns: [{ field: orderNo, label: 受注番号 }]",
        "columns: [{ field: orderNo, label: 受注番号, roles: [manager] }]",
      ),
    );
    const w = found.find((x) => x.rule === "maxrows-unknown-role");
    expect(w?.message).toContain("どこにも出てきません");
  });

  it("役割ごとの上限も、1ページの件数を超えていれば言う", () => {
    const found = warningsOf(
      page("        default: 20\n        byRole: { manager: 500 }\n",
           "      roles: [manager]\n"),
    );
    const w = found.find((x) => x.rule === "maxrows-above-page-size");
    expect(w?.path).toBe("page.actions[0].maxRows.byRole.manager");
    expect(w?.message).toContain("上限（manager）は 500 件");
  });

  it("既定が all でも、役割ごとの上限は見る", () => {
    const found = warningsOf(
      page("        default: all\n        byRole: { manager: 500 }\n",
           "      roles: [manager]\n"),
    );
    expect(found.map((w) => w.rule)).toContain("maxrows-above-page-size");
  });
});

import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  type AdvicePick,
  applyAdvice,
  findAdvice,
  findWarnings,
  parsePageYaml,
  renderAdviceApply,
} from "../src/index.js";

/** 一括のある照会画面（助言が何本も出る形）。 */
const search = (parts: { actions?: string; table?: string; key?: string } = {}) => `page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: ${parts.key ?? "orderNo"}
  search:
    filters:
      - { field: orderNo, label: 受注番号 }
  table:
    columns:
${
  parts.table ??
  `      - { field: orderNo, label: 受注番号 }
      - { field: customer, label: 得意先 }
      - { field: amount, label: 金額 }`
}
  actions:
${
  parts.actions ??
  "    - { id: approve, type: plugin, plugin: approveOrders, label: 一括承認, scope: selection }"
}
`;

const apply = (source: string, picks: AdvicePick[]) => applyAdvice(source, picks);

const rulesLeft = (source: string): string[] =>
  findAdvice(parseYaml(source) as Record<string, unknown>).map((one) => one.rule);

describe("助言をそのまま当てる", () => {
  it("値が定義から決まるものは、value なしで当たる", () => {
    const result = apply(search(), [{ rule: "money-without-format" }]);
    expect(result.applied.map((one) => one.rule)).toEqual(["money-without-format"]);
    expect(result.source).toContain("{ field: amount, label: 金額, format: currency }");
    // 当てた助言は消える（当てたのに残っていたら書けていない）。
    expect(rulesLeft(result.source)).not.toContain("money-without-format");
  });

  it("業務の決めごとは当てない。**何を渡せばいいか**を理由に書く", () => {
    const result = apply(search(), [{ rule: "bulk-without-confirm" }]);
    expect(result.applied).toEqual([]);
    expect(result.skipped[0].reason).toContain("value に渡してください");
    expect(result.skipped[0].reason).toContain("{count}");
    // 触っていない。
    expect(result.source).toBe(search());
  });

  it("value を渡せば、確認をその場に書く（1行の流し書きで、書き方は変えない）", () => {
    const result = apply(search(), [
      {
        rule: "bulk-without-confirm",
        value: { message: "{count} 件を承認します。よろしいですか？", danger: true },
      },
    ]);
    expect(result.applied).toHaveLength(1);
    expect(result.source).toContain(
      "confirm: { message: '{count} 件を承認します。よろしいですか？', danger: true }",
    );
    // 元の行はそのまま（足しただけ）。
    expect(result.source).toContain("id: approve");
    expect(parsePageYaml(result.source, { strict: true }).actions).toHaveLength(1);
  });

  it("赤いボタンは確認の中に足す（確認が無ければ、先に確認を書く話だと言う）", () => {
    const reject =
      "    - { id: reject, type: plugin, plugin: rejectOrders, label: 一括却下, scope: selection }";
    const without = apply(search({ actions: reject }), [
      { rule: "bulk-destructive-without-danger" },
    ]);
    expect(without.applied).toEqual([]);
    expect(without.skipped[0].reason).toContain("bulk-without-confirm");

    const withConfirm = apply(
      search({
        actions:
          "    - { id: reject, type: plugin, plugin: rejectOrders, label: 一括却下, scope: selection, confirm: { message: '{count} 件を却下します' } }",
      }),
      [{ rule: "bulk-destructive-without-danger" }],
    );
    expect(withConfirm.applied).toHaveLength(1);
    expect(withConfirm.source).toContain(
      "confirm: { message: '{count} 件を却下します', danger: true }",
    );
  });

  it("どの列で並べ替えるかは項目名で受ける（知らない名前が混ざれば1件も当てない）", () => {
    const ok = apply(search(), [
      { rule: "no-sortable-column", value: ["orderNo", "amount"] },
    ]);
    expect(ok.applied).toHaveLength(1);
    expect(ok.source).toContain("{ field: orderNo, label: 受注番号, sortable: true }");
    expect(ok.source).toContain("{ field: amount, label: 金額, sortable: true }");
    expect(ok.source).toContain("{ field: customer, label: 得意先 }"); // 触っていない

    const typo = apply(search(), [
      { rule: "no-sortable-column", value: ["orderNo", "orderDate"] },
    ]);
    expect(typo.applied).toEqual([]);
    expect(typo.source).toBe(search());
    expect(typo.skipped[0].reason).toContain("orderDate");
  });

  it("1件を指すキーの列は、業務名が定義の中にあれば足せる", () => {
    // key は customerCode。一覧に出ていないが、絞り込みに業務名がある。
    const source = `page:
  type: search
  id: customer_search
  title: 得意先照会
  repository: customerRepository
  key: customerCode
  search:
    filters:
      - { field: customerCode, label: 得意先コード }
  table:
    columns:
      - { field: name, label: 得意先名, sortable: true }
`;
    const result = apply(source, [{ rule: "key-not-in-table" }]);
    expect(result.applied).toHaveLength(1);
    expect(result.source).toContain("- { field: customerCode, label: 得意先コード }");

    // 業務名がどこにも無ければ、勝手に付けない。
    const nameless = source.replace(
      "      - { field: customerCode, label: 得意先コード }\n",
      "      - { field: name, label: 得意先名 }\n",
    );
    const asked = apply(nameless, [{ rule: "key-not-in-table" }]);
    expect(asked.applied).toEqual([]);
    expect(asked.skipped[0].reason).toContain("value に業務名");
    // ラベルを渡せば書ける。
    const given = apply(nameless, [{ rule: "key-not-in-table", value: "得意先コード" }]);
    expect(given.source).toContain("- { field: customerCode, label: 得意先コード }");
  });

  it("1回の上限は、上限の無い一括ぜんぶに書く（助言は1件でも、言っているのは全部）", () => {
    const source = search({
      actions: `    - { id: approve, type: plugin, plugin: approveOrders, label: 一括承認, scope: selection }
    - { id: notify, type: plugin, plugin: notifyOrders, label: 一括通知, scope: selection, maxRows: 5 }
    - { id: close, type: plugin, plugin: closeOrders, label: 一括締め, scope: selection }`,
      table: `      - { field: orderNo, label: 受注番号, sortable: true }
    pagination: { pageSize: 200 }`,
    });
    expect(rulesLeft(source)).toContain("bulk-on-many-rows");
    const result = apply(source, [{ rule: "bulk-on-many-rows", value: 20 }]);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].wrote).toContain("maxRows: 20");
    // 書いてある上限（5）は触らない。
    expect(result.source).toContain("maxRows: 5");
    expect(result.source.match(/maxRows: 20/g)).toHaveLength(2);
    expect(rulesLeft(result.source)).not.toContain("bulk-on-many-rows");
  });

  it("役割は渡された名前で書く（誰に見せるかは業務の決めごと）", () => {
    const result = apply(search(), [
      { rule: "open-dangerous-action", value: ["manager", "admin"] },
    ]);
    expect(result.source).toContain("roles: [manager, admin]");
    expect(rulesLeft(result.source)).not.toContain("open-dangerous-action");
  });

  it("空で書いてあるものは「まだ決めていない」＝置き換える", () => {
    // roles: [] は「誰にも見せない」ではなく「まだ決めていない」（助言もそう数える）。
    const source = search({
      actions:
        "    - { id: approve, type: plugin, plugin: approveOrders, label: 一括承認, scope: selection, roles: [] }",
    });
    expect(rulesLeft(source)).toContain("open-dangerous-action");
    const result = apply(source, [
      { rule: "open-dangerous-action", value: ["manager"] },
    ]);
    expect(result.applied).toHaveLength(1);
    expect(result.source).toContain("roles: [manager] }");
    expect(result.source).not.toContain("roles: []");
  });

  it("知らないキーを渡したら当てない（定義を壊す value は書かない）", () => {
    const result = apply(search(), [
      { rule: "bulk-without-confirm", value: { mesage: "3 件を承認します" } },
    ]);
    expect(result.applied).toEqual([]);
    expect(result.source).toBe(search());
    expect(result.skipped[0].reason).toMatch(/別の問題が出ます|読めなくなります/);
  });

  it("当てても助言が消えない value は当てない", () => {
    const source = `page:
  type: search
  id: customer_search
  title: 得意先照会
  repository: customerRepository
  key: customerCode
  search:
    filters:
      - { field: name, label: 得意先名 }
  table:
    columns:
      - { field: name, label: 得意先名, sortable: true }
`;
    // キーではない列を足しても、キーは一覧に出ていない＝助言は残る。
    const result = apply(source, [
      { rule: "key-not-in-table", value: { field: "note", label: "備考" } },
    ]);
    expect(result.applied).toEqual([]);
    expect(result.source).toBe(source);
    expect(result.skipped[0].reason).toContain("助言が消えません");
  });

  it("同じ規則が2件出ていたら、where で1件に絞る", () => {
    const source = search({
      actions: `    - { id: approve, type: plugin, plugin: approveOrders, label: 一括承認, scope: selection }
    - { id: exportCsv, type: export, label: CSV 出力 }`,
    });
    const both = apply(source, [
      { rule: "open-dangerous-action", value: ["manager"] },
    ]);
    expect(both.applied).toEqual([]);
    expect(both.skipped[0].reason).toContain("where");

    const one = apply(source, [
      {
        rule: "open-dangerous-action",
        where: "page.actions[1].roles",
        value: ["manager"],
      },
    ]);
    expect(one.applied).toHaveLength(1);
    expect(one.source).toContain("label: CSV 出力, roles: [manager] }");
  });

  it("同じ助言は2回当たらない（2件目は「出ていません」）", () => {
    const result = apply(search(), [
      { rule: "money-without-format" },
      { rule: "money-without-format" },
    ]);
    expect(result.applied).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("出ていません");
    expect(result.source.match(/format: currency/g)).toHaveLength(1);
  });

  it("文の書き換えは機械にはできないと言う（件数を入れる場所で文が変わる）", () => {
    const source = search({
      actions:
        "    - { id: approve, type: plugin, plugin: approveOrders, label: 一括承認, scope: selection, confirm: { message: 選んだ受注を承認します } }",
    });
    const result = apply(source, [{ rule: "bulk-confirm-without-count" }]);
    expect(result.applied).toEqual([]);
    expect(result.skipped[0].reason).toContain("機械にはできません");
  });

  it("ブロックで書いた定義にも、同じ字下げで足す（コメントは動かさない）", () => {
    const source = `page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  search:
    filters:
      - { field: orderNo, label: 受注番号 }
  table:
    columns:
      # 現場が電話で読み上げる列
      - field: orderNo
        label: 受注番号
        sortable: true
      - field: amount
        label: 金額
`;
    const result = apply(source, [{ rule: "money-without-format" }]);
    expect(result.applied).toHaveLength(1);
    expect(result.source).toContain(`      - field: amount
        label: 金額
        format: currency
`);
    expect(result.source).toContain("      # 現場が電話で読み上げる列");
  });

  it("app のときは、どの画面の助言かで絞れる", () => {
    const source = `app:
  id: sales
  title: 販売
  menu:
    - { id: orders, label: 受注, page: order_search }
    - { id: products, label: 商品, page: product_search }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      search:
        filters: [{ field: orderNo, label: 受注番号 }]
      table:
        columns: [{ field: amount, label: 金額, sortable: true }]
    - type: search
      id: product_search
      title: 商品照会
      repository: productRepository
      search:
        filters: [{ field: code, label: コード }]
      table:
        columns: [{ field: price, label: 単価, sortable: true }]
`;
    const result = apply(source, [
      { rule: "money-without-format", page: "product_search" },
    ]);
    expect(result.applied).toHaveLength(1);
    expect(result.source).toContain("{ field: price, label: 単価, sortable: true, format: currency }");
    expect(result.source).toContain("{ field: amount, label: 金額, sortable: true }");
    // 残りは「次に何を書き足せるか」として返る。
    expect(result.remaining.map((one) => one.page)).toContain("order_search");
  });

  it("案件の決めごと（全部に書く形）も当てられる", () => {
    const rules = {
      off: [],
      options: {},
      require: [
        { rule: "team-column-width", node: "column" as const, key: "width", every: true },
      ],
    };
    const source = search({
      table: "      - { field: orderNo, label: 受注番号, sortable: true }",
    });
    const result = applyAdvice(source, [{ rule: "team-column-width", value: 120 }], {
      rules,
    });
    expect(result.applied).toHaveLength(1);
    expect(result.source).toContain("width: 120");
  });

  it("当てたあとに警告が増えていない（増える書き足しは当てない）", () => {
    const before = findWarnings(parseYaml(search()) as Record<string, unknown>);
    const result = apply(search(), [
      { rule: "money-without-format" },
      { rule: "open-dangerous-action", value: ["manager"] },
      { rule: "bulk-without-error-message", value: { message: "{failed} 件が失敗" } },
    ]);
    expect(result.applied).toHaveLength(3);
    const after = findWarnings(parseYaml(result.source) as Record<string, unknown>);
    expect(after.map((one) => one.rule)).toEqual(before.map((one) => one.rule));
    expect(() => parsePageYaml(result.source, { strict: true })).not.toThrow();
  });

  it("必須はステップの中の項目にも書ける（枠が無い画面でも場所は分かる）", () => {
    const wizard = `page:
  type: wizard
  id: order_wizard
  title: 受注登録
  repository: orderRepository
  steps:
    - id: customer
      title: 得意先
      fields:
        - { field: customerCode, label: 得意先コード }
    - id: detail
      title: 明細
      fields:
        - { field: note, label: 備考 }
`;
    expect(rulesLeft(wizard)).toContain("no-required-field");
    const result = apply(wizard, [
      { rule: "no-required-field", value: ["customerCode"] },
    ]);
    expect(result.applied).toHaveLength(1);
    expect(result.source).toContain(
      "{ field: customerCode, label: 得意先コード, required: true }",
    );
    expect(result.source).toContain("{ field: note, label: 備考 }"); // 触っていない
    expect(rulesLeft(result.source)).not.toContain("no-required-field");
  });

  it("帳票の合計も、渡された項目で書ける", () => {
    const report = `page:
  type: report
  id: sales_report
  title: 売上帳票
  repository: salesRepository
  table:
    columns:
      - { field: customer, label: 得意先 }
      - { field: amount, label: 金額, type: number, format: currency }
  report:
    paper: { size: A4 }
`;
    const result = apply(report, [
      {
        rule: "report-without-totals",
        value: [{ field: "amount", aggregate: "sum" }],
      },
    ]);
    expect(result.applied).toHaveLength(1);
    expect(result.source).toContain("totals: [{ field: amount, aggregate: sum }]");
    expect(() => parsePageYaml(result.source, { strict: true })).not.toThrow();
  });

  it("人が読む形には、当てたもの・当てなかったもの・残りが全部出る", () => {
    const result = apply(search(), [
      { rule: "money-without-format" },
      { rule: "bulk-without-confirm" },
    ]);
    const text = renderAdviceApply(result);
    expect(text).toContain("1 件を当てました");
    expect(text).toContain("当てなかったもの");
    expect(text).toContain("まだ書き足せる所が");
    // 助言を当てても警告は減らない、を毎回言う。
    expect(text).toContain("警告が減るわけではありません");
  });
});

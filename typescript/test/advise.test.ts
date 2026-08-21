import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  ADVICE_NOTE,
  type Advice,
  buildReference,
  findAdvice,
  findWarnings,
  renderAdvice,
  unwritableAdvice,
} from "../src/index.js";

const reference = buildReference(
  JSON.parse(readFileSync("../spec/hatake-page.schema.json", "utf8")),
);

const advise = (source: string): Advice[] =>
  findAdvice(parseYaml(source) as Record<string, unknown>);

const rules = (source: string): string[] => advise(source).map((one) => one.rule);

const crud = (parts: {
  columns?: string;
  search?: string;
  fields?: string;
  actions?: string;
  kind?: string;
  key?: string;
}) => `page:
  type: ${parts.kind ?? "crud"}
  id: order_list
  title: 受注一覧
  repository: orderRepository
  key: ${parts.key ?? "orderNo"}
${parts.search ?? `  search:
    filters:
      - { field: orderNo, label: 受注番号 }`}
  table:
    columns:
${parts.columns ?? "      - { field: orderNo, label: 受注番号, sortable: true }"}
  form:
    sections:
      - fields:
${parts.fields ?? "          - { field: orderNo, label: 受注番号, required: true }"}
  actions:
${parts.actions ?? "    - { id: create, type: create, label: 新規 }"}
`;

describe("書き足したほうがいい所", () => {
  it("列が並ぶのに、並べ替えできる列が1つも無い", () => {
    const source = crud({
      columns: `      - { field: orderNo, label: 受注番号 }
      - { field: customer, label: 得意先 }
      - { field: orderDate, label: 受注日, type: date }`,
    });
    expect(rules(source)).toContain("no-sortable-column");
    expect(advise(source)[0].says).toContain("列が 3 本あるのに");
  });

  it("一覧はあるのに、絞り込みが1つも無い", () => {
    expect(rules(crud({ search: "" }))).toContain("no-search-filter");
  });

  it("1件を指すキーが一覧に出ていない（行を見てもどのレコードか分からない）", () => {
    expect(rules(crud({ key: "id" }))).toContain("key-not-in-table");
  });

  it("保存する画面なのに、必須が1つも無い", () => {
    const source = crud({
      fields: "          - { field: orderNo, label: 受注番号 }",
    });
    expect(rules(source)).toContain("no-required-field");
  });

  it("条件つき必須があれば言わない（書いてある）", () => {
    const source = crud({
      fields: `          - { field: kind, label: 区分, type: select }
          - { field: orderNo, label: 受注番号, requiredWhen: { field: kind, value: a } }`,
    });
    expect(rules(source)).not.toContain("no-required-field");
  });

  it("消せる・持ち出せるのに、誰に見えるかを決めていない", () => {
    const source = crud({
      actions: `    - { id: remove, type: delete, label: 削除 }
    - { id: csv, type: export, label: CSV出力 }`,
    });
    expect(rules(source).filter((r) => r === "open-dangerous-action")).toHaveLength(2);
    expect(advise(source).find((a) => a.rule === "open-dangerous-action")?.says).toContain(
      "消したものは戻りません",
    );
  });

  it("紙に刷るボタンも持ち出しの口として数える", () => {
    // 画面の外に出たものは取り戻せない。紙も同じ（消す・CSV と並べて言う）。
    const source = crud({
      actions: "    - { id: printPdf, type: print, label: 印刷 }",
    });
    expect(rules(source)).toContain("open-dangerous-action");
    expect(
      advise(source).find((a) => a.rule === "open-dangerous-action")?.says,
    ).toContain("紙で持ち出せます");
  });

  it("まとめて実行するのに確認が無い", () => {
    const source = crud({
      actions: "    - { id: approve, type: plugin, plugin: approveOrders, label: 一括承認, scope: selection, roles: [admin] }",
    });
    expect(rules(source)).toContain("bulk-without-confirm");
    expect(
      advise(source).find((a) => a.rule === "bulk-without-confirm")?.says,
    ).toContain("件数ぶん");
    // roles を書いてあるので「誰でも押せます」は出ない。
    expect(rules(source)).not.toContain("open-dangerous-action");
  });

  it("一括は型に関わらず危ない側（roles が無ければ言う）", () => {
    const source = crud({
      actions: "    - { id: approve, type: plugin, plugin: approveOrders, label: 一括承認, scope: selection, confirm: { message: やります } }",
    });
    expect(
      advise(source).find((a) => a.rule === "open-dangerous-action")?.says,
    ).toContain("まとめて実行できます");
    expect(rules(source)).not.toContain("bulk-without-confirm");
  });

  it("roles を書いてあれば言わない", () => {
    const source = crud({
      actions: "    - { id: remove, type: delete, label: 削除, roles: [admin] }",
    });
    expect(rules(source)).not.toContain("open-dangerous-action");
  });

  it("金額らしい列に桁区切りが無い（名前からの推測だと言う）", () => {
    const source = crud({
      columns: `      - { field: orderNo, label: 受注番号, sortable: true }
      - { field: amount, label: 金額, type: number }`,
    });
    const money = advise(source).find((one) => one.rule === "money-without-format");
    expect(money?.guess).toBe(true);
    expect(money?.says).toContain("1234567 と出ます");
  });

  it("明細を別テーブルに持つのに、親を指すキーが無い", () => {
    const source = crud({
      fields: `          - { field: orderNo, label: 受注番号, required: true }
          - field: lines
            label: 明細
            type: subTable
            source: { repository: orderLineRepository }
            columns:
              - { field: item, label: 品名 }`,
    });
    expect(rules(source)).toContain("subtable-without-parent-key");
  });

  it("帳票に合計が無い", () => {
    const report = `page:
  type: report
  id: sales_report
  title: 売上明細表
  repository: orderRepository
  table:
    columns:
      - { field: amount, label: 金額, type: number, format: currency }
  report:
    groupBy:
      - { field: customer, label: 得意先 }
    sort: { field: customer }
`;
    expect(rules(report)).toContain("report-without-totals");
  });
});

describe("画面の種別を見ている（見当違いを言わない）", () => {
  it("照会（detail）に「必須が無い」とは言わない", () => {
    const detail = `page:
  type: detail
  id: order_detail
  title: 受注詳細
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号 }
`;
    expect(rules(detail)).not.toContain("no-required-field");
  });

  it("帳票に「並べ替えできない」とは言わない（印字順は report.sort）", () => {
    const report = `page:
  type: report
  id: sales_report
  title: 売上明細表
  repository: orderRepository
  table:
    columns:
      - { field: customer, label: 得意先 }
      - { field: orderNo, label: 受注番号 }
      - { field: amount, label: 金額, type: number, format: currency }
  report:
    sort: { field: customer }
    totals:
      - { field: amount, aggregate: sum }
`;
    expect(rules(report)).not.toContain("no-sortable-column");
  });
});

describe("助言は警告ではない", () => {
  it("出力に毎回そう書く（読み手が混同すると警告の信頼が落ちる）", () => {
    expect(renderAdvice([])).toContain(ADVICE_NOTE);
    expect(renderAdvice(advise(crud({ search: "" })))).toContain(ADVICE_NOTE);
    expect(ADVICE_NOTE).toContain("hatake validate");
  });

  it("助言が出る定義は、警告ゼロでも構わない（別の物差し）", () => {
    const source = crud({ search: "" });
    expect(findWarnings(parseYaml(source) as Record<string, unknown>)).toEqual([]);
    expect(rules(source).length).toBeGreaterThan(0);
  });
});

describe("嘘をつかない", () => {
  it("勧めるキーは、その場所に本当に書けるキーである", () => {
    const sources = [
      crud({ search: "" }),
      crud({ key: "id" }),
      crud({ fields: "          - { field: orderNo, label: 受注番号 }" }),
      crud({
        actions: `    - { id: remove, type: delete, label: 削除 }
    - { id: csv, type: export, label: CSV出力 }`,
      }),
      crud({
        columns: `      - { field: orderNo, label: 受注番号 }
      - { field: customer, label: 得意先 }
      - { field: amount, label: 金額, type: number }`,
      }),
    ];
    for (const source of sources) {
      const advice = advise(source);
      expect(advice.length).toBeGreaterThan(0);
      expect(unwritableAdvice(advice, reference)).toEqual([]);
    }
  });

  it("同梱の例に対する助言も、書けるキーだけを勧める", () => {
    const dir = "../spec/examples";
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".yaml"))) {
      const advice = advise(readFileSync(`${dir}/${file}`, "utf8"));
      expect(unwritableAdvice(advice, reference), file).toEqual([]);
    }
  });

  // 助言は数が増えると読まれなくなる（＝規則を足しすぎると道具ごと死ぬ）。同梱の例は
  // まともに書いてあるので、そこに何件出るかが「鳴りすぎ」の目安になる。
  it("同梱の例で鳴りすぎない（1画面あたり3件まで・全部で15件まで）", () => {
    const dir = "../spec/examples";
    let total = 0;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".yaml"))) {
      const source = readFileSync(`${dir}/${file}`, "utf8");
      const pages = /^\s*app\s*:/m.test(source) ? 8 : 1;
      const advice = advise(source);
      total += advice.length;
      expect(advice.length, file).toBeLessThanOrEqual(pages * 3);
    }
    expect(total).toBeLessThanOrEqual(15);
  });
});

describe("項目間の検証（compare）を勧める", () => {
  /** 予約のような「期間」を持つ入力画面。 */
  const period = (fields: string) => `page:
  type: form
  id: reservation
  title: 予約
  repository: reservationRepository
  form:
    sections:
      - fields:
${fields}
  actions:
    - { id: save, type: create, label: 登録 }
`;

  /** 明細（subTable）と合計を持つ入力画面。 */
  const withDetails = (total: string, rows = "number") => `page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true }
          - field: lines
            label: 明細
            type: subTable
            columns:
              - { field: item, label: 品名 }
              - { field: amount, label: 金額, type: ${rows} }
            fields:
              - { field: item, label: 品名, required: true }
              - { field: amount, label: 金額, type: ${rows}, required: true }
${total}
  actions:
    - { id: save, type: create, label: 登録 }
`;

  it("開始と終了の組が居るのに、向きを縛っていない", () => {
    const source = period(`          - { field: startDate, label: 開始日, type: date, required: true }
          - { field: endDate, label: 終了日, type: date, required: true }`);
    expect(rules(source)).toContain("dates-without-compare");
    const one = advise(source).find((a) => a.rule === "dates-without-compare");
    expect(one?.says).toContain("「終了日」は「開始日」より前の値でも保存できます");
    expect(one?.add).toContain("field: startDate");
    // 名前からの推測なので、そう言う（押し付けない）。
    expect(one?.guess).toBe(true);
  });

  it("日付でなくても、対になっていれば言う（priceFrom / priceTo）", () => {
    const source = period(`          - { field: priceFrom, label: 単価（下限）, type: number }
          - { field: priceTo, label: 単価（上限）, type: number }`);
    expect(rules(source)).toContain("dates-without-compare");
  });

  it("すでに compare が書いてあれば言わない", () => {
    const source = period(`          - { field: startDate, label: 開始日, type: date }
          - { field: endDate, label: 終了日, type: date, validators: [{ type: compare, operator: gte, field: startDate }] }`);
    expect(rules(source)).not.toContain("dates-without-compare");
  });

  it("対になる相手が居なければ言わない", () => {
    const source = period(`          - { field: endDate, label: 終了日, type: date }
          - { field: memo, label: 備考, type: textarea }`);
    expect(rules(source)).not.toContain("dates-without-compare");
  });

  it("合計を手で入れられるのに、明細の和と突き合わせていない", () => {
    const source = withDetails(
      "          - { field: total, label: 合計金額, type: number }",
    );
    expect(rules(source)).toContain("total-without-compare");
    const one = advise(source).find((a) => a.rule === "total-without-compare");
    expect(one?.says).toContain("「合計金額」は手で入れられる");
    expect(one?.add).toContain("field: lines, aggregate: sum, of: amount");
  });

  it("計算項目の合計には言わない（明細から出しているので）", () => {
    const source = withDetails(
      "          - { field: total, label: 合計金額, computed: { op: sum, fields: [amount] } }",
    );
    expect(rules(source)).not.toContain("total-without-compare");
  });

  it("明細に数の列が無ければ言わない（足せる相手が分からないので）", () => {
    const source = withDetails(
      "          - { field: total, label: 合計金額, type: number }",
      "text",
    );
    expect(rules(source)).not.toContain("total-without-compare");
  });

  it("明細が無ければ言わない", () => {
    const source = period(
      "          - { field: total, label: 合計金額, type: number }",
    );
    expect(rules(source)).not.toContain("total-without-compare");
  });

  it("物差しで切れる・語を差し替えられる", () => {
    const source = period(`          - { field: startDate, label: 開始日, type: date }
          - { field: endDate, label: 終了日, type: date }`);
    const off = findAdvice(parseYaml(source) as Record<string, unknown>, {
      off: ["dates-without-compare"],
      options: {},
      require: [],
    });
    expect(off.map((a) => a.rule)).not.toContain("dates-without-compare");

    // 語を「自 / 至」だけにすると、start / end では鳴らない。
    const narrowed = findAdvice(parseYaml(source) as Record<string, unknown>, {
      off: [],
      options: {
        "dates-without-compare": { startWords: ["自"], endWords: ["至"] },
      },
      require: [],
    });
    expect(narrowed.map((a) => a.rule)).not.toContain("dates-without-compare");
  });

  it("勧めるキーは、その場所に本当に書ける（validators）", () => {
    const sources = [
      period(`          - { field: startDate, label: 開始日, type: date }
          - { field: endDate, label: 終了日, type: date }`),
      withDetails("          - { field: total, label: 合計金額, type: number }"),
    ];
    for (const source of sources) {
      const advice = advise(source);
      expect(advice.length).toBeGreaterThan(0);
      expect(unwritableAdvice(advice, reference)).toEqual([]);
    }
  });
});

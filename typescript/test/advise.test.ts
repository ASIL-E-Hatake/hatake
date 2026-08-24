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

describe("危ない一括を機械が言う", () => {
  /** 一覧1枚＋一括ボタン1つ。[action] がそのボタン、[pagination] は表のページ送り。 */
  const bulk = (action: string, pagination = "") => `page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  search:
    filters:
      - { field: orderNo, label: 受注番号 }
  table:
${pagination}    columns:
      - { field: orderNo, label: 受注番号, sortable: true }
  actions:
    - ${action}
`;

  /** 一括の規則だけを見る（一覧の作りの助言は別の話）。 */
  const bulkRules = (source: string): string[] =>
    rules(source).filter((one) => one.startsWith("bulk-"));

  const FULL =
    `{ id: approve, type: plugin, plugin: approveOrders, label: 一括承認,
        scope: selection, roles: [manager],
        confirm: { message: '{count} 件を承認します' },
        onError: { message: '{failed} 件は承認できませんでした' } }`;

  it("確認・件数・失敗の言い方が揃っていれば何も言わない", () => {
    expect(bulkRules(bulk(FULL))).toEqual([]);
  });

  it("確認が無ければ言う（押し間違いが件数ぶん効く）", () => {
    const source = bulk(`{ id: approve, type: plugin, plugin: p, label: 一括承認,
        scope: selection, roles: [manager],
        onError: { message: 'x' } }`);
    expect(bulkRules(source)).toEqual(["bulk-without-confirm"]);
  });

  it("聞く形（prompt）なら、その OK が確認そのもの＝確認が無いとは言わない", () => {
    // ダイアログは1枚しか出ない（prompt の OK が実行）。ここで「確認が無い」と言うのは嘘。
    const source = bulk(`{ id: notify, type: plugin, plugin: p, label: 通知,
        scope: selection, roles: [manager],
        prompt: { title: '{count} 件に通知します', fields: [{ field: memo, label: 本文 }] },
        onError: { message: 'x' } }`);
    expect(bulkRules(source)).toEqual([]);
  });

  it("聞く形でも、戻せない操作なら OK を赤くしろと言う（prompt の OK が実行そのもの）", () => {
    // `danger` は `confirm` に書く。prompt だけを書くと OK は普通の色のまま。
    const source = bulk(`{ id: reject, type: plugin, plugin: p, label: 却下,
        scope: selection, roles: [manager],
        prompt: { title: '{count} 件を却下します', fields: [{ field: reason, label: 理由 }] },
        onError: { message: 'x' } }`);
    expect(bulkRules(source)).toEqual(["bulk-destructive-without-danger"]);
  });

  it("確認はあるのに件数が無ければ言う（ボタンには出るが、最後に読む文には出ない）", () => {
    const source = bulk(`{ id: approve, type: plugin, plugin: p, label: 一括承認,
        scope: selection, roles: [manager],
        confirm: { message: 選んだ受注を承認します },
        onError: { message: 'x' } }`);
    const found = advise(source).find((one) => one.rule === "bulk-confirm-without-count");
    expect(found?.where).toBe("page.actions[0].confirm");
    expect(found?.add).toContain("{count}");
  });

  it("失敗したときの言い方が無ければ言う（一括は途中まで進んで終わる）", () => {
    const source = bulk(`{ id: approve, type: plugin, plugin: p, label: 一括承認,
        scope: selection, roles: [manager],
        confirm: { message: '{count} 件を承認します' } }`);
    const found = advise(source).find((one) => one.rule === "bulk-without-error-message");
    expect(found?.where).toBe("page.actions[0].onError");
    expect(found?.says).toContain("途中まで進んで終わる");
  });

  it("戻せない名前なのに確認の OK が赤くなければ言う（推測なので guess）", () => {
    const source = bulk(`{ id: discardSelected, type: plugin, plugin: p, label: 破棄,
        scope: selection, roles: [manager],
        confirm: { message: '{count} 件を破棄します' },
        onError: { message: 'x' } }`);
    const found = advise(source).find(
      (one) => one.rule === "bulk-destructive-without-danger",
    );
    expect(found?.guess).toBe(true);
    expect(found?.add).toContain("danger: true");
  });

  it("danger を書いてあれば言わない", () => {
    const source = bulk(`{ id: discardSelected, type: plugin, plugin: p, label: 破棄,
        scope: selection, roles: [manager],
        confirm: { message: '{count} 件を破棄します', danger: true },
        onError: { message: 'x' } }`);
    expect(bulkRules(source)).toEqual([]);
  });

  it("型が delete なら赤いので言わない（Renderer の既定）", () => {
    // 一括の削除は Renderer が持たないが、型を書くこと自体は定義として通る。
    const source = bulk(`{ id: removeSelected, type: delete, label: 削除,
        scope: selection, roles: [manager],
        confirm: { message: '{count} 件を消します' },
        onError: { message: 'x' } }`);
    expect(bulkRules(source)).toEqual([]);
  });

  it("ページ送りを切った表に一括があれば言う（1回で全件動く）", () => {
    const source = bulk(FULL, "    pagination: { enabled: false }\n");
    const found = advise(source).find((one) => one.rule === "bulk-on-many-rows");
    // 直す場所は「表の件数」ではなく**そのボタンの上限**（止める口があるほうを指す）。
    expect(found?.where).toBe("page.actions[0].maxRows");
    expect(found?.says).toContain("1回で全件");
  });

  it("1ページが多すぎれば言う（既定は 100 件まで）", () => {
    const source = bulk(FULL, "    pagination: { pageSize: 500 }\n");
    const found = advise(source).find((one) => one.rule === "bulk-on-many-rows");
    expect(found?.says).toContain("1回で 500 件");
  });

  it("ページ送りが常識的なら言わない", () => {
    expect(bulkRules(bulk(FULL, "    pagination: { pageSize: 50 }\n"))).toEqual([]);
  });

  it("一括でないボタンには、一括の物差しを当てない", () => {
    // 1件ずつのボタンに「件数を書け」「失敗の言い方を書け」と言うのは見当違い。
    const source = bulk(`{ id: csv, type: export, label: CSV出力, roles: [manager] }`);
    expect(bulkRules(source)).toEqual([]);
  });
});

describe("上限を書いてあれば、件数の助言は言わない", () => {
  const bulk = (action: string, pagination: string) => `page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  search:
    filters:
      - { field: orderNo, label: 受注番号 }
  table:
${pagination}    columns:
      - { field: orderNo, label: 受注番号, sortable: true }
  actions:
    - ${action}
`;

  const FULL = (extra: string) =>
    `{ id: approve, type: plugin, plugin: p, label: 一括承認,
        scope: selection, roles: [manager], ${extra}
        confirm: { message: '{count} 件を承認します' },
        onError: { message: '{failed} 件は承認できませんでした' } }`;

  it("上限を書いてあれば、ページ送りを切っていても言わない（Renderer が止める）", () => {
    const source = bulk(FULL("maxRows: 20,"), "    pagination: { enabled: false }\n");
    expect(rules(source).filter((one) => one.startsWith("bulk-"))).toEqual([]);
  });

  it("上限が無ければ、直し方は maxRows を指す（止める口があるので）", () => {
    const source = bulk(FULL(""), "    pagination: { enabled: false }\n");
    const found = advise(source).find((one) => one.rule === "bulk-on-many-rows");
    expect(found?.where).toBe("page.actions[0].maxRows");
    expect(found?.key).toBe("maxRows");
    expect(found?.add).toContain("maxRows");
  });

  it("1ページが多すぎる表でも、上限を書いてあれば言わない", () => {
    const source = bulk(FULL("maxRows: 20,"), "    pagination: { pageSize: 500 }\n");
    expect(rules(source).filter((one) => one.startsWith("bulk-"))).toEqual([]);
  });
});

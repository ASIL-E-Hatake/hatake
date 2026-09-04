import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  coverScenario,
  compareAnswer,
  draftScenario,
  parsePageYaml,
  runCase,
  runScenario,
  type PageDefinition,
  type ScenarioCase,
} from "../src/index.js";

/** 明細つきの入力画面1枚（条件・計算・行どうしの規則が一通り入っている）。 */
const source = `page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true, normalize: [trim] }
          - { field: kind, label: 区分, type: select,
              options: [{ value: personal, label: 個人 }, { value: corporate, label: 法人 }] }
          - { field: companyNo, label: 法人番号,
              visibleWhen: { field: kind, operator: equals, value: corporate },
              requiredWhen: { field: kind, operator: equals, value: corporate } }
          - field: lines
            label: 明細
            type: subTable
            validators: [{ type: unique, of: item }]
            fields:
              - { field: item, label: 品名, required: true }
              - { field: qty, label: 数量, type: number, validators: [{ type: min, value: 1 }] }
              - { field: price, label: 単価, type: number }
              - { field: amount, label: 金額, computed: { op: product, fields: [qty, price] } }
          - { field: subtotal, label: 小計, computed: { op: sum, field: lines, of: amount } }
  actions:
    - { id: save, type: plugin, plugin: saveOrder, label: 登録 }
    - { id: reject, type: plugin, plugin: rejectOrder, label: 却下,
        enabledWhen: { field: kind, operator: equals, value: corporate } }
`;

const page = parsePageYaml(source, { strict: true }) as PageDefinition;

describe("定義を動かす（シナリオ）", () => {
  it("行の中の計算が先に当たって、その値を親が畳む", () => {
    const answer = runCase(page, {
      name: "2行",
      record: {
        orderNo: "SO-1",
        lines: [
          { item: "鉛筆", qty: 2, price: 100 },
          { item: "ノート", qty: 1, price: 800 },
        ],
      },
    });
    expect(answer.computed.subtotal).toBe(1000);
    // 保存に渡る形（行の中の計算も入っている）。
    expect((answer.record.lines as Record<string, unknown>[])[0].amount).toBe(200);
    expect(answer.errors).toEqual([]);
  });

  it("normalize は計算より前に当たる（整えた値で計算する）", () => {
    const answer = runCase(page, {
      name: "前後に空白",
      record: { orderNo: "  SO-1  ", lines: [] },
    });
    expect(answer.record.orderNo).toBe("SO-1");
  });

  it("隠れている項目は検証しないし、必須にも数えない", () => {
    const personal = runCase(page, {
      name: "個人",
      record: { orderNo: "SO-1", kind: "personal", lines: [] },
    });
    expect(personal.hidden).toContain("companyNo");
    expect(personal.required).not.toContain("companyNo");
    expect(personal.errors).toEqual([]);

    const corporate = runCase(page, {
      name: "法人",
      record: { orderNo: "SO-1", kind: "corporate", lines: [] },
    });
    expect(corporate.hidden).not.toContain("companyNo");
    expect(corporate.required).toContain("companyNo");
    expect(corporate.errors).toEqual([
      { field: "companyNo", message: "必須項目です" },
    ]);
  });

  it("押せるボタンを答える（enabledWhen が無ければ押せる）", () => {
    const answer = runCase(page, {
      name: "個人",
      record: { orderNo: "SO-1", kind: "personal", lines: [] },
    });
    expect(answer.enabled).toEqual({ save: true, reject: false });
  });

  it("行どうしの規則も回る（行の中だけを見ていては分からない）", () => {
    const answer = runCase(page, {
      name: "同じ品名が2行",
      record: {
        orderNo: "SO-1",
        lines: [
          { item: "鉛筆", qty: 1, price: 100 },
          { item: "鉛筆", qty: 1, price: 100 },
        ],
      },
    });
    expect(answer.errors).toEqual([
      { field: "lines", message: "品名 が同じ行があります（2 行目）" },
    ]);
  });

  it("**答えられないこと**は値を作らずにそう言う（登録が要る計算）", () => {
    const custom = parsePageYaml(
      `page:
  type: form
  id: tax
  title: 税
  repository: repo
  form:
    sections:
      - fields:
          - { field: price, label: 価格, type: number }
          - { field: tax, label: 消費税, computed: { op: consumptionTax, field: price } }
`,
      { strict: true },
    ) as PageDefinition;
    const answer = runCase(custom, { name: "計算", record: { price: 1000 } });
    expect(answer.computed.tax).toBeUndefined();
    expect(answer.cannot.join("")).toContain("consumptionTax");
    expect(answer.cannot.join("")).toContain("登録");
  });
});

describe("期待は書いた欄だけ見る", () => {
  const answer = runCase(page, {
    name: "1行",
    record: { orderNo: "SO-1", lines: [{ item: "鉛筆", qty: 2, price: 100 }] },
  });

  it("計算は書いたキーだけ（全部書かなくていい）", () => {
    expect(compareAnswer({ computed: { subtotal: 200 } }, answer)).toEqual([]);
    expect(compareAnswer({ computed: { subtotal: 999 } }, answer)).toHaveLength(1);
  });

  it("エラーは書いたら完全一致（`[]` は「出ない」）", () => {
    expect(compareAnswer({ errors: [] }, answer)).toEqual([]);
    expect(
      compareAnswer({ errors: [{ field: "orderNo", message: "必須項目です" }] }, answer),
    ).toHaveLength(1);
  });

  it("隠れている・必須は「含む」で見る", () => {
    expect(compareAnswer({ hidden: ["companyNo"] }, answer)).toEqual([]);
    expect(compareAnswer({ required: ["orderNo"] }, answer)).toEqual([]);
    expect(compareAnswer({ required: ["companyNo"] }, answer)).toHaveLength(1);
  });

  it("何も書かなければ、動かすだけで通る（答えを見るのに使える）", () => {
    expect(compareAnswer(undefined, answer)).toEqual([]);
  });
});

describe("下書きを定義から起こす", () => {
  const { file, todo } = draftScenario(page);

  it("全部埋めた1件と、必須を空にした件を作る", () => {
    expect(file.cases[0].name).toContain("全部埋めた");
    expect(file.cases.map((one) => one.name).join("\n")).toContain(
      "必須の「受注番号」を空にした",
    );
  });

  it("行どうしの規則があれば、同じ値の行を2つ作る", () => {
    expect(file.cases.map((one) => one.name).join("\n")).toContain(
      "同じ item の行が2つ",
    );
  });

  it("作った下書きは**そのまま通る**（期待は答えを写しているので）", () => {
    const results = runScenario(page, file);
    expect(results.filter((one) => one.mismatches.length > 0)).toEqual([]);
    expect(results.length).toBeGreaterThan(2);
  });

  it("形が決まっている項目は値を作らず TODO を置く", () => {
    const strict = parsePageYaml(
      `page:
  type: form
  id: member
  title: 会員
  repository: repo
  form:
    sections:
      - fields:
          - { field: code, label: 会員番号, required: true,
              validators: [{ type: pattern, pattern: "^[A-Z]{2}\\\\d{4}$" }] }
`,
      { strict: true },
    ) as PageDefinition;
    const drafted = draftScenario(strict);
    expect(drafted.file.cases[0].record.code).toBe("TODO_code");
  });

  it("答えられないことは todo に出る（下書きだけ見ても分かる）", () => {
    expect(Array.isArray(todo)).toBe(true);
  });
});

describe("まだ試していない所を数える", () => {
  const cases: ScenarioCase[] = [
    {
      name: "個人",
      record: { orderNo: "SO-1", kind: "personal", lines: [{ item: "鉛筆", qty: 1, price: 100 }] },
    },
  ];
  const answers = cases.map((one) => runCase(page, one));
  const report = coverScenario(page, cases, answers);

  it("片側しか試していない条件を挙げる", () => {
    const pending = report.pending.map((one) => one.what).join("\n");
    expect(pending).toContain("「法人番号」が出る条件");
    expect(pending).toContain("「却下」が押せる条件");
  });

  it("落ちる側を試していない検証も挙げる", () => {
    const pending = report.pending.map((one) => `${one.what}:${one.missing.join()}`);
    expect(pending.join("\n")).toContain("落ちた");
  });

  it("両側を試せば残らない", () => {
    const both: ScenarioCase[] = [
      ...cases,
      {
        name: "法人",
        record: { orderNo: "SO-2", kind: "corporate", companyNo: "1234", lines: [] },
      },
    ];
    const seen = coverScenario(
      page,
      both,
      both.map((one) => runCase(page, one)),
    );
    const pending = seen.pending.map((one) => one.what).join("\n");
    expect(pending).not.toContain("「法人番号」が出る条件");
    expect(pending).not.toContain("「却下」が押せる条件");
  });
});

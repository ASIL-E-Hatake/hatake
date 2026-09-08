import { describe, expect, it } from "vitest";
import {
  deriveFixtures,
  parsePageYaml,
  runCase,
  type PageDefinition,
} from "../src/index.js";

/**
 * サーバ側の試験データ。
 *
 * 一番大事なのは**言い切ったことが本当か**（「弾かれるはず」の形が実際に落ちるか）。
 * そこが違うと、サーバを書く人は道具の言うほうを信じて緩い実装を通してしまう。
 */
const source = `page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true,
              validators: [{ type: maxLength, value: 8 }] }
          - { field: customer, label: 顧客, required: true }
          - { field: memo, label: 備考 }
          - field: lines
            label: 明細
            type: subTable
            required: true
            validators: [{ type: unique, of: item }]
            fields:
              - { field: item, label: 品名, required: true }
              - { field: qty, label: 数量, type: number,
                  validators: [{ type: min, value: 1 }, { type: max, value: 99 }] }
              - { field: price, label: 単価, type: number }
              - { field: amount, label: 金額, computed: { op: product, fields: [qty, price] } }
          - { field: subtotal, label: 小計, computed: { op: sum, field: lines, of: amount } }
`;

const page = parsePageYaml(source, { strict: true }) as PageDefinition;

describe("サーバ側の試験データ", () => {
  const file = deriveFixtures(page);

  it("言い切ったことは本当か（動かして確かめている）", () => {
    // これが通らない道具は、サーバを書く人に嘘の境界を渡す。
    for (const one of file.records) {
      const answer = runCase(page, { name: one.name, record: one.record });
      expect(answer.errors.length === 0, `${one.name}: ${JSON.stringify(answer.errors)}`)
        .toBe(one.valid);
    }
  });

  it("通る形と弾く形の両方を出す（片側だけだと緩めたことに気づけない）", () => {
    expect(file.records.some((one) => one.valid)).toBe(true);
    expect(file.records.some((one) => !one.valid)).toBe(true);
  });

  it("必須・文字数・数の上下限・行どうしの規則から作る", () => {
    const names = file.records.map((one) => one.name);
    expect(names).toContain("必須の「受注番号」が無い");
    expect(names).toContain("「受注番号」が 8 文字ぴったり");
    expect(names).toContain("「受注番号」が 9 文字");
    expect(names).toContain("明細「明細」に同じ item の行が2つ");
  });

  it("弾く形は、どの項目で落ちるかを言う", () => {
    const rejected = file.records.filter((one) => !one.valid);
    for (const one of rejected) expect(one.field).toBeTypeOf("string");
    const rowError = file.records.find((one) =>
      one.name.includes("必須の「品名」が無い"),
    );
    expect(rowError?.field).toBe("lines[0].item");
  });

  it("レコードはサーバが受け取る形（計算した値が入っている）", () => {
    const ok = file.records.find((one) => one.name === "全部埋めた");
    expect(ok?.record.subtotal).toBeTypeOf("number");
    const rows = ok?.record.lines as Record<string, unknown>[];
    expect(rows[0].amount).toBeTypeOf("number");
  });

  it("入れる先の形の名前を言う（schema / openapi と同じ名前）", () => {
    expect(file.shape).toBe("OrderEntryRequest");
  });

  it("サーバが決める項目は、全件に入っていると言う", () => {
    // 別の件を作らずに言うのは、同じ形を2つ出しても読む手間が増えるだけだから。
    expect(file.notes.join("\n")).toContain("どのレコードにも入っています");
  });
});

describe("言えないことは言わない", () => {
  it("形が決まっている項目は値を作らず、人に振る", () => {
    const withPattern = parsePageYaml(
      `page:
  type: form
  id: member
  title: 会員
  repository: memberRepository
  form:
    sections:
      - fields:
          - { field: memberNo, label: 会員番号, required: true,
              validators: [{ type: pattern, pattern: "^M[0-9]{6}$" }] }
`,
      { strict: true },
    ) as PageDefinition;
    const file = deriveFixtures(withPattern);
    expect(file.notes.join("\n")).toContain("TODO_memberNo");
    // 正規表現を満たす文字列を機械が作ると、業務としてあり得ない会員番号ができる。
    // なので「通るはず」の形は出せない（出したら嘘になる）。
    for (const one of file.records) expect(one.valid).toBe(false);
  });

  it("レコードを受け取らない画面には、試験データが無い", () => {
    const search = parsePageYaml(
      `page:
  type: search
  id: orders
  title: 受注検索
  repository: orderRepository
  table:
    columns: [{ field: orderNo, label: 受注番号 }]
`,
      { strict: true },
    ) as PageDefinition;
    const file = deriveFixtures(search);
    expect(file.records).toEqual([]);
    expect(file.$comment).toContain("レコードを受け取らない");
  });

  it("プラグインの計算は値を作らず、そう言う", () => {
    const withPlugin = parsePageYaml(
      `page:
  type: form
  id: tax
  title: 税
  repository: taxRepository
  form:
    sections:
      - fields:
          - { field: price, label: 価格, type: number }
          - { field: tax, label: 消費税,
              computed: { op: consumptionTax, field: price } }
`,
      { strict: true },
    ) as PageDefinition;
    const file = deriveFixtures(withPlugin);
    expect(file.notes.join("\n")).toContain("consumptionTax");
  });
});

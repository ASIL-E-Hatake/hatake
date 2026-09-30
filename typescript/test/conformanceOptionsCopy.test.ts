import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { copiedFrom, parsePageYaml } from "../src/internal.js";

/**
 * 選んだ選択肢から値を写す共有フィクスチャを、Dart 版と同じ契約で回す。Flutter と
 * ブラウザで、同じ商品を選んで入る単価が違う（片方だけ写す・片方だけ空で上書きする）を防ぐ。
 */
const fixture = JSON.parse(readFileSync("../spec/conformance/options_copy.json", "utf8")) as {
  cases: { name: string; copy: Record<string, string>; row: Record<string, unknown> | null; expected: Record<string, unknown> }[];
};

describe("conformance: options copy", () => {
  for (const one of fixture.cases) {
    it(one.name, () => {
      expect(copiedFrom({ copy: one.copy }, one.row)).toEqual(one.expected);
    });
  }

  it("定義から読める（strict を通る）", () => {
    const page = parsePageYaml(
      `page:
  type: form
  id: entry
  title: 入力
  repository: orderRepository
  form:
    sections:
      - fields:
          - field: productCode
            label: 商品
            type: select
            optionsSource: { repository: productRepository, copy: { unitPrice: price, taxRate: taxRate } }
          - { field: unitPrice, label: 単価, type: number }
          - { field: taxRate, label: 税率, type: number, readOnly: true }`,
      { strict: true },
    );
    const field = page.kind === "form" ? page.form.sections[0].fields[0] : undefined;
    expect(field?.optionsSource?.copy).toEqual({ unitPrice: "price", taxRate: "taxRate" });
  });
});

describe("読み返し（explain）", async () => {
  const { explainPage } = await import("../src/internal.js");
  const { parse } = await import("yaml");
  it("写す項目と、名前を引く列を言う", () => {
    const source = `page:
  type: crud
  id: lines
  title: 明細
  repository: lineRepository
  table:
    columns:
      - { field: productCode, label: 商品, optionsSource: { repository: productRepository } }
  form:
    sections:
      - fields:
          - field: productCode
            label: 商品
            type: select
            optionsSource: { repository: productRepository, copy: { unitPrice: price } }
          - { field: unitPrice, label: 単価, type: number }`;
    const text = JSON.stringify(explainPage(parsePageYaml(source), parse(source).page));
    expect(text).toContain("名前は productRepository から引く");
    expect(text).toContain("選ぶと 単価 も入る");
  });
});

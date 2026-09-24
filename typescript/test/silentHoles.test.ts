import { describe, expect, it } from "vitest";

import { parse as parseYaml } from "yaml";
import { findWarnings } from "../src/warnings.js";

/**
 * **黙る穴**を塞ぎきる。
 *
 * どちらも「定義は通るのに、画面に出るものが思っていたものと違う」種類で、
 * しかも**エラーにならない**ので、開いて目で見るまで気づけない。
 */
type Dict = Record<string, unknown>;
const doc = (source: string): Dict => parseYaml(source) as Dict;
const rules = (source: string): string[] =>
  findWarnings(doc(source)).map((one) => one.rule);
const says = (source: string): string =>
  findWarnings(doc(source))
    .map((one) => `${one.message} ${one.fix ?? ""}`)
    .join("\n");

const form = (validator: string) => `
dsl_version: "1.0"
page:
  type: form
  id: order
  title: 受注
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - { field: limit, label: 上限, type: number }
          - field: amount
            label: 金額
            type: number
            validators:
              - ${validator}
`;

describe("検証の文言に、埋まらない差し込み", () => {
  it("項目名を書いても埋まらない（開いた形だと思われがちな所）", () => {
    // 画面に `{金額}` とそのまま出る＝利用者に見える。
    const found = rules(
      form('{ type: max, value: 1000, message: "{金額} を超えています" }'),
    );
    expect(found).toContain("placeholder-not-filled");
  });

  it("書ける2つは何も言わない", () => {
    expect(
      rules(form('{ type: maxLength, value: 20, message: "{value} 文字までです" }')),
    ).toEqual([]);
  });

  it("`{target}` は比べる検証でしか埋まらない", () => {
    // 相手が居ないので埋まらない。`max` に書いても値が来ない。
    const found = says(
      form('{ type: max, value: 1000, message: "{target} より小さく" }'),
    );
    expect(found).toContain("`compare` だけ");
  });

  it("比べる検証に書いたときは言わない", () => {
    expect(
      rules(
        form('{ type: compare, field: limit, operator: lte, message: "{target} 以下に" }'),
      ),
    ).toEqual([]);
  });

  it("文言そのものが無ければ見ない", () => {
    expect(rules(form("{ type: max, value: 1000 }"))).toEqual([]);
  });
});

const wizard = (condition: string) => `
dsl_version: "1.0"
page:
  type: wizard
  id: signup
  title: 申込
  repository: customerRepository
  key: code
  steps:
    - id: basic
      title: 基本
      fields:
        - { field: code, label: コード, type: text, required: true }
        - { field: kind, label: 区分, type: select,
            options: [ { value: corp, label: 法人 }, { value: personal, label: 個人 } ] }
    - id: corp
      title: 法人情報
      visibleWhen: ${condition}
      fields:
        - { field: billingCode, label: 請求先, type: text }
`;

describe("誰にも出ないステップ", () => {
  it("見ている項目が画面のどこにも無ければ言う", () => {
    const found = rules(wizard("{ field: nosuch, value: corp }"));
    expect(found).toContain("step-visiblewhen-never-true");
  });

  it("綴り違いなら、近い名前を添える", () => {
    expect(says(wizard("{ field: kinds, value: corp }"))).toContain("kind");
  });

  it("前のステップの項目を見ているなら言わない（それが普通の使い方）", () => {
    expect(rules(wizard("{ field: kind, value: corp }"))).toEqual([]);
  });

  it("条件そのものが矛盾していても言う", () => {
    const found = rules(
      wizard("{ all: [ { field: kind, value: corp }, { field: kind, value: personal } ] }"),
    );
    expect(found).toContain("step-visiblewhen-never-true");
  });

  it("出し分けを書いていないステップは見ない", () => {
    const source = wizard("{ field: kind, value: corp }").replace(
      /      visibleWhen: .*\n/,
      "",
    );
    expect(rules(source)).toEqual([]);
  });
});

describe("同じ意味の条件が、書き方で答えを変えない", () => {
  const both = (operator: string) => `
dsl_version: "1.0"
page:
  type: form
  id: order
  title: 受注
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - { field: kind, label: 区分, type: text }
          - field: a
            label: 出し分け
            type: text
            visibleWhen:
              all:
                - { field: kind, ${operator}value: corp }
                - { field: kind, ${operator}value: personal }
`;

  it("`operator` を省いても言う（省くのが普通の書き方）", () => {
    // 既定は `equals`。明示を求めていたので、**書けば言われ、省くと黙って**いた。
    expect(rules(both(""))).toContain("visiblewhen-never-true");
  });

  it("明示したときと同じことを言う", () => {
    expect(rules(both("operator: equals, "))).toEqual(rules(both("")));
  });
});

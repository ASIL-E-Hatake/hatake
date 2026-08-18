import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  anonymize,
  diagnosesOf,
  type FailureCatalog,
  failureSource,
  harvestFailures,
  reproOf,
} from "../src/index.js";

const catalog = JSON.parse(
  readFileSync("../spec/failures.json", "utf8"),
) as FailureCatalog;

const document = (source: string): Record<string, unknown> =>
  parseYaml(source) as Record<string, unknown>;

/** 転んだ所（宣言していない行アクション）が、大きな定義の中に1つある。 */
const BIG = `dsl_version: "1.0"
page:
  type: crud
  id: order_list
  title: 受注一覧
  repository: orderRepository
  key: orderNo
  search:
    filters:
      - { field: orderNo, label: 受注番号 }
      - { field: customer, label: 得意先 }
  table:
    rowActions: [edit, approve]
    columns:
      - { field: orderNo, label: 受注番号, sortable: true }
      - { field: customer, label: 得意先 }
      - { field: amount, label: 金額, type: number, format: currency }
  form:
    sections:
      - title: 基本
        fields:
          - { field: orderNo, label: 受注番号, required: true }
          - { field: customer, label: 得意先, required: true }
      - title: 明細
        fields:
          - { field: note, label: 備考, type: textarea }
  actions:
    - { id: create, type: create, label: 新規 }
`;

describe("最小の再現を作る", () => {
  const repro = reproOf(document(BIG), "rowaction-not-declared");

  it("目当ての診断は出続ける", () => {
    expect(repro).not.toBeNull();
    expect(repro!.diagnoses).toEqual(["rowaction-not-declared"]);
  });

  it("要らない所は削れている（元よりずっと短い）", () => {
    expect(repro!.removed).toBeGreaterThan(5);
    expect(repro!.wrote.length).toBeLessThan(BIG.trimEnd().split("\n").length / 2);
  });

  it("削ったあとも定義として読める形（貼ればそのまま試せる）", () => {
    const shrunk = document(`${repro!.wrote.join("\n")}\n`);
    expect(shrunk.page).toBeTypeOf("object");
    expect(diagnosesOf(shrunk)).toEqual(new Set(["rowaction-not-declared"]));
  });

  it("ラベルは記号に置き換える（客先の語彙を持ち出さない）", () => {
    const text = repro!.wrote.join("\n");
    expect(text).not.toContain("受注一覧");
    expect(text).not.toContain("得意先");
    expect(text).toContain("名前1");
  });

  it("識別子は残る（残るという事実を候補の todo に書いてある）", () => {
    const text = repro!.wrote.join("\n");
    expect(text).toContain("order_list");
    expect(text).toContain("approve");
  });

  it("その診断が出ていない定義には作らない（呼び違いに何か返さない）", () => {
    expect(reproOf(document(BIG), "unknown-page")).toBeNull();
  });

  it("外との辻褄の診断は、登録済み一覧つきで再現する", () => {
    const guessed = `page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepo
  key: orderNo
  table:
    columns:
      - { field: orderNo, label: 受注番号 }
      - { field: amount, label: 金額, type: number }
`;
    const registry = { repositories: ["orderRepository"] };
    const found = reproOf(document(guessed), "unknown-repository", { registry });
    expect(found!.diagnoses).toEqual(["unknown-repository"]);
    expect(found!.wrote.join("\n")).toContain("orderRepo");
  });

  it("新しい診断が出る削り方はしない", () => {
    // 削った結果に別の警告が混ざっていたら、それは別の転び方を作ったということ。
    for (const failure of catalog.failures) {
      const target = failure.diagnosis.warnings?.[0];
      if (target === undefined) continue;
      const before = diagnosesOf(document(failureSource(failure.wrote)), failure.registry);
      const found = reproOf(document(failureSource(failure.wrote)), target, {
        registry: failure.registry,
      });
      for (const name of found!.diagnoses) {
        expect(before.has(name), `${failure.id}: ${name}`).toBe(true);
      }
    }
  });
});

describe("匿名化", () => {
  it("同じ文字列は同じ記号になる（対応が読める形を保つ）", () => {
    const before = {
      title: "受注",
      fields: [
        { label: "得意先", field: "customer" },
        { label: "得意先", field: "customer2" },
      ],
    };
    const after = anonymize(before) as typeof before;
    expect(after.title).toBe("名前1");
    expect(after.fields[0].label).toBe("名前2");
    expect(after.fields[1].label).toBe("名前2");
    // 識別子は触らない。
    expect(after.fields[1].field).toBe("customer2");
  });

  it("元は触らない", () => {
    const before = { title: "受注" };
    anonymize(before);
    expect(before.title).toBe("受注");
  });
});

describe("収穫と繋ぐ", () => {
  const inputs = [
    { file: "a.yaml", source: BIG },
    { file: "b.yaml", source: BIG.replace("order_list", "order_list2") },
  ];

  it("既定では下書きを作らない（定義の本文を持ち出さない）", () => {
    const result = harvestFailures(inputs);
    expect(result.candidates[0].wrote).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("受注一覧");
  });

  it("--repro で下書きが付き、人の仕事も1つ減る", () => {
    const result = harvestFailures(inputs, { repro: true });
    const candidate = result.candidates[0];
    expect(candidate.wrote?.join("\n")).toContain("rowActions");
    expect(candidate.removed).toBeGreaterThan(0);
    // 下書きがあるときは「wrote を作れ」ではなく「見て確かめろ」に変わる。
    expect(candidate.todo.join("\n")).toContain("下書きが入っている");
    expect(candidate.todo.join("\n")).toContain("id や項目名は元のまま");
  });
});

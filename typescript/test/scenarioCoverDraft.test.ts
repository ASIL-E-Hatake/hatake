import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COVER_DRAFT_NOTE,
  coverDraftLines,
  coverScenario,
  draftForCover,
  draftScenario,
  parsePageYaml,
  runScenario,
  type PageDefinition,
} from "../src/index.js";

/**
 * まだ試していない分岐から「次に書く1件」を起こす（`run --cover --draft`）。
 *
 * この道具でいちばんまずいのは**当たっていない下書きを配る**こと。埋まらない形を配ると
 * `--cover` が永久にゼロにならず、AI は同じ所を何度も試すことになる。だから
 * **起こしたものを回して、その分岐が本当に埋まったかを確かめてから**配る。
 */
const page = (yaml: string): PageDefinition => parsePageYaml(yaml) as PageDefinition;

const run = (one: PageDefinition, cases: { name: string; record: unknown }[]) => {
  const file = { cases: cases as never };
  const answers = runScenario(one, file).map((r) => r.answer);
  return { cases: file.cases, answers, report: coverScenario(one, file.cases, answers) };
};

const CONDITIONAL = `page:
  type: crud
  id: order_master
  title: 受注
  repository: orderRepository
  key: orderNo
  table:
    columns: [{ field: orderNo, label: 受注番号 }]
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true }
          - field: status
            label: 状態
            type: select
            options:
              - { value: 受付, label: 受付 }
              - { value: 却下, label: 却下 }
          - field: reason
            label: 却下理由
            visibleWhen: { field: status, operator: equals, value: 却下 }
`;

describe("まだ見ていない側から起こす", () => {
  const one = page(CONDITIONAL);

  it("条件の反対側を起こす（リーフだけ動かす）", () => {
    // 「全部埋めた」だけだと、却下理由が出る側を1度も見ていない。
    const { cases, answers, report } = run(one, [
      { name: "全部埋めた", record: { orderNo: "A", status: "受付", reason: "" } },
    ]);
    expect(report.pending.map((p) => p.at)).toContain("reason.visibleWhen");

    const drafted = draftForCover(one, report, cases, answers);
    expect(drafted.filled.map((f) => f.at)).toContain("reason.visibleWhen");
    const made = drafted.file.cases.find((c) => c.record.status === "却下");
    expect(made).toBeDefined();
    expect(made?.$comment).toContain("reason.visibleWhen");
  });

  it("**起こしたものを足すと、その分岐が埋まる**（回して確かめている）", () => {
    const first = run(one, [
      { name: "全部埋めた", record: { orderNo: "A", status: "受付", reason: "" } },
    ]);
    const drafted = draftForCover(one, first.report, first.cases, first.answers);
    const after = run(one, [
      ...(first.cases as never as { name: string; record: unknown }[]),
      ...(drafted.file.cases as never as { name: string; record: unknown }[]),
    ]);
    expect(after.report.pending.map((p) => p.at)).not.toContain("reason.visibleWhen");
  });

  it("期待は動かした結果を写す（すぐ回せる形）", () => {
    const { cases, answers, report } = run(one, [
      { name: "全部埋めた", record: { orderNo: "A", status: "受付", reason: "" } },
    ]);
    const drafted = draftForCover(one, report, cases, answers);
    expect(drafted.file.cases.every((c) => c.expect !== undefined)).toBe(true);
    expect(drafted.file.$comment).toContain("業務として正しいかは人が");
  });
});

describe("起こせないものは、理由つきで並べる", () => {
  const COMBINED = CONDITIONAL.replace(
    "visibleWhen: { field: status, operator: equals, value: 却下 }",
    `visibleWhen:
              all:
                - { field: status, operator: equals, value: 却下 }
                - { field: orderNo, operator: isNotEmpty }`,
  );

  it("組み合わせの条件は起こさない（どれを動かすかが意図）", () => {
    const one = page(COMBINED);
    const { cases, answers, report } = run(one, [
      { name: "全部埋めた", record: { orderNo: "A", status: "受付", reason: "" } },
    ]);
    const drafted = draftForCover(one, report, cases, answers);
    const why = drafted.skipped.find((s) => s.at === "reason.visibleWhen")?.why;
    expect(why).toContain("組み合わせの条件");
    expect(drafted.todo.join("\n")).toContain("人が書いてください");
  });

  it("明細の**行**に対する条件は起こさない（行を作る話）", () => {
    const withRows = `page:
  type: crud
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  table:
    columns: [{ field: orderNo, label: 受注番号 }]
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true }
          - field: lines
            label: 明細
            type: subTable
            fields:
              - { field: item, label: 品名, required: true }
              - { field: amount, label: 金額, type: number }
              - { field: void, label: 取消, type: checkbox }
          - field: total
            label: 合計
            type: number
            computed:
              op: sum
              field: lines
              of: amount
              where: { field: void, operator: equals, value: true }
`;
    const one = page(withRows);
    const { cases, answers, report } = run(one, [
      { name: "1行", record: { orderNo: "A", lines: [{ item: "X", amount: 1 }] } },
    ]);
    const drafted = draftForCover(one, report, cases, answers);
    const why = drafted.skipped.find((s) => s.at === "total.computed.where")?.why;
    expect(why).toContain("行を作る話");
  });

  it("何を起こして何を起こさなかったかを、毎回書く", () => {
    const one = page(COMBINED);
    const { cases, answers, report } = run(one, [
      { name: "全部埋めた", record: { orderNo: "A", status: "受付", reason: "" } },
    ]);
    const text = coverDraftLines(draftForCover(one, report, cases, answers)).join("\n");
    expect(text).toContain("起こせなかった分岐");
    expect(text).toContain(COVER_DRAFT_NOTE);
  });
});

describe("同梱の例で、輪が閉じる", () => {
  it("下書き → 回す → 足りない分を起こす → まだ試していない所がゼロ", () => {
    const yaml = readFileSync("../spec/examples/order_entry.yaml", "utf8");
    const one = page(yaml);
    const first = draftScenario(one);
    const answers = runScenario(one, first.file).map((r) => r.answer);
    const report = coverScenario(one, first.file.cases, answers);
    // 手で書いた下書きだけでは、行の中の検証が残る。
    expect(report.pending.length).toBeGreaterThan(0);

    const drafted = draftForCover(one, report, first.file.cases, answers);
    expect(drafted.file.cases.length).toBeGreaterThan(0);

    const all = { cases: [...first.file.cases, ...drafted.file.cases] };
    const after = coverScenario(
      one,
      all.cases,
      runScenario(one, all).map((r) => r.answer),
    );
    expect(after.pending).toEqual([]);
  });
});

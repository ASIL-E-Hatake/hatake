import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  definitionTargets,
  hardFindings,
  parseIntent,
  parsePageYaml,
  traceIntent,
  traceLines,
  type PageDefinition,
} from "../src/index.js";

/**
 * 言ったこと（意図）と書いたもの（定義）の突き合わせ。
 *
 * 一番効くのは**由来の無い定義**（言っていないのに入っている項目・ボタン）。AI に
 * 書かせると必ず出る類で、しかも動くので画面を見ても気づけない。
 */
const source = `page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  search:
    filters:
      - { field: orderNo, label: 受注番号, operator: contains }
      - { field: memo, label: 備考, operator: contains }
  table:
    rowActions: [detail]
    columns:
      - { field: orderNo, label: 受注番号 }
      - { field: status, label: 状態, roles: [manager] }
  actions:
    - { id: detail, type: plugin, plugin: showDetail, label: 詳細 }
    - { id: approve, type: plugin, plugin: approveOrders, label: 承認, scope: selection }
`;

const page = parsePageYaml(source, { strict: true }) as PageDefinition;

describe("定義の中で指せる相手", () => {
  it("画面・出どころ・絞り込み・列・ボタン・役割を並べる", () => {
    expect(definitionTargets(page)).toEqual([
      "page:order_search",
      "repository:orderRepository",
      "filter:orderNo",
      "filter:memo",
      "column:orderNo",
      "column:status",
      "action:detail",
      "action:approve",
      "role:manager",
    ]);
  });
});

describe("突き合わせ", () => {
  it("言っていないのに入っている（由来の無い定義）を挙げる", () => {
    const intent = parseIntent(`page: order_search
asked:
  - id: R1
    text: 受注番号で探せて、一覧に受注番号と状態が出る
    covers: [filter:orderNo, column:orderNo, column:status]
  - id: R2
    text: 行から詳細を開ける
    covers: [action:detail]
`);
    const result = traceIntent(page, intent);
    const orphans = result.findings
      .filter((one) => one.kind === "orphan")
      .map((one) => one.target);
    // 備考の絞り込みと承認ボタンは、誰も頼んでいない。
    expect(orphans).toEqual(["filter:memo", "action:approve"]);
    // 由来が無いだけでは落とさない（意図を後から書き始めた定義では全部出る）。
    expect(hardFindings(result)).toEqual([]);
  });

  it("言ったのに入っていない（指す相手が定義に無い）で落とす", () => {
    const intent = parseIntent(`asked:
  - id: R3
    text: 却下の理由を選べる
    covers: [field:rejectReason]
`);
    const result = traceIntent(page, intent);
    const hard = hardFindings(result);
    expect(hard.map((one) => one.kind)).toContain("missing-target");
    expect(hard[0].text).toContain("field:rejectReason");
  });

  it("未定と言ったのに定義では決まっている、を言う", () => {
    const intent = parseIntent(`undecided:
  - id: U1
    text: 備考で探せるようにするかは未定
    covers: [filter:memo]
`);
    const result = traceIntent(page, intent);
    expect(hardFindings(result).map((one) => one.kind)).toContain(
      "undecided-but-decided",
    );
  });

  it("どこに落ちたか書いていない要求は、言うだけ", () => {
    const intent = parseIntent(`asked:
  - id: R4
    text: なるべく速く出したい
`);
    const result = traceIntent(page, intent);
    expect(result.findings.some((one) => one.kind === "no-covers")).toBe(true);
    expect(hardFindings(result)).toEqual([]);
  });

  it("人が見ていない下書きは、言うだけ", () => {
    const intent = parseIntent(`asked:
  - id: R5
    text: 受注番号で探せる
    covers: [filter:orderNo]
    source: ai-draft
`);
    const result = traceIntent(page, intent);
    expect(result.findings.some((one) => one.kind === "unconfirmed")).toBe(true);
    expect(hardFindings(result)).toEqual([]);
  });

  it("意図が無ければ「分からない」と言う（「食い違い無し」とは言わない）", () => {
    const result = traceIntent(page, undefined);
    expect(result.hasIntent).toBe(false);
    expect(result.findings).toEqual([]);
    expect(traceLines(result)[0]).toContain("意図の1枚（intent）がありません");
  });

  it("出どころと役割は、指せるが由来を問わない", () => {
    // 毎回同じ行を出すと報告が読まれなくなる（当然のものは並べない）。
    const intent = parseIntent(`asked:
  - id: R1
    text: 全部
    covers:
      - filter:orderNo
      - filter:memo
      - column:orderNo
      - column:status
      - action:detail
      - action:approve
`);
    const result = traceIntent(page, intent);
    expect(result.findings).toEqual([]);
  });
});

describe("同梱の例", () => {
  it("要求と定義が1対1（語彙が実際の画面を覆えている証拠）", () => {
    const example = parsePageYaml(
      readFileSync("../spec/examples/product_search.yaml", "utf8"),
      { strict: true },
    ) as PageDefinition;
    const intent = parseIntent(
      readFileSync("../spec/intents/product_search.intent.yaml", "utf8"),
    );
    const result = traceIntent(example, intent);
    expect(result.findings).toEqual([]);
    expect(result.acceptance.length).toBeGreaterThan(0);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  answeredBy,
  askQuestions,
  buildCheckSheet,
  CHECK_NOTE,
  CHECK_PARTS,
  checkLines,
  type CheckInput,
  DEFAULT_RULES,
  findAdvice,
  findWarnings,
  parseQuestionKinds,
  parseResponsibility,
  withDrafts,
} from "../src/internal.js";

/**
 * AI の1往復を1本で（`hatake check`）。
 *
 * この紙の値打ちは「**4本を別々に呼んだのと同じ結果**」なので、守るのはそこと、
 * **欄を混ぜていない**こと（終了コードを動かすのは事実の欄だけ）。
 */
const CRUD = `page:
  type: crud
  id: order_master
  title: 受注
  repository: orderRepository
  key: id
  search:
    filters:
      - { field: code, label: コード, type: text, operator: contains }
  table:
    columns:
      - { field: code, label: コード }
      - { field: customer, label: 顧客 }
      - { field: amount, label: 金額 }
  form:
    sections:
      - fields:
          - { field: code, label: コード, required: true }
  actions:
    - { id: create, type: create, label: 新規 }
    - { id: remove, type: delete, label: 削除 }
`;

const APP = `app:
  id: sales
  title: 販売
  menu:
    - { id: m1, label: 受注, page: order_master }
    - { id: m2, label: 商品, page: product_master }
  pages:
    - type: master
      id: order_master
      title: 受注
      repository: orderRepository
      key: id
      table:
        columns:
          - { field: code, label: コード }
      form:
        sections:
          - fields:
              - { field: code, label: コード, required: true }
    - type: master
      id: product_master
      title: 商品
      repository: productRepository
      key: id
      table:
        columns:
          - { field: code, label: コード }
      form:
        sections:
          - fields:
              - { field: code, label: コード, required: true }
`;

const TABLE = {
  kinds: parseQuestionKinds(
    JSON.parse(readFileSync("../spec/question-kinds.json", "utf8")),
  ),
  areas: parseResponsibility(
    JSON.parse(readFileSync("../spec/responsibility.json", "utf8")),
  ),
};

const input = (extra: Partial<CheckInput> = {}): CheckInput => ({
  from: "order_master.yaml",
  kind: "crud",
  source: CRUD,
  questions: TABLE,
  ...extra,
});

const raw = (yaml: string): Record<string, unknown> =>
  parseYaml(yaml) as Record<string, unknown>;

describe("1往復で1本", () => {
  it("**4本を別々に呼んだのと同じ結果**（別の数え方をしない）", () => {
    const sheet = buildCheckSheet(input());
    const document = raw(CRUD);
    // 事実（validate の警告）。
    expect(sheet.facts.warnings).toEqual(findWarnings(document));
    // 好み（advise。下書きも同じように添える）。
    expect(sheet.preferences?.advice).toEqual(
      withDrafts(document, findAdvice(document, DEFAULT_RULES)),
    );
    // 人が決めること（ask）。
    const answers = answeredBy(undefined, TABLE.kinds, TABLE.areas);
    expect(sheet.questions?.list).toEqual(
      askQuestions(document, TABLE.kinds, TABLE.areas, {
        answered: answers.answered,
        decided: answers.decided,
      }),
    );
    expect(sheet.questions?.total).toBe(TABLE.kinds.length);
  });

  it("**欄を混ぜない**（事実と好みは別の配列・別の数）", () => {
    const sheet = buildCheckSheet(input());
    const rules = new Set(sheet.facts.warnings.map((one) => one.rule));
    for (const one of sheet.preferences?.advice ?? []) {
      expect(rules, one.rule).not.toContain(one.rule);
    }
    // 読み返しは良し悪しを言わない（そう書いてある、だけ）。
    expect(Object.keys(sheet.readback ?? {})).toEqual(["brief", "explain"]);
  });

  it("**事実の欄は落とせない**（旗で消せると「警告ゼロ」と同じ顔になる）", () => {
    const sheet = buildCheckSheet(
      input({
        drop: {
          readback: "落としました。",
          preferences: "落としました。",
          questions: "落としました。",
        },
      }),
    );
    expect(sheet.facts).toBeDefined();
    expect(sheet.readback).toBeUndefined();
    expect(sheet.preferences).toBeUndefined();
    expect(sheet.questions).toBeUndefined();
    // 落とした欄は**消えずに理由が残る**。
    expect(sheet.omitted.map((one) => one.part)).toEqual([
      CHECK_PARTS.readback,
      CHECK_PARTS.preferences,
      CHECK_PARTS.questions,
    ]);
  });

  it("一覧を渡していないなら、**見ていない**と書く", () => {
    const sheet = buildCheckSheet(input());
    expect(sheet.facts.registry).toContain("見ていません");
    const withRegistry = buildCheckSheet(
      input({ registry: { repositories: ["orderRepository"] } }),
    );
    expect(withRegistry.facts.registry).toContain("渡された一覧");
    const fromApp = buildCheckSheet(
      input({ registry: { repositories: [] }, registryFromApp: true }),
    );
    expect(fromApp.facts.registry).toContain("申告");
  });

  it("app は読み返しを1行ずつ（全文は重すぎる）。絞れば全文", () => {
    const whole = buildCheckSheet(input({ kind: "app: 2 ページ", source: APP }));
    expect(whole.readback?.explain).toBeUndefined();
    expect(whole.omitted.map((one) => one.part)).toContain("読み返しの全文");
    const one = buildCheckSheet(
      input({ kind: "app: 2 ページ", source: APP, page: "order_master" }),
    );
    expect(one.readback?.explain).toBeDefined();
    // 助言も同じ画面だけになる。
    expect(one.preferences?.advice.every((a) => a.page === "order_master")).toBe(true);
  });

  it("問いの表を渡されなければ「数えていません」（0 件とは違う）", () => {
    const sheet = buildCheckSheet({
      from: "order_master.yaml",
      kind: "crud",
      source: CRUD,
    });
    expect(sheet.questions).toBeUndefined();
    expect(sheet.omitted[0].why).toContain("数えていません");
  });

  it("定義の隣の印で黙らせた助言は、**消さずに持っておく**", () => {
    const silenced = `# advise-off: key-not-in-table # id は使わない案件
${CRUD}`;
    const sheet = buildCheckSheet(input({ source: silenced }));
    expect(sheet.preferences?.silenced?.silenced.map((one) => one.rule)).toContain(
      "key-not-in-table",
    );
    expect(sheet.preferences?.advice.map((one) => one.rule)).not.toContain(
      "key-not-in-table",
    );
  });

  it("次の1手は**欄ごとに相手が違う**（優先順位は決めない）", () => {
    const sheet = buildCheckSheet(input());
    const text = sheet.next.join("\n");
    expect(text).toContain("hatake advise --apply");
    expect(text).toContain("AI が決めて書いてはいけません");
    // 好みは落としても CI が赤くならない、と毎回書く。
    expect(text).toContain("CI は赤くなりません");
  });

  it("言うことが無ければ、そう言う", () => {
    const clean = `page:
  type: detail
  id: order_detail
  title: 受注詳細
  repository: orderRepository
  key: id
  form:
    sections:
      - fields:
          - { field: code, label: コード }
`;
    const sheet = buildCheckSheet({
      from: "x.yaml",
      kind: "detail",
      source: clean,
      questions: TABLE,
      drop: { questions: "この試験では見ません。" },
    });
    expect(sheet.facts.warnings).toEqual([]);
    expect(sheet.preferences?.advice).toEqual([]);
    expect(sheet.next.join("")).toContain("道具から言うことはありません");
  });

  it("**言えないことは JSON で読む側にも届く**（紙に持たせる）", () => {
    const sheet = buildCheckSheet(input());
    expect(sheet.note).toBe(CHECK_NOTE);
    expect(checkLines(sheet).join("\n")).toContain(CHECK_NOTE);
    // 人に渡す1枚は design の担当、と線を書いておく。
    expect(sheet.note).toContain("hatake design");
  });
});

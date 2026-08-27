import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  diffDefinitions,
  explainSource,
  findWarnings,
  parsePageYaml,
} from "../src/index.js";

/// 押す前に**行の状態で出し分ける**（`action.enabledWhen`）。
///
/// 定義に増えたキーは1つだけだが、道具の側で言うことは4つある。**読める**（解析）・
/// **効かない所を言う**（警告）・**いつ押せるのかを読み返す**（説明）・**変わったら言う**
/// （差分）。ここはその4つを1枚で押さえる。
type Dict = Record<string, unknown>;

const SEARCH = (extra: string, rowActions = ""): string => `
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    rowActions: [${rowActions}]
    columns:
      - { field: orderNo, label: 受注番号 }
      - { field: status, label: 状態 }
  actions:
${extra}`;

/** 行アクションとして宣言した形（そこで判定できる）。 */
const asRowAction = (extra: string): string => SEARCH(extra, "openEntry");

const ROW_ACTION = `    - id: openEntry
      type: navigate
      label: 明細編集
      page: order_entry
      enabledWhen: { field: status, operator: notEquals, value: 出荷済 }
`;

const rules = (yaml: string): string[] =>
  findWarnings(parseYaml(yaml) as Dict).map((one) => one.rule);

describe("解析（書いたものが残る）", () => {
  it("行アクションの条件が、そのまま読める（strict でも通る）", () => {
    const page = parsePageYaml(asRowAction(ROW_ACTION), { strict: true });
    expect(page.actions[0].enabledWhen).toEqual({
      field: "status",
      operator: "notEquals",
      value: "出荷済",
    });
  });

  it("書かなければ undefined（既定は「いつでも押せる」）", () => {
    const page = parsePageYaml(
      SEARCH(`    - { id: csv, type: export, label: CSV出力 }\n`),
      { strict: true },
    );
    expect(page.actions[0].enabledWhen).toBeUndefined();
  });
});

describe("効かない所に書いたら言う", () => {
  it("行アクション（その行で判定できる）なら黙る", () => {
    expect(rules(asRowAction(ROW_ACTION))).toEqual([]);
  });

  it("選んだ行に対してなら黙る（全部満たすときだけ押せる）", () => {
    expect(
      rules(
        SEARCH(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 一括承認
      scope: selection
      confirm: { message: "{count} 件を承認します" }
      onError: { message: "{failed} 件が承認できませんでした" }
      enabledWhen: { field: status, operator: notEquals, value: 出荷済 }
`),
      ),
    ).toEqual([]);
  });

  it("一覧の上のボタンには判定する相手が無い（書いても効かない）", () => {
    const found = findWarnings(
      parseYaml(
        SEARCH(`    - id: csv
      type: export
      label: CSV出力
      enabledWhen: { field: status, operator: equals, value: 未出荷 }
`),
      ) as Dict,
    );
    expect(found.map((one) => one.rule)).toEqual(["enabledwhen-without-record"]);
    expect(found[0].path).toBe("page.actions[0].enabledWhen");
    expect(found[0].message).toContain("いま開いているレコード");
    // ボタンは出て押せる＝黙って効かないことを、そう言う。
    expect(found[0].message).toContain("押せます");
    expect(found[0].fix).toContain("table.rowActions");
    expect(found[0].fix).toContain("scope: selection");
  });

  it("レコードを持つ画面（form / detail / wizard）のボタンなら黙る", () => {
    expect(
      rules(`
page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - { field: status, label: 状態 }
  actions:
    - id: send
      type: plugin
      plugin: sendOrder
      label: 送信
      enabledWhen: { field: status, operator: equals, value: 未出荷 }
`),
    ).toEqual([]);
  });
});

describe("読み返し（いつ押せるのか）", () => {
  it("押せる条件を画面の言葉で言う", () => {
    const document = explainSource(asRowAction(ROW_ACTION));
    const actions = document.sections.find((one) => one.title === "できる操作");
    expect(actions?.lines.join("\n")).toContain(
      "押せるのは 状態 が 出荷済 でないとき だけ",
    );
  });

  it("一括は「選んだ行が全部」と言う（1件でも合わなければ押せない）", () => {
    const document = explainSource(
      SEARCH(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 一括承認
      scope: selection
      enabledWhen: { field: status, operator: notEquals, value: 出荷済 }
`),
    );
    const actions = document.sections.find((one) => one.title === "できる操作");
    expect(actions?.lines.join("\n")).toContain("押せるのは、選んだ行が全部");
  });
});

describe("差分（押せる状態が変わったら言う）", () => {
  const before = asRowAction(`    - id: openEntry
      type: navigate
      label: 明細編集
      page: order_entry
`);
  const diff = (from: string, to: string) =>
    diffDefinitions(parseYaml(from) as Dict, parseYaml(to) as Dict).changes;

  it("条件が付いたら「押せない場面が増える」と言う", () => {
    const changes = diff(before, asRowAction(ROW_ACTION));
    const one = changes.find((each) => each.kind === "enabledwhen-changed");
    expect(one?.impact).toBe("caution");
    expect(one?.message).toContain("押せる条件」が付きました");
    expect(one?.message).toContain("灰色");
  });

  it("条件が外れたら「いつでも押せるようになる」と言う", () => {
    const changes = diff(asRowAction(ROW_ACTION), before);
    const one = changes.find((each) => each.kind === "enabledwhen-changed");
    expect(one?.message).toContain("外れました");
  });

  it("同じ条件なら何も言わない", () => {
    expect(
      diff(asRowAction(ROW_ACTION), asRowAction(ROW_ACTION)).map(
        (each) => each.kind,
      ),
    ).not.toContain("enabledwhen-changed");
  });
});

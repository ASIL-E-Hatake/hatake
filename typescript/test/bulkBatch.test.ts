import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  explainSource,
  findWarnings,
  parsePageYaml,
  placeholdersWhere,
} from "../src/index.js";

/// 一括を**区切って実行する**（`action.batchSize`）。
///
/// 進み具合と中断は、**枠組みが回す側になったときだけ**できる機能（1回で全部渡すと、
/// 途中の状態は枠組みには分からない）。定義に増えたキーは1つで、道具の側で言うのは
/// 3つ: **区切りが効かない所を言う**・**いつ止められるのかを読み返す**・**送っていない
/// 件数を文言に差し込める**（`{skipped}`）。
type Dict = Record<string, unknown>;

const page = (extra: string): string => `
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    columns: [{ field: orderNo, label: 受注番号 }]
  actions:
${extra}`;

const BULK = (extra = ""): string =>
  page(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 一括承認
      scope: selection
      batchSize: 20
${extra}`);

const warnings = (yaml: string) => findWarnings(parseYaml(yaml) as Dict);
const rules = (yaml: string): string[] =>
  warnings(yaml).map((one) => one.rule);

describe("解析", () => {
  it("区切りの件数が、そのまま読める（strict でも通る）", () => {
    const parsed = parsePageYaml(BULK(), { strict: true });
    expect(parsed.actions[0].batchSize).toBe(20);
  });

  it("書かなければ undefined（既定は1回で全部渡す）", () => {
    const parsed = parsePageYaml(
      page(`    - { id: approve, type: plugin, plugin: approveOrders, label: 承認, scope: selection }\n`),
      { strict: true },
    );
    expect(parsed.actions[0].batchSize).toBeUndefined();
  });
});

describe("効かない所に書いたら言う", () => {
  it("一括のボタンなら黙る", () => {
    expect(rules(BULK())).toEqual([]);
  });

  it("1件ずつのボタンに書いても、区切るものが無い", () => {
    const found = warnings(
      page(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 承認
      batchSize: 20
`),
    );
    expect(found.map((one) => one.rule)).toEqual(["batchsize-without-selection"]);
    expect(found[0].path).toBe("page.actions[0].batchSize");
    expect(found[0].fix).toContain("scope: selection");
  });

  it("上限以上の区切りは1回で終わる＝進み具合も中断も出ない", () => {
    const found = warnings(
      page(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 一括承認
      scope: selection
      maxRows: 20
      batchSize: 20
`),
    );
    expect(found.map((one) => one.rule)).toEqual(["batchsize-above-maxrows"]);
    expect(found[0].message).toContain("進み具合も中断も出ません");
    // 直し方は数で言う（「小さくしてください」だけでは決められない）。
    expect(found[0].fix).toContain("10 件");
  });

  it("役割ごとの上限でも、既定の上限で見る", () => {
    expect(
      rules(
        page(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 一括承認
      scope: selection
      maxRows: { default: 40, byRole: { admin: all } }
      batchSize: 20
`),
      ),
    ).toEqual([]);
  });
});

describe("読み返し（いつ止められるのか）", () => {
  it("区切って実行することを言う", () => {
    const actions = explainSource(BULK()).sections.find(
      (one) => one.title === "できる操作",
    );
    expect(actions?.lines.join("\n")).toContain(
      "20 件ずつ実行する（進み具合が出て、区切りで止められる）",
    );
  });

  it("1回で渡すなら言わない（そこには進み具合が無い）", () => {
    const actions = explainSource(
      page(`    - { id: approve, type: plugin, plugin: approveOrders, label: 承認, scope: selection }\n`),
    ).sections.find((one) => one.title === "できる操作");
    expect(actions?.lines.join("\n")).not.toContain("件ずつ実行する");
  });
});

describe("送っていない件数（{skipped}）", () => {
  it("差し込みの一覧に載っていて、印は「一括・走ったあと・失敗のとき」", () => {
    const bulk = placeholdersWhere((one) => one.bulkOnly);
    const failure = placeholdersWhere((one) => one.failureOnly);
    expect(bulk).toContain("{skipped}");
    expect(failure).toContain("{skipped}");
  });

  it("失敗の文言に書けば黙る", () => {
    expect(
      rules(
        BULK(`      onError: { message: "{count} 件を承認（{skipped} 件は実行していません）" }`),
      ),
    ).toEqual([]);
  });

  it("成功の文言に書いたら言う（成功に「実行していない分」は無い）", () => {
    const found = warnings(
      BULK(`      onSuccess: { message: "{skipped} 件を残しました" }`),
    );
    expect(found.map((one) => one.rule)).toEqual(["placeholder-not-filled"]);
    expect(found[0].message).toContain("{skipped}");
  });

  it("押す前の文言に書いたら言う（まだ1件も送っていない）", () => {
    const found = warnings(
      BULK(`      confirm: { message: "{skipped} 件を実行します" }`),
    );
    expect(found.map((one) => one.rule)).toEqual(["placeholder-not-filled"]);
  });

  it("1件ずつのボタンの文言に書いたら言う（区切りが無い）", () => {
    const found = warnings(
      page(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 承認
      onError: { message: "{skipped} 件は実行していません" }
`),
    );
    expect(found.map((one) => one.rule)).toEqual(["placeholder-not-filled"]);
  });
});

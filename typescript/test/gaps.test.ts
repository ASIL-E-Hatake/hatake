import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  collectRefs,
  findWarnings,
  gapsLines,
  GAPS_NOTE,
  OUTSIDE_PAGE,
  RefKinds,
  RUNTIME_KINDS,
  wiringGaps,
} from "../src/internal.js";

/**
 * 繋がっていない所を1枚で（`hatake gaps`）。
 *
 * この紙は**新しい判断をしない**ので、守るのは「警告と同じ物差しで数えている」ことと
 * 「言えないことを言わない」こと（渡されていない種類について断定しない）。
 */
const APP = `app:
  id: sales
  title: 販売
  menu:
    - { id: m1, label: 受注, page: order_search }
    - { id: m2, label: 顧客, page: customer_master }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      table:
        columns:
          - { field: orderNo, label: 受注番号 }
          - { field: amount, label: 金額, format: yen }
      actions:
        - { id: approve, type: plugin, plugin: approveOrder, label: 承認 }
        - { id: csv, type: export, label: CSV }
    - type: master
      id: customer_master
      title: 顧客
      repository: customerRepository
      key: id
      table:
        columns:
          - { field: code, label: コード }
      form:
        sections:
          - fields:
              - { field: code, label: コード, required: true }
      actions:
        - { id: sync, type: plugin, plugin: syncCustomer, label: 同期 }
`;

const doc = (yaml: string): Record<string, unknown> =>
  parseYaml(yaml) as Record<string, unknown>;

describe("繋がっていない所を1枚で", () => {
  const document = doc(APP);

  it("押す所ごとに1行（どの画面の・どのボタンが空振りするか）", () => {
    const report = wiringGaps([document], {
      repositories: ["orderRepository", "customerRepository"],
      plugins: ["approveOrder"],
    });
    const rows = report.groups.flatMap((one) => one.rows);
    const sync = rows.find((one) => one.name === "syncCustomer");
    expect(sync?.page).toBe("customer_master");
    expect(sync?.spot).toBe("sync");
    expect(rows.map((one) => one.name)).not.toContain("approveOrder");
    // 直す側の数（登録1件）と、空振りする所の数は別に数える。
    expect(report.names).toBe(1);
    expect(report.spots).toBe(1);
  });

  it("画面ごとの残りを出す（開発中に1回で見渡すため）", () => {
    const report = wiringGaps([document], {
      repositories: [],
      plugins: [],
      formatters: [],
    });
    const pages = Object.fromEntries(
      report.byPage.map((one) => [one.page, one.spots]),
    );
    // 受注照会: repository・プラグイン・金額の見せ方 の3か所。
    expect(pages.order_search).toBe(3);
    expect(pages.customer_master).toBe(2);
    expect(report.spots).toBe(5);
  });

  it("**警告と同じ物差し**で数える（種類の呼び方と規則名は既にある表から）", () => {
    const registry = { repositories: [], plugins: [] };
    const report = wiringGaps([document], registry);
    const warned = findWarnings(document, { registry }).filter((one) =>
      ["unknown-repository", "unknown-plugin"].includes(one.rule),
    );
    // 警告は同じ名前を1件にまとめるので、突き合わせるのは**名前の数**。
    expect(report.names).toBe(warned.length);
    expect(report.groups.map((one) => one.rule)).toEqual([
      "unknown-repository",
      "unknown-plugin",
    ]);
    expect(report.groups[1].happens).toContain("押しても");
  });

  it("**渡されていない種類は「見なかった」**（登録していないと断定しない）", () => {
    const report = wiringGaps([document], { repositories: [] });
    expect(report.groups.map((one) => one.kind)).toEqual([RefKinds.repositories]);
    const skipped = report.notChecked.map((one) => one.kind);
    expect(skipped).toContain(RefKinds.plugins);
    expect(skipped).toContain(RefKinds.sinks);
    expect(report.notChecked[0].why).toContain("書き忘れた");
  });

  it("要求していない種類は「見なかった」にも並べない（在りもしない心配をさせない）", () => {
    const report = wiringGaps([document], { repositories: [] });
    // この定義はグラフもカードも使っていない。
    expect(report.notChecked.map((one) => one.kind)).not.toContain(
      RefKinds.chartKinds,
    );
  });

  it("**申告なら、出ていない種類を「1つも登録していない」と読む**", () => {
    const report = wiringGaps([document], { repositories: ["orderRepository"] }, {
      fromApp: true,
    });
    const kinds = report.groups.map((one) => one.kind);
    // 申告に出ていない＝プラグインも出す口も1つも登録していない。
    expect(kinds).toContain(RefKinds.plugins);
    expect(kinds).toContain(RefKinds.sinks);
    expect(kinds).toContain(RefKinds.repositories);
    // 申告できない種類（画面の外で決まるもの）は、申告でも「見なかった」。
    expect(report.notChecked.map((one) => one.kind)).not.toContain(
      RefKinds.plugins,
    );
    expect(report.fromApp).toBe(true);
  });

  it("申告できる種類は spec（runtimeKinds）と一致する", () => {
    const fixture = JSON.parse(
      readFileSync("../spec/conformance/registry_snapshot.json", "utf8"),
    ) as { runtimeKinds: string[] };
    expect([...RUNTIME_KINDS].sort()).toEqual([...fixture.runtimeKinds].sort());
  });

  it("画面に紐づかない所は、画面の外として数える（役割の語彙）", () => {
    const withRole = doc(
      APP.replace(
        "          - { field: code, label: コード }",
        "          - { field: code, label: コード, roles: [manager] }",
      ),
    );
    const report = wiringGaps([withRole], { roles: ["staff"] });
    const rows = report.groups.flatMap((one) => one.rows);
    expect(rows.map((one) => one.name)).toContain("manager");
    // 役割は登録ではなく**配る**もの（言い方も警告と同じ表から）。
    expect(report.groups[0].rule).toBe("role-not-in-app");
    expect(report.byPage.map((one) => one.page)).toContain(OUTSIDE_PAGE);
  });

  it("読んだ定義の数を必ず出す（1枚だけ渡して読み違えないため）", () => {
    const report = wiringGaps([document, document], { plugins: [] });
    expect(report.scanned).toBe(2);
    expect(gapsLines(report).join("\n")).toContain("定義 2 枚");
  });

  it("残りが無ければ、そう言う（言えないことは毎回書く）", () => {
    const report = wiringGaps([document], {
      repositories: ["orderRepository", "customerRepository"],
      plugins: ["approveOrder", "syncCustomer"],
    });
    const text = gapsLines(report).join("\n");
    expect(text).toContain("繋がっていない所はありませんでした");
    expect(text).toContain(GAPS_NOTE);
  });

  it("参照は「どの画面の・どの所か」を構造で持つ（道の文字を読み解かせない）", () => {
    const refs = collectRefs(document);
    const plugin = refs.find((one) => one.name === "approveOrder");
    expect(plugin?.page).toBe("order_search");
    expect(plugin?.spot).toBe("approve");
    const format = refs.find((one) => one.name === "yen");
    expect(format?.spot).toBe("amount");
  });

  it("1枚の定義（app ではない）でも画面 id が付く", () => {
    const page = doc(`page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  table:
    columns:
      - { field: orderNo, label: 受注番号 }
`);
    const report = wiringGaps([page], { repositories: [] });
    expect(report.byPage).toEqual([{ page: "order_search", spots: 1 }]);
  });
});

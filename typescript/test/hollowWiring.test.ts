import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  collectRefs,
  filledReport,
  hasUnfilled,
  inState,
  looksHollow,
  looksUnfilled,
  NULL_IS_AN_ANSWER,
  renderFilled,
  scanRegistrations,
} from "../src/internal.js";

/**
 * 配線の数え方が嘘をつかないこと（`refs --filled`）。
 *
 * 守るのは2つ。**目印を消しても数が良くならない**（空実装は「埋まっている」に数え
 * ない）ことと、**3言語の「まだ書いていない」を知っている**こと（TypeScript の配線を
 * 渡して黙って「全部埋まっている」と出るのが、この道具で一番まずい嘘）。
 */
const APP = `
app:
  id: sales
  title: 販売管理
  menu:
    - { id: orders, label: 受注, page: order_search }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      key: orderNo
      table:
        columns:
          - { field: orderNo, label: 受注番号 }
      actions:
        - { id: approve, type: plugin, plugin: approveOrders, label: 承認 }
`;

const refs = () => collectRefs(parseYaml(APP) as Record<string, unknown>);

const reportOf = (path: string, source: string) =>
  filledReport(refs(), scanRegistrations([{ path, source }]), 1);

describe("中身が無い登録", () => {
  it("**空の本体は「埋まっている」に数えない**（目印を消しても数は良くならない）", () => {
    const hollow = `
      HatakeScope(
        repositories: RepositoryRegistry({'orderRepository': OrderRepo()}),
        actions: ActionRegistry({'approveOrders': (ctx) async {}}),
        child: const SizedBox(),
      );
    `;
    const report = reportOf("lib/wiring.dart", hollow);
    expect(inState(report, "hollow").map((one) => one.name)).toEqual([
      "approveOrders",
    ]);
    expect(inState(report, "filled").map((one) => one.name)).toEqual([
      "orderRepository",
    ]);
    // TODO のままとは混ぜない（落ちるか落ちないかが違う）。
    expect(inState(report, "pending")).toEqual([]);
  });

  it("落とす旗では落とす（落とさないと、目印を消して緑にできる）", () => {
    const report = reportOf(
      "lib/wiring.dart",
      `
      HatakeScope(
        repositories: RepositoryRegistry({'orderRepository': OrderRepo()}),
        actions: ActionRegistry({'approveOrders': (ctx) async => null}),
        child: const SizedBox(),
      );
    `,
    );
    expect(inState(report, "hollow")).toHaveLength(1);
    expect(hasUnfilled(report)).toBe(true);
    const text = renderFilled(report);
    expect(text).toContain("中身が無い");
    expect(text).toContain("落ちないので気づけません");
    // **間違いとは言わない**（何もしないのが正しい登録もある）。
    expect(text).toContain("何もしないのが正しいなら");
  });

  it("**検証の null は答え**なので、空実装と言わない", () => {
    expect(NULL_IS_AN_ANSWER).toEqual(["validators"]);
    // 検証は「null を返せば OK」が契約＝何もしない実装と字が同じ。
    expect(looksHollow("(value, definition) => null", true)).toBe(false);
    // ほかの種類では、null を返すのは何もしていない。
    expect(looksHollow("(ctx) async => null")).toBe(true);
    // 本体が空なのは、契約に関わらず空。
    expect(looksHollow("(value, definition) {}", true)).toBe(true);
  });

  it("式が書いてあれば見ない（中身が正しいかは、そもそも言えない）", () => {
    expect(looksHollow("(ctx) async => api.approve(ctx.records)")).toBe(false);
    expect(looksHollow("(rows, field) => rows.length")).toBe(false);
    // 目印が残っているものは「TODO のまま」の担当（二重に数えない）。
    expect(looksHollow("(ctx) async => throw UnimplementedError('x')")).toBe(false);
  });
});

describe("3言語の「まだ書いていない」", () => {
  it("TypeScript の定番を知っている（知らないと黙って「埋まっている」と出る）", () => {
    expect(looksUnfilled('throw new Error("TODO: 承認する")')).toBe(true);
    expect(looksUnfilled("throw new Error('not implemented')")).toBe(true);
    // **投げていて、かつ TODO と言っている**ときだけ（業務の文言は拾わない）。
    expect(looksUnfilled('ctx.show("TODO の件数を出す")')).toBe(false);
    expect(looksUnfilled("throw new Error(message)")).toBe(false);
  });

  it("Dart / Java の定番も知っている", () => {
    expect(looksUnfilled("(ctx) async => throw UnimplementedError('x')")).toBe(true);
    expect(looksUnfilled('() -> { throw new UnsupportedOperationException(); }')).toBe(
      true,
    );
    expect(looksUnfilled('() -> { throw new RuntimeException("未実装"); }')).toBe(true);
  });

  it("TypeScript の配線を渡しても、TODO のままを数える", () => {
    const wiring = `
      const scope = {
        repositories: new RepositoryRegistry({ 'orderRepository': repo }),
        actions: new ActionRegistry({
          'approveOrders': async (ctx) => { throw new Error("TODO: 承認する"); },
        }),
      };
    `;
    const report = reportOf("src/wiring.ts", wiring);
    expect(inState(report, "pending").map((one) => one.name)).toEqual([
      "approveOrders",
    ]);
    expect(inState(report, "filled").map((one) => one.name)).toEqual([
      "orderRepository",
    ]);
  });

  it("Java の配線でも、空実装と TODO を見分ける", () => {
    const wiring = `
      var actions = new ActionRegistry(Map.of(
        "approveOrders", ctx -> { throw new UnsupportedOperationException(); }
      ));
      var repositories = new RepositoryRegistry(Map.of("orderRepository", repo));
    `;
    const report = reportOf("src/Wiring.java", wiring);
    expect(inState(report, "pending").map((one) => one.name)).toEqual([
      "approveOrders",
    ]);
    const hollowJava = wiring.replace(
      "ctx -> { throw new UnsupportedOperationException(); }",
      "ctx -> { return null; }",
    );
    const after = reportOf("src/Wiring.java", hollowJava);
    expect(inState(after, "hollow").map((one) => one.name)).toEqual(["approveOrders"]);
    expect(inState(after, "filled").map((one) => one.name)).toEqual([
      "orderRepository",
    ]);
  });
});

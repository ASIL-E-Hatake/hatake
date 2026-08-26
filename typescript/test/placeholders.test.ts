import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  findWarnings,
  type PlaceholderContext,
  PLACEHOLDER_CONTEXTS,
  renderPlaceholders,
} from "../src/index.js";

/// 文言に書ける差し込みの一覧（`spec/placeholders.json` が正）。
///
/// ここで守るのは2つ。**転記がズレていないこと**（埋める側の Dart も同じ1枚を読む）と、
/// **一覧と検査が同じ印を見ていること**（差し込みが1つ増えたときに「一覧には載っている
/// のに検査が知らない」を作らない）。
const spec = JSON.parse(
  readFileSync("../spec/placeholders.json", "utf8"),
) as { contexts: PlaceholderContext[] };

const warningsOf = (source: string) =>
  findWarnings(parseYaml(source) as Record<string, unknown>);

/** 一括のボタン1つを持つ照会画面。 */
const page = (action: string) => `page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  search:
    filters: [{ field: orderNo, label: 受注番号 }]
  table:
    columns: [{ field: orderNo, label: 受注番号, sortable: true }]
  actions:
${action}
`;

describe("差し込みの一覧", () => {
  it("spec/placeholders.json と一致する（転記のズレを許さない）", () => {
    expect(PLACEHOLDER_CONTEXTS).toEqual(spec.contexts);
  });

  it("印が3つ揃っている（規則はここから作るので、欠けると検査が緩む）", () => {
    for (const context of PLACEHOLDER_CONTEXTS) {
      for (const one of context.placeholders) {
        expect(typeof one.bulkOnly, one.name).toBe("boolean");
        expect(typeof one.afterRun, one.name).toBe("boolean");
        expect(typeof one.failureOnly, one.name).toBe("boolean");
        expect(one.means.length, one.name).toBeGreaterThan(0);
      }
    }
  });

  it("人が読む形には「いつ埋まるか」が出る", () => {
    const text = renderPlaceholders(PLACEHOLDER_CONTEXTS);
    expect(text).toContain("{failedKeys}");
    expect(text).toContain("埋まるのは");
    // 閉じた集合だと毎回言う（開いていると思うのが間違いの元）。
    expect(text).toContain("ここに無いものは埋まりません");
    // 開いた形が1つだけあることも言う。
    expect(text).toContain("遷移のパラメータ");
  });
});

describe("差し込みの検査は一覧から作る", () => {
  it("{failedKeys} は一括のボタンでだけ埋まる", () => {
    const found = warningsOf(
      page(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 承認
      onError: { message: '{failed} 件が失敗（{failedKeys}）' }`),
    );
    const one = found.find((x) => x.rule === "placeholder-not-filled");
    expect(one?.message).toContain("{failedKeys}");
    expect(one?.message).toContain("scope: selection");
  });

  it("成功の文言に {failedKeys} を書いても埋まらない（成功に失敗した行は無い）", () => {
    const found = warningsOf(
      page(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 一括承認
      scope: selection
      onSuccess: { message: '{count} 件を承認しました（{failedKeys}）' }`),
    );
    const one = found.find((x) => x.rule === "placeholder-not-filled");
    expect(one?.path).toBe("page.actions[0].onSuccess.message");
    expect(one?.message).toContain("{failedKeys}");
  });

  it("押す前の文言に {failedKeys} を書いても埋まらない（まだ1件も失敗していない）", () => {
    const found = warningsOf(
      page(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 一括承認
      scope: selection
      confirm: { message: '{count} 件を承認します（{failedKeys}）' }`),
    );
    const one = found.find((x) => x.rule === "placeholder-not-filled");
    expect(one?.path).toBe("page.actions[0].confirm.message");
    expect(one?.message).toContain("{failedKeys}");
  });

  it("一括の失敗の文言に書いてあれば、何も言わない（そこが埋まる場所）", () => {
    const found = warningsOf(
      page(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 一括承認
      scope: selection
      onError: { message: '{failed} 件を承認できませんでした（{failedKeys}）' }`),
    );
    expect(found.filter((x) => x.rule === "placeholder-not-filled")).toEqual([]);
  });
});

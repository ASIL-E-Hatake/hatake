import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bulkLimitOf, checkBulkLimit } from "../src/index.js";

/**
 * 1回で動かせる行数の上限の共有フィクスチャを、Dart 版・Java 版と同じ契約で回す。
 *
 * 画面（Flutter）が止めても API を直接叩けば通るので、**守る側が同じ数を出す**ことが
 * この機能の値打ち。だから3版で同じ答えになることを機械で縛る。
 */
const fixture = JSON.parse(
  readFileSync("../spec/conformance/bulk_limits.json", "utf8"),
) as {
  document: Record<string, unknown>;
  cases: { name: string; actionId: string; roles: string[]; limit: number | null }[];
};

describe("conformance: bulk limits", () => {
  for (const one of fixture.cases) {
    it(one.name, () => {
      const found = bulkLimitOf(fixture.document, one.actionId, one.roles);
      expect(found ?? null).toBe(one.limit);
    });
  }

  it("上限を超えて届いたら件数まで言う（API を直接叩かれたとき）", () => {
    const breach = checkBulkLimit(fixture.document, "everyone", 80);
    expect(breach).toMatchObject({ actionId: "everyone", limit: 20, count: 80 });
    expect(breach?.message).toBe("1回に実行できるのは 20 件までです（80 件届きました）");
  });

  it("ちょうど・上限なし・書いていないボタンは通す", () => {
    expect(checkBulkLimit(fixture.document, "everyone", 20)).toBeNull();
    expect(checkBulkLimit(fixture.document, "byRole", 500, ["admin"])).toBeNull();
    expect(checkBulkLimit(fixture.document, "noLimit", 9999)).toBeNull();
  });

  it("同じ id が複数のページに在れば、一番厳しい上限を採る（守る側なので）", () => {
    // 画面が分かっているなら pageId で1つに決まる。分からないときに緩い方へ倒すと、
    // 画面で押せない操作が API で通ってしまう。
    const app = {
      app: {
        id: "sales",
        title: "販売",
        pages: [
          {
            type: "search",
            id: "a",
            title: "A",
            repository: "r",
            table: { columns: [{ field: "x", label: "X" }] },
            actions: [
              { id: "approve", type: "plugin", plugin: "p", label: "承認",
                scope: "selection", maxRows: 50 },
            ],
          },
          {
            type: "search",
            id: "b",
            title: "B",
            repository: "r",
            table: { columns: [{ field: "x", label: "X" }] },
            actions: [
              { id: "approve", type: "plugin", plugin: "p", label: "承認",
                scope: "selection", maxRows: 10 },
            ],
          },
        ],
      },
    };
    expect(bulkLimitOf(app, "approve")).toBe(10);
    expect(bulkLimitOf(app, "approve", [], "a")).toBe(50);
    expect(bulkLimitOf(app, "approve", [], "b")).toBe(10);
  });
});

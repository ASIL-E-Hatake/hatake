import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pagerView } from "../src/internal.js";

/**
 * 一覧の下の件数とページ送りの共有フィクスチャを、Dart 版と同じ契約で回す。
 *
 * `enabled: false` を読まない Renderer が1つでも在ると、同じ定義で Flutter では
 * 「出しきれていない」と言うのにブラウザでは黙る（か、その逆）が起きる。
 */
const fixture = JSON.parse(
  readFileSync("../spec/conformance/pagination.json", "utf8"),
) as {
  cases: {
    name: string;
    enabled: boolean;
    totalCount: number;
    shown: number;
    expected: { paged: boolean; text: string };
  }[];
};

describe("conformance: pagination", () => {
  for (const one of fixture.cases) {
    it(one.name, () => {
      expect(pagerView({ enabled: one.enabled }, one.totalCount, one.shown)).toEqual(
        one.expected,
      );
    });
  }
});

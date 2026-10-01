import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bulkRemainingText } from "../src/internal.js";

/**
 * 区切って実行している一括の残り時間（Dart 版と同じ契約）。
 *
 * 0.9.24 まではブラウザ版に残り時間が無く、Flutter だけが「あと N 分くらい」と言っていた。
 * 同じ定義で同じ一括を押して、言い方が Renderer で違うと「どっちが正しいのか」になる。
 */
const fixture = JSON.parse(
  readFileSync("../spec/conformance/bulk_progress.json", "utf8"),
) as {
  cases: { name: string; done: number; total: number; seconds: number; expected: string | null }[];
};

describe("conformance: bulk progress", () => {
  for (const one of fixture.cases) {
    it(one.name, () => {
      expect(bulkRemainingText(one.done, one.total, one.seconds)).toBe(one.expected);
    });
  }
});

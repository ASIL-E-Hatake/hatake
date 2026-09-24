import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { expandVocabularies } from "../src/vocabularies.js";

/**
 * `app.vocabularies` の展開が **3版で同じ**であること
 * （spec/conformance/vocabularies.json）。
 *
 * 展開は読み込み時なので、ここが揃っていれば下流（画面・CSV・紙）も揃う。
 * 揃っていないと、同じ定義から Flutter の画面と Java のサーバで**違う字**が出る。
 */
const cases = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "..", "..", "spec", "conformance", "vocabularies.json"),
    "utf8",
  ),
).cases as any[];

describe("conformance: vocabularies", () => {
  for (const c of cases) {
    it(c.name, () => {
      const out = expandVocabularies(c.document) as any;
      const column = out.app.pages[0].table.columns.find(
        (one: any) => one.field === c.column,
      );
      expect(column.options ?? []).toEqual(c.expected);
    });
  }
});

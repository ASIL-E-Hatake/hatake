import { describe, expect, it } from "vitest";

import { expandVocabularies, vocabulariesOf } from "../src/vocabularies.js";
import { findVocabularyProblems } from "../src/vocabularyChecks.js";

const VOC = [
  {
    name: "orderStatus",
    options: [
      { value: "draft", label: "作成中" },
      { value: "shipped", label: "出荷済" },
    ],
  },
];

const app = (page: unknown, vocabularies: unknown[] = VOC) => ({
  app: { id: "orders", title: "受注", vocabularies, pages: [page] },
});

describe("語彙の展開", () => {
  it("列の optionsOf が、実体の並びに置き換わる", () => {
    const out = expandVocabularies(
      app({ table: { columns: [{ field: "status", optionsOf: "orderStatus" }] } }),
    ) as any;
    const column = out.app.pages[0].table.columns[0];
    expect(column.options).toEqual(VOC[0].options);
    // 名前は残す（どこから来たのかが読めなくなると、直す所が分からない）。
    expect(column.optionsOf).toBe("orderStatus");
  });

  it("入力項目と検索条件でも同じように置き換わる", () => {
    const out = expandVocabularies(
      app({
        form: { sections: [{ fields: [{ field: "status", optionsOf: "orderStatus" }] }] },
        search: { filters: [{ field: "status", optionsOf: "orderStatus" }] },
      }),
    ) as any;
    expect(out.app.pages[0].form.sections[0].fields[0].options).toHaveLength(2);
    expect(out.app.pages[0].search.filters[0].options).toHaveLength(2);
  });

  it("その場に書いた options が勝つ（両方書いてあるとき）", () => {
    const out = expandVocabularies(
      app({
        table: {
          columns: [
            {
              field: "status",
              optionsOf: "orderStatus",
              options: [{ value: "draft", label: "下書き" }],
            },
          ],
        },
      }),
    ) as any;
    expect(out.app.pages[0].table.columns[0].options).toEqual([
      { value: "draft", label: "下書き" },
    ]);
  });

  it("引けない名前は、空の並びを置かずにそのまま残す", () => {
    // 空を置くと「書いたのに効かない」が検証にも出なくなる。
    const out = expandVocabularies(
      app({ table: { columns: [{ field: "status", optionsOf: "nope" }] } }),
    ) as any;
    expect(out.app.pages[0].table.columns[0].options).toBeUndefined();
  });

  it("元の定義は変えない", () => {
    const before = app({
      table: { columns: [{ field: "status", optionsOf: "orderStatus" }] },
    });
    expandVocabularies(before);
    expect((before as any).app.pages[0].table.columns[0].options).toBeUndefined();
  });

  it("同じ名前が2回あれば、先に書いたほうが残る", () => {
    const found = vocabulariesOf(
      app({}, [
        VOC[0],
        { name: "orderStatus", options: [{ value: "shipped", label: "発送済" }] },
      ]),
    );
    expect(found.get("orderStatus")).toEqual(VOC[0].options);
  });

  it("語彙が1つも無ければ、何も触らない", () => {
    const before = { app: { id: "a", title: "b", pages: [] } };
    expect(expandVocabularies(before)).toBe(before);
  });
});

describe("語彙の食い違い", () => {
  it("指した先が無ければ言う。近い名前があれば添える", () => {
    const found = findVocabularyProblems(
      app({ table: { columns: [{ field: "status", optionsOf: "orderStatas" }] } }),
    );
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("unknown-vocabulary");
    expect(found[0].near).toBe("orderStatus");
  });

  it("遠い名前は勧めない（関係の無い名前で迷わせない）", () => {
    const found = findVocabularyProblems(
      app({ table: { columns: [{ field: "status", optionsOf: "paymentTerms" }] } }),
    );
    expect(found[0].near).toBeUndefined();
    expect(found[0].known).toEqual(["orderStatus"]);
  });

  it("options と両方書いてあれば言う", () => {
    const found = findVocabularyProblems(
      app({
        table: {
          columns: [
            { field: "status", optionsOf: "orderStatus", options: [{ label: "x" }] },
          ],
        },
      }),
    );
    expect(found.map((one) => one.rule)).toEqual(["vocabulary-shadowed"]);
  });

  it("名前が重なっていれば言う", () => {
    const found = findVocabularyProblems(
      app({}, [VOC[0], { name: "orderStatus", options: [] }]),
    );
    expect(found.map((one) => one.rule)).toEqual(["duplicate-vocabulary"]);
  });

  it("語彙そのものの中は見ない（`options` は在って当たり前）", () => {
    expect(findVocabularyProblems(app({}))).toEqual([]);
  });
});

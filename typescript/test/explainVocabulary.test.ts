import { describe, expect, it } from "vitest";
import { stringify } from "yaml";

import { explainSource, parseAppSource } from "../src/explainSource.js";
import { restTargetsForPage } from "../src/restTarget.js";

/**
 * 語彙（`optionsOf`）で書いた画面と、同じ選択肢をその場に書いた画面は、
 * **説明も同じ**でなければならない。0.9.20 までは app の1枚を語彙を見ずに読み直して
 * いたので、語彙で書いた項目だけ「選べるのは…」が消えていた。
 */
const STATUS = [
  { value: "draft", label: "入力中" },
  { value: "fixed", label: "確定" },
];

const page = (withVocabulary: boolean) => {
  const choices = withVocabulary ? { optionsOf: "orderStatus" } : { options: STATUS };
  return {
    id: "order_search",
    type: "crud",
    title: "受注照会",
    repository: "orderRepository",
    search: {
      filters: [{ field: "status", label: "状態", type: "select", ...choices }],
    },
    table: {
      columns: [{ field: "status", label: "状態", type: "text", ...(withVocabulary ? { optionsOf: "orderStatus" } : {}) }],
    },
    form: {
      sections: [{ title: "基本", fields: [{ field: "status", label: "状態", type: "select", ...choices }] }],
    },
  };
};

const app = (withVocabulary: boolean) =>
  stringify({
    dsl_version: "1.0",
    app: {
      id: "orders",
      title: "受注",
      ...(withVocabulary ? { vocabularies: [{ name: "orderStatus", options: STATUS }] } : {}),
      pages: [page(withVocabulary)],
    },
  });

describe("語彙で書いた選択肢の説明", () => {
  it("1枚の説明（--page）に選択肢が出る", () => {
    const text = JSON.stringify(explainSource(app(true), { page: "order_search" }));
    expect(text).toContain("入力中");
    expect(text).toContain("確定");
  });

  it("その場に書いたものと説明が同じ", () => {
    // 列の `optionsOf` は、その場に書く口が無い（語彙でしか書けない）ので比べない側は外す。
    const inline = explainSource(app(false), { page: "order_search" });
    const viaVocabulary = explainSource(app(true), { page: "order_search" });
    const filters = (doc: unknown) =>
      JSON.stringify(doc).match(/選べるのは[^"]*/g);
    expect(filters(viaVocabulary)).toEqual(filters(inline));
    expect(filters(inline)?.length ?? 0).toBeGreaterThan(0);
  });

  it("app を読んだ結果の画面にも選択肢が入っている（図・API の形・索引が使う）", () => {
    const parsed = parseAppSource(app(true));
    const search = parsed.pages[0];
    expect(search.search?.filters[0].options.map((one) => one.label)).toEqual(["入力中", "確定"]);
    expect(parsed.page.get("order_search")).toBe(search);
  });

  it("REST の検査（--page）も同じ画面を読む", () => {
    expect(() => restTargetsForPage(app(true), "order_search", { baseUrl: "/api" })).not.toThrow();
    expect(() => restTargetsForPage(app(true), "nope", { baseUrl: "/api" })).toThrow(/nope/);
  });
});

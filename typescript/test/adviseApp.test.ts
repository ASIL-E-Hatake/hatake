import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { findAdvice } from "../src/internal.js";

/** 画面をまたいで見る助言（1枚だけ読んでも分からないもの）。 */
const adviceOf = (yaml: string) =>
  findAdvice(parseYaml(yaml) as Record<string, unknown>);

const app = (pages: string, menu = "") => `
dsl_version: "1.0"
app:
  id: demo
  title: 見本
  home: list
  menu:
    - { id: list, label: 一覧, page: item_list }
${menu}
  pages:
${pages}
`;

const LIST = `    - type: search
      id: item_list
      title: 一覧
      repository: itemRepository
      key: itemCode
      search: { filters: [{ field: itemCode, label: コード }] }
      table:
        columns:
          - { field: itemCode, label: コード, sortable: true }
      actions:
        - { id: detail, type: navigate, label: 詳細, scope: row, page: item_detail, params: PARAMS }
`;

const DETAIL = `    - type: detail
      id: item_detail
      title: 詳細
      repository: itemRepository
      key: itemCode
      form:
        sections:
          - fields: [{ field: itemCode, label: コード }]
`;

describe("1件の画面へ行くのに、鍵を渡していない", () => {
  it("行き先の `key` の名前で渡していれば何も言わない", () => {
    const found = adviceOf(
      app(LIST.replace("PARAMS", "{ itemCode: $row.itemCode }") + DETAIL),
    );
    expect(found.map((one) => one.rule)).not.toContain("navigate-without-key-param");
  });

  it("`id` で渡していても言わない（`key` を省いた画面の既定）", () => {
    const found = adviceOf(app(LIST.replace("PARAMS", "{ id: $row.itemCode }") + DETAIL));
    expect(found.map((one) => one.rule)).not.toContain("navigate-without-key-param");
  });

  it("名前が違うと言う（URL は変わるのに、開いた画面が空になる）", () => {
    // 見本でこれを踏んだ。`itemCode` を `code` と書いただけで、押しても
    // **API を1本も投げない**まま「データがありません」になる。
    const found = adviceOf(app(LIST.replace("PARAMS", "{ code: $row.itemCode }") + DETAIL));
    const one = found.find((a) => a.rule === "navigate-without-key-param");
    expect(one?.says).toContain("鍵になる値を渡していません");
    expect(one?.says).toContain("`code`");
    // 直し方には**行き先が待っている名前**を出す。
    expect(one?.add).toContain("itemCode");
  });

  it("params そのものが無い詳細も言う", () => {
    const found = adviceOf(app(LIST.replace(", params: PARAMS", "") + DETAIL));
    const one = found.find((a) => a.rule === "navigate-without-key-param");
    expect(one?.says).toContain("`params` そのものがありません");
  });

  it("入力画面へ何も渡さないのは言わない（新規作成はそれが普通）", () => {
    const form = `    - type: form
      id: item_form
      title: 入力
      repository: itemRepository
      key: itemCode
      form:
        sections:
          - fields: [{ field: itemCode, label: コード, required: true }]
`;
    const list = LIST.replace(
      ", params: PARAMS",
      "",
    ).replace("page: item_detail", "page: item_form");
    expect(adviceOf(app(list + form)).map((one) => one.rule)).not.toContain(
      "navigate-without-key-param",
    );
  });
});

describe("詳細画面をメニューに直接置いている", () => {
  it("メニューには鍵を渡す場所が無いので言う", () => {
    const found = adviceOf(
      app(
        LIST.replace("PARAMS", "{ itemCode: $row.itemCode }") + DETAIL,
        "    - { id: detailMenu, label: 詳細, page: item_detail }",
      ),
    );
    const one = found.find((a) => a.rule === "detail-page-in-menu");
    expect(one?.says).toContain("必ず「データがありません」になります");
    expect(one?.add).toContain("$row.itemCode");
  });

  it("グループの中に隠していても見つける", () => {
    const found = adviceOf(
      app(
        LIST.replace("PARAMS", "{ itemCode: $row.itemCode }") + DETAIL,
        "    - group: 読むだけ\n      items:\n        - { id: detailMenu, label: 詳細, page: item_detail }",
      ),
    );
    expect(found.map((one) => one.rule)).toContain("detail-page-in-menu");
  });

  it("一覧をメニューに置くのは普通なので言わない", () => {
    const found = adviceOf(app(LIST.replace("PARAMS", "{ itemCode: $row.itemCode }") + DETAIL));
    expect(found.map((one) => one.rule)).not.toContain("detail-page-in-menu");
  });
});

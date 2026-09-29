import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseAppPagesYaml } from "../src/appParse.js";
import { UnknownKeysError } from "../src/parse.js";

/**
 * app 定義の画面を**中身まで**読む口。
 *
 * Java の `AppParser.parseAppPagesYaml` と**同じ並び・同じ答え**（あちらの
 * `parsesPagesInFullWhenTheBackendNeedsThem` と対になる試験）。Dart は
 * `AppDefinition.pages` が最初から画面の定義なので、この口は要らない側。
 *
 * TypeScript に無かったので、Web の Renderer を書く段で足りないと分かった。
 */
const source = readFileSync("../spec/examples/sales_app.yaml", "utf8");

describe("app の画面を中身まで読む", () => {
  it("並びは定義に書いた順のまま", () => {
    expect(Object.keys(parseAppPagesYaml(source))).toEqual([
      "sales_dashboard",
      "customer_master",
      "product_master",
      "order_search",
      "sales_report",
      "order_detail",
      "order_entry",
      "order_entry_paged",
    ]);
  });

  it("**`form` まで読める**（一覧だけの PageRef では検証も描画もできない）", () => {
    const pages = parseAppPagesYaml(source);
    const master = pages.customer_master;
    expect(master.kind).toBe("master");
    expect("form" in master && master.form.sections.length > 0).toBe(true);
  });

  it("語彙は展開されてから届く（`optionsOf` を Renderer が知らなくていい）", () => {
    const pages = parseAppPagesYaml(source);
    const everything = JSON.stringify(pages);
    expect(everything).not.toContain("optionsOf");
  });

  it("strict は**人が書いたもの**に当てる（機械が足した `options` を咎めない）", () => {
    // 展開後に当てていたら、語彙を使っている sales_app はここで落ちる。
    expect(() => parseAppPagesYaml(source, { strict: true })).not.toThrow();
  });

  it("知らないキーは strict で落ちる", () => {
    const broken = source.replace("  menu:", "  menuu:\n    - { id: x, label: x, page: y }\n  menu:");
    expect(() => parseAppPagesYaml(broken, { strict: true })).toThrow(UnknownKeysError);
  });
});

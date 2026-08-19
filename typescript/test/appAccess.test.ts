import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  appAccess,
  type Audience,
  canOpen,
  describeAudience,
  parseAppSource,
} from "../src/index.js";

/**
 * 定義の文字列から「誰が開けるか」を数える。
 *
 * 素の document だけで足りる（入口＝メニューとボタンは素のまま読める）。読める定義である
 * ことは [parseAppSource] で別に確かめる。
 */
const access = (source: string) => {
  parseAppSource(source); // strict で読めない定義は、そもそも権限の話にならない
  return appAccess(parseYaml(source) as Record<string, unknown>);
};

const who = (source: string, page: string): Audience =>
  access(source).audience.get(page)!;

/** メニュー2つ・遷移3つの小さなアプリ（権限の掛け違いを入れてある）。 */
const APP = readFileSync("../docs/diagrams/roles-app.yaml", "utf8");

const page = (id: string, extra = ""): string => `    - type: search
      id: ${id}
      title: ${id}
      repository: orderRepository
      key: code
      table:
        columns:
          - { field: code, label: コード }
${extra === "" ? "" : `${extra}
`}`;

const app = (menu: string, pages: string): string => `dsl_version: "1.0"
app:
  id: demo
  title: デモ
  menu:
${menu}
  pages:
${pages}`;

describe("誰がその画面を開けるか", () => {
  it("メニューに roles が無ければ誰でも開ける", () => {
    expect(who(APP, "order_search")).toEqual({ everyone: true, roles: [] });
  });

  // ページに roles は書けないので、入口から辿るしかない。
  it("グループの roles は中の画面にも掛かる", () => {
    expect(who(APP, "customer_master")).toEqual({
      everyone: false,
      roles: ["admin"],
    });
  });

  it("ボタンの roles は、その先の画面に掛かる", () => {
    // 受注照会は誰でも開けるが、明細編集のボタンは manager だけ。
    expect(who(APP, "order_entry")).toEqual({ everyone: false, roles: ["manager"] });
    // 詳細のボタンには roles が無いので、受注詳細は誰でも開ける。
    expect(who(APP, "order_detail")).toEqual({ everyone: true, roles: [] });
  });

  // ここが1枚ずつ読んでも出ない所。定義は通るし、画面を見ても気づけない。
  it("入口の権限が食い違うと、誰も開けない画面になる", () => {
    // admin だけの顧客マスタから、manager だけのボタンで繋いである。
    expect(who(APP, "price_master")).toEqual({ everyone: false, roles: [] });
    expect(describeAudience(who(APP, "price_master"))).toBe("誰も開けない");
  });

  it("入口が2つあれば、どちらから来てもよい", () => {
    const source = app(
      `    - { id: a, label: A, page: list_a, roles: [admin] }
    - { id: b, label: B, page: list_b, roles: [staff] }`,
      `${page("list_a", `      actions:
        - { id: go, type: navigate, label: 行く, page: shared }`)}${page(
        "list_b",
        `      actions:
        - { id: go, type: navigate, label: 行く, page: shared }`,
      )}${page("shared")}`,
    );
    expect(who(source, "shared")).toEqual({
      everyone: false,
      roles: ["admin", "staff"],
    });
  });

  it("遷移が輪になっていても止まる", () => {
    const source = app(
      `    - { id: a, label: A, page: list_a, roles: [admin] }`,
      `${page("list_a", `      actions:
        - { id: go, type: navigate, label: 行く, page: list_b }`)}${page(
        "list_b",
        `      actions:
        - { id: back, type: navigate, label: 戻る, page: list_a }`,
      )}`,
    );
    expect(who(source, "list_b")).toEqual({ everyone: false, roles: ["admin"] });
    expect(who(source, "list_a")).toEqual({ everyone: false, roles: ["admin"] });
  });

  it("メニューにも遷移先にも無い画面は、誰も開けない", () => {
    const source = app(
      `    - { id: a, label: A, page: list_a }`,
      `${page("list_a")}${page("orphan")}`,
    );
    expect(who(source, "orphan")).toEqual({ everyone: false, roles: [] });
  });

  it("権限で絞っていない危ないボタンは、画面ごとに拾う", () => {
    const one = access(APP);
    expect(one.openDanger.get("order_search")).toEqual(["CSV出力"]);
    expect(one.openDanger.has("customer_master")).toBe(false);
  });

  it("役割名を全部集める（綴り違いを黙って通さないため）", () => {
    expect(access(APP).roles).toEqual(["admin", "manager"]);
  });

  it("その役割で開けるかを答える", () => {
    expect(canOpen(who(APP, "order_search"), "staff")).toBe(true); // 誰でも
    expect(canOpen(who(APP, "customer_master"), "admin")).toBe(true);
    expect(canOpen(who(APP, "customer_master"), "manager")).toBe(false);
    expect(canOpen(who(APP, "price_master"), "admin")).toBe(false); // 誰も
  });

  it("人が読む言い方", () => {
    expect(describeAudience({ everyone: true, roles: [] })).toBe("誰でも開ける");
    expect(describeAudience({ everyone: false, roles: ["admin", "manager"] })).toBe(
      "admin / manager だけ",
    );
    expect(describeAudience({ everyone: false, roles: [] })).toBe("誰も開けない");
  });
});

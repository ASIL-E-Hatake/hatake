import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  NOBODY,
  renderMatrix,
  roleMatrix,
  roleSights,
  rolesInDocument,
  sightSummary,
} from "../src/index.js";

/**
 * 「その役割から見ると、この定義はどう見えるか」。
 *
 * いちばん大事なのは**誰でもない人（未ログイン）が必ず1列に居ること**。役割を持つ人だけ
 * 並べると、ログインしていない人に何が見えているかを誰も見ないままになる。
 */
const source = `app:
  id: sales
  title: 販売管理
  home: orders
  menu:
    - { id: orders, label: 受注, page: order_search }
    - { id: costs, label: 原価, page: cost_master, roles: [manager] }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      table:
        columns:
          - { field: orderNo, label: 受注番号 }
          - { field: margin, label: 粗利, roles: [manager] }
      actions:
        - { id: csv, type: export, label: CSV出力, roles: [staff, manager] }
        - { id: reject, type: plugin, plugin: rejectOrders, label: 却下, scope: selection, roles: [manager] }
    - type: master
      id: cost_master
      title: 原価管理
      repository: productRepository
      table:
        columns:
          - { field: code, label: コード }
      form:
        sections:
          - fields:
              - { field: code, label: コード, required: true }
      actions:
        - { id: create, type: create, label: 新規登録 }
`;

const document = parseYaml(source) as Record<string, unknown>;

describe("役割から引く", () => {
  it("定義に出てくる役割を名前順で数える", () => {
    expect(rolesInDocument(document)).toEqual(["manager", "staff"]);
  });

  it("誰でもない人が必ず1つ入る（ログインしていない人の見え方を落とさない）", () => {
    const sights = roleSights(document);
    expect(sights.map((one) => one.role)).toEqual(["manager", "staff", NOBODY]);
  });

  it("入口の権限で「開ける画面」が変わる", () => {
    const [manager, staff, nobody] = roleSights(document);
    const opens = (role: (typeof manager)["pages"]) =>
      role.filter((one) => one.canOpen).map((one) => one.page);
    expect(opens(manager.pages)).toEqual(["order_search", "cost_master"]);
    expect(opens(staff.pages)).toEqual(["order_search"]);
    expect(opens(nobody.pages)).toEqual(["order_search"]);
  });

  it("役割ごとに「見える／見えない」を数える（絞っている物だけ）", () => {
    const [manager, staff, nobody] = roleSights(document);
    // 絞られているのは4つ: メニュー原価・列粗利・CSV・却下。
    expect(sightSummary(manager)).toEqual({ seen: 4, hidden: 0 });
    expect(sightSummary(staff)).toEqual({ seen: 1, hidden: 3 });
    expect(sightSummary(nobody)).toEqual({ seen: 0, hidden: 4 });
  });
});

describe("役割ごとに並べた表", () => {
  const table = roleMatrix(document);

  it("列は役割ぜんぶ＋誰でもない人", () => {
    expect(table.roles).toEqual(["manager", "staff", NOBODY]);
  });

  it("画面の行は入口を辿った結果", () => {
    expect(table.opens.map((row) => [row.label, ...row.seen])).toEqual([
      ["受注照会", true, true, true],
      ["原価管理", true, false, false],
    ]);
  });

  it("メニューの行は出さない（画面の行と同じことを言う）", () => {
    expect(table.items.some((row) => row.node === "メニュー")).toBe(false);
  });

  it("絞っている物だけを並べる（絞っていない物は全員に見える）", () => {
    expect(table.items.map((row) => `${row.node}${row.label}`)).toEqual([
      "列粗利",
      "ボタンCSV出力",
      "ボタン却下",
    ]);
  });

  it("読む形は、○×が揃って出る", () => {
    const text = renderMatrix(table, "販売管理（sales）");
    expect(text).toContain("誰でもない人");
    expect(text).toContain("列「粗利」（order_search）");
    // 定義に書いてあることだけ、を毎回言う（守れているかは別の道具）。
    expect(text).toContain("実際の制御はバックエンドで守ります");
  });

  it("役割で絞っている所が無ければ、そう言う", () => {
    const open = parseYaml(`page:
  type: search
  id: orders
  title: 受注
  repository: orderRepository
  table:
    columns: [{ field: orderNo, label: 受注番号 }]
`) as Record<string, unknown>;
    const text = renderMatrix(roleMatrix(open), "受注（orders）");
    expect(text).toContain("役割で絞っている所が1つもありません");
  });

  it("単票の定義では「開ける画面」を言わない（入口が定義に無い）", () => {
    const page = parseYaml(`page:
  type: search
  id: orders
  title: 受注
  repository: orderRepository
  table:
    columns: [{ field: margin, label: 粗利, roles: [manager] }]
`) as Record<string, unknown>;
    const table = roleMatrix(page);
    expect(table.opens).toEqual([]);
    expect(table.items.map((row) => row.label)).toEqual(["粗利"]);
  });
});

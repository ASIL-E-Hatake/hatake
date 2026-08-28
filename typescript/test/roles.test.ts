import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  bulkByRole,
  bulkLine,
  findWarnings,
  renderRoles,
  roleInventory,
  roleNames,
  roleSpots,
  roleTitleOf,
} from "../src/index.js";

const raw = (source: string) => parseYaml(source) as Record<string, unknown>;

/** メニュー・ボタン・列に役割が散っているアプリ（1つは綴り違い）。 */
const APP = `app:
  id: sales
  title: 販売管理
  menu:
    - { id: orders, label: 受注, page: order_search }
    - { id: costs, label: 原価, page: cost_search, roles: [manager] }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      search:
        filters: [{ field: orderNo, label: 受注番号 }]
      table:
        columns: [{ field: orderNo, label: 受注番号, sortable: true }]
      actions:
        - { id: exportCsv, type: export, label: CSV 出力, roles: [manager, admin] }
    - type: search
      id: cost_search
      title: 原価照会
      repository: costRepository
      search:
        filters: [{ field: itemCode, label: 品目コード }]
      table:
        columns:
          - { field: itemCode, label: 品目コード, sortable: true }
          - { field: cost, label: 原価, roles: [manaher] }
`;

describe("定義に出てくる役割を数える", () => {
  it("メニュー・ボタン・列のどこに書いてあっても拾う", () => {
    const spots = roleSpots(raw(APP));
    expect(spots.map((one) => `${one.node}:${one.where}`)).toEqual([
      "メニュー:app.menu[1].roles",
      "ボタン:app.pages[0].actions[0].roles",
      "列:app.pages[1].table.columns[1].roles",
    ]);
    expect(roleNames(raw(APP))).toEqual(["admin", "manager", "manaher"]);
  });

  it("どの画面の話かを添える（ボタンを画面と間違えない）", () => {
    const spots = roleSpots(raw(APP));
    // メニューはどの画面のものでもない。ボタンと列は、その画面のもの。
    expect(spots[0].page).toBeUndefined();
    expect(spots[1].page).toBe("order_search");
    expect(spots[2].page).toBe("cost_search");
    // 名前は業務の言葉（ラベル）で。
    expect(spots[1].label).toBe("CSV 出力");
  });

  it("出てくる回数の多い順（1か所だけの役割＝綴り違いの疑いが下に落ちる）", () => {
    const inventory = roleInventory(raw(APP));
    expect(inventory.map((one) => `${one.role}:${one.spots.length}`)).toEqual([
      "manager:2",
      "admin:1",
      "manaher:1",
    ]);
  });

  it("プラグインの設定の中は見ない（中身が自由なので DSL の役割ではない）", () => {
    const source = `page:
  type: search
  id: s
  title: S
  repository: r
  search:
    filters: [{ field: a, label: あ }]
  table:
    columns: [{ field: a, label: あ, sortable: true }]
  actions:
    - { id: send, type: plugin, plugin: sendMail, label: 送信,
        config: { roles: [everyoneInsideThePlugin] } }
`;
    expect(roleNames(raw(source))).toEqual([]);
  });

  it("空で書いてあるものは数えない（`roles: []` は「誰でも」）", () => {
    const source = `page:
  type: search
  id: s
  title: S
  repository: r
  search:
    filters: [{ field: a, label: あ }]
  table:
    columns: [{ field: a, label: あ, sortable: true }]
  actions:
    - { id: remove, type: delete, label: 削除, roles: [] }
`;
    expect(roleNames(raw(source))).toEqual([]);
  });

  it("警告と同じ数え方（役割の一覧が2つあると、綴り違いの判定がズレる）", () => {
    // maxRows.byRole に定義のどこにも無い役割を書くと警告が出る。
    const source = APP.replace(
      "        - { id: exportCsv, type: export, label: CSV 出力, roles: [manager, admin] }",
      `        - { id: approve, type: plugin, plugin: approveOrders, label: 一括承認,
            scope: selection, roles: [manager, admin],
            maxRows: { default: 20, byRole: { mgr: 100 } } }`,
    );
    const found = findWarnings(raw(source)).filter(
      (one) => one.rule === "maxrows-unknown-role",
    );
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain("mgr");
    // 一覧に出てくる名前は、警告が「知っている」名前と同じ。
    expect(roleNames(raw(source))).not.toContain("mgr");
  });

  it("人が読む形には、場所と注意書きが出る", () => {
    const text = renderRoles(roleInventory(raw(APP)), roleTitleOf(raw(APP)));
    expect(text).toContain("販売管理（sales）");
    expect(text).toContain("manager … 2 か所");
    expect(text).toContain("app.pages[1].table.columns[1].roles");
    expect(text).toContain("綴り違いの疑い");
    // 権限がかかっている証明ではない、を毎回言う。
    expect(text).toContain("アプリ側の権限判定");
  });

  it("1つも無ければ「全部の人に全部見える」と言う（黙って空を返さない）", () => {
    const text = renderRoles([], "受注照会（order_search）");
    expect(text).toContain("出てくる役割 0");
    expect(text).toContain("全部の人に全部見えます");
  });
});

/**
 * 一括は「1回で何件動くか」が危険度そのもので、上限も区切りも**役割で変わる**。
 * 書ける場所はボタンなので定義のあちこちに散る＝役割から引ける口が要る。
 */
describe("役割ごとの一括の件数", () => {
  const BULK = `app:
  id: sales
  title: 販売管理
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      table:
        pagination: { pageSize: 200 }
        columns: [{ field: orderNo, label: 受注番号, sortable: true }]
      actions:
        - id: approve
          type: plugin
          plugin: approveOrders
          label: 一括承認
          scope: selection
          roles: [staff, manager]
          maxRows: { default: 20, byRole: { manager: 100 } }
          batchSize: { default: 10, byRole: { branch: 5 } }
        - id: close
          type: plugin
          plugin: closeOrders
          label: 一括締め
          scope: selection
          roles: [manager]
          maxRows: 500
    - type: search
      id: cost_search
      title: 原価照会
      repository: costRepository
      table:
        columns: [{ field: itemCode, label: 品目コード, roles: [branch] }]
`;

  const bulks = () => bulkByRole(raw(BULK), roleNames(raw(BULK)));

  it("その役割が押せるボタンだけ・その役割の件数で数える", () => {
    const found = bulks();
    // staff は既定の上限（20 件）と既定の区切り（10 件）。
    expect(found.get("staff")).toEqual([
      { page: "order_search", label: "一括承認", rows: 20, batch: 10 },
    ]);
    // manager は上限が広く（100 件）、締めも押せる（500 件だが1画面 200 件までしか
    // 選べない＝**動く件数は 200**）。締めには区切りが無い。
    expect(found.get("manager")).toEqual([
      { page: "order_search", label: "一括承認", rows: 100, batch: 10 },
      { page: "order_search", label: "一括締め", rows: 200, batch: undefined },
    ]);
    // branch は押せる一括が無い（列にしか出てこない役割）。
    expect(found.has("branch")).toBe(false);
  });

  it("言い方は「1回 何件まで・何件ずつ（何回に分かれる）」", () => {
    const lines = (bulks().get("manager") ?? []).map(bulkLine);
    expect(lines[0]).toBe("1回 100 件まで・10 件ずつ（上限まで選ぶと 10 回に分かれる）");
    // 区切りが無いことは**そう言う**（進み具合も中断も無い状態が読める）。
    expect(lines[1]).toBe("1回 200 件まで・区切りなし（1回で 200 件を渡す）");
  });

  it("棚卸しの1枚に出る（役割から引ける）", () => {
    const text = renderRoles(
      roleInventory(raw(BULK)),
      roleTitleOf(raw(BULK)),
      undefined,
      bulks(),
    );
    expect(text).toContain("一括「一括承認」（order_search） … 1回 20 件まで・10 件ずつ");
    expect(text).toContain("区切りなし");
    // 区切りが無いものが在るときだけ、その意味を添える。
    expect(text).toContain("進み具合も残り時間も出ず");
  });
});

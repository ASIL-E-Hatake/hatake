import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  ACTION_CASES,
  ActionTypes,
  deadActions,
  findAdvice,
  findWarnings,
  scaffold,
  scaffoldKinds,
} from "../src/index.js";

type Dict = Record<string, unknown>;

/** YAML を1つ食わせて、出た警告を並べる。 */
const warningsIn = (yaml: string) =>
  findWarnings(parseYaml(yaml) as Dict);

/// 押しても何も起きないボタン。
///
/// この枠組みで一番まずい転び方＝**定義は通り、画面にもボタンが出て、押すまで気づけない**。
/// `type` は7つ・画面の種別は8つあるので、規則を1つずつ手で書くとどこかが必ず抜ける。
/// 表（[ACTION_CASES]）を1枚にして、そこから規則を作っているので、ここでは
/// **表が全部の type を持っていること**と、1件ずつの言い方を見る。
const rules = (yaml: string): string[] =>
  warningsIn(yaml).map((one) => one.rule);

const page = (body: string): string => `page:\n${body}`;

/** 一覧＋フォームを持つ画面（行を直す/消す枠が在る）。 */
const CRUD = `  type: crud
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  key: id
  table:
    rowActions: [edit, delete]
    columns: [{ field: id, label: ID }]
  form:
    sections: [{ fields: [{ field: name, label: 氏名 }] }]
`;

describe("表が全部の type を持っている", () => {
  it("type を足したら、ここを決めないと通らない", () => {
    const covered = ACTION_CASES.map((one) => one.type).sort();
    expect(covered).toEqual(Object.values(ActionTypes).sort());
  });

  it("同じ type を2回書いていない（先に書いた方だけが効くので）", () => {
    expect(new Set(ACTION_CASES.map((one) => one.type)).size).toBe(
      ACTION_CASES.length,
    );
  });
});

describe("押しても何も起きないボタン", () => {
  it("表の行が無い画面の CSV 出力（押しても何も出ない）", () => {
    const found = warningsIn(
      page(`  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  form:
    sections: [{ fields: [{ field: name, label: 氏名 }] }]
  actions:
    - { id: csv, type: export, label: CSV出力 }
`),
    );
    expect(found.map((one) => one.rule)).toEqual(["export-without-rows"]);
    expect(found[0].path).toBe("page.actions[0].type");
    expect(found[0].message).toContain("表はありません");
    expect(found[0].fix).toContain("search / crud / master / report");
  });

  it("一覧のある画面の CSV 出力は黙る", () => {
    expect(
      rules(
        page(`  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    columns: [{ field: orderNo, label: 受注番号 }]
  actions:
    - { id: csv, type: export, label: CSV出力 }
`),
      ),
    ).toEqual([]);
  });

  it("呼ぶ相手が書いていないプラグイン", () => {
    const found = warningsIn(
      page(`  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    columns: [{ field: orderNo, label: 受注番号 }]
  actions:
    - { id: approve, type: plugin, label: 承認 }
`),
    );
    expect(found.map((one) => one.rule)).toEqual(["plugin-without-name"]);
    expect(found[0].path).toBe("page.actions[0].plugin");
    expect(found[0].fix).toContain("refs --needs-registration");
  });

  it("行き先が自分自身の遷移（同じ画面がもう1枚開くだけ）", () => {
    const found = warningsIn(
      page(`  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    columns: [{ field: orderNo, label: 受注番号 }]
  actions:
    - { id: again, type: navigate, label: もう一度, page: order_search }
`),
    );
    expect(found.map((one) => one.rule)).toEqual(["navigate-to-self"]);
    expect(found[0].path).toBe("page.actions[0].page");
    expect(found[0].message).toContain("もう1枚開くだけ");
  });
});

describe("行の操作の宣言（type: edit / delete）", () => {
  it("効いている形は黙る（行の削除の言い方を業務の言葉にする書き方）", () => {
    expect(
      rules(
        page(`${CRUD}  actions:
    - { id: delete, type: delete, label: 削除, confirm: { message: 消しますか } }
`),
      ),
    ).toEqual([]);
  });

  it("行を消す枠が無い画面では、押しても何も起きない", () => {
    const found = warningsIn(
      page(`  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  form:
    sections: [{ fields: [{ field: name, label: 氏名 }] }]
  actions:
    - { id: delete, type: delete, label: 削除 }
`),
    );
    expect(found.map((one) => one.rule)).toEqual(["row-declaration-unused"]);
    expect(found[0].message).toContain("行を消す枠がありません");
  });

  it("rowActions に並んでいなければ、行にも画面にも出ない", () => {
    const found = warningsIn(
      page(`  type: crud
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  key: id
  table:
    columns: [{ field: id, label: ID }]
  form:
    sections: [{ fields: [{ field: name, label: 氏名 }] }]
  actions:
    - { id: delete, type: delete, label: 削除 }
`),
    );
    expect(found.map((one) => one.rule)).toEqual(["row-declaration-unused"]);
    expect(found[0].message).toContain("table.rowActions");
    expect(found[0].fix).toContain("rowActions: [delete]");
  });

  it("id が組み込みの名前でなければ、宣言は読まれない", () => {
    const found = warningsIn(
      page(`${CRUD}  actions:
    - { id: purge, type: delete, label: 消す, confirm: { message: 消しますか } }
`),
    );
    expect(found.map((one) => one.rule)).toEqual(["row-declaration-unused"]);
    expect(found[0].path).toBe("page.actions[0].id");
    expect(found[0].message).toContain('いまの id は "purge"');
  });

  it("編集の宣言に confirm を書いても読まれない（そこは聞かない）", () => {
    const found = warningsIn(
      page(`${CRUD}  actions:
    - { id: edit, type: edit, label: 編集, confirm: { message: 直しますか } }
`),
    );
    expect(found.map((one) => one.rule)).toEqual(["row-declaration-unused"]);
    expect(found[0].path).toBe("page.actions[0].confirm");
  });

  it("編集の宣言だけ（口を足していない）なら黙る", () => {
    expect(
      rules(page(`${CRUD}  actions:\n    - { id: edit, type: edit, label: 編集 }\n`)),
    ).toEqual([]);
  });
});

describe("組み込みの行アクションを置ける画面", () => {
  it("search の rowActions に edit を書いても行に出ない", () => {
    const found = warningsIn(
      page(`  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    rowActions: [edit]
    columns: [{ field: orderNo, label: 受注番号 }]
`),
    );
    expect(found.map((one) => one.rule)).toEqual([
      "builtin-rowaction-unsupported",
    ]);
    expect(found[0].path).toBe("page.table.rowActions[0]");
    expect(found[0].fix).toContain("crud / master");
  });

  it("crud なら黙る", () => {
    expect(rules(page(CRUD))).toEqual([]);
  });
});

describe("素の関数としても呼べる（1画面ぶんで決まる）", () => {
  it("画面と actions を渡すだけで判定できる", () => {
    const document = parseYaml(
      page(`  type: dashboard
  id: home
  title: ホーム
  items: [{ id: total, title: 件数 }]
  actions:
    - { id: csv, type: export, label: CSV出力 }
    - { id: new, type: create, label: 新規 }
`),
    ) as { page: Record<string, unknown> };
    const found = deadActions(
      document.page,
      document.page.actions as Record<string, unknown>[],
    );
    expect(found.map((one) => one.rule)).toEqual([
      "export-without-rows",
      "create-action-unusable",
    ]);
  });
});

describe("雛形は最初から危なくない", () => {
  it("どの種別も警告ゼロ・助言ゼロで通る（AI は雛形を写す）", () => {
    for (const kind of scaffoldKinds) {
      const yaml = scaffold(kind, { id: `demo_${kind}`, title: "デモ" });
      expect(warningsIn(yaml), `${kind} の警告:\n${yaml}`).toEqual([]);
      expect(
        findAdvice(parseYaml(yaml) as Dict),
        `${kind} の助言:\n${yaml}`,
      ).toEqual([]);
    }
  });

  it("業務で決める値は TODO_ で置く（埋め忘れが画面に出る側に倒す）", () => {
    const yaml = scaffold("crud", { id: "customer_master", title: "顧客マスタ" });
    expect(yaml).toContain("roles: [TODO_role]");
    // キーは一覧に出す（行を見てどのレコードか分かるように）。
    expect(yaml).toContain("{ field: id, label: ID");
  });
});

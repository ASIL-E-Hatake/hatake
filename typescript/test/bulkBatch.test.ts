import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  batchSizeFor,
  explainSource,
  findWarnings,
  parsePageYaml,
  placeholdersWhere,
} from "../src/index.js";

/// 一括を**区切って実行する**（`action.batchSize`）。
///
/// 進み具合と中断は、**枠組みが回す側になったときだけ**できる機能（1回で全部渡すと、
/// 途中の状態は枠組みには分からない）。定義に増えたキーは1つで、道具の側で言うのは
/// 3つ: **区切りが効かない所を言う**・**いつ止められるのかを読み返す**・**送っていない
/// 件数を文言に差し込める**（`{skipped}`）。
///
/// 件数は**役割で変えられる**（回線の細い拠点は小さく、社内は大きく）。当てはまる役割が
/// 複数あれば**一番小さい**方＝`maxRows` とは逆（上限は「やっていいことの広さ」なので
/// 役割で広がるが、区切りは「1回に押し付ける量」なので安全な方に倒す）。
type Dict = Record<string, unknown>;

const page = (extra: string): string => `
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    columns: [{ field: orderNo, label: 受注番号 }]
  actions:
${extra}`;

const BULK = (extra = ""): string =>
  page(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 一括承認
      scope: selection
      batchSize: 20
${extra}`);

const warnings = (yaml: string) => findWarnings(parseYaml(yaml) as Dict);
const rules = (yaml: string): string[] =>
  warnings(yaml).map((one) => one.rule);

describe("解析", () => {
  it("区切りの件数が、そのまま読める（strict でも通る）", () => {
    const parsed = parsePageYaml(BULK(), { strict: true });
    expect(parsed.actions[0].batchSize).toEqual({ default: 20, byRole: {} });
  });

  it("役割ごとに書ける（当てはまる役割が複数なら一番小さい方）", () => {
    const parsed = parsePageYaml(
      page(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 一括承認
      scope: selection
      batchSize:
        default: 20
        byRole: { branch: 5, manager: 50 }
`),
      { strict: true },
    );
    const size = parsed.actions[0].batchSize;
    expect(size).toEqual({ default: 20, byRole: { branch: 5, manager: 50 } });
    // 役割が当てはまらなければ既定。
    expect(batchSizeFor(size, ["staff"])).toBe(20);
    // 複数当てはまれば一番小さい方（`maxRows` は一番ゆるい方＝逆）。
    expect(batchSizeFor(size, ["branch", "manager"])).toBe(5);
    // 書いていなければ区切らない（1回で全部）。
    expect(batchSizeFor(undefined, ["branch"])).toBeUndefined();
  });

  it("`all`（区切らない）は書けない＝区切らないなら書かない", () => {
    for (const value of ["all", "0", "[2]"]) {
      expect(() =>
        parsePageYaml(
          page(`    - { id: a, type: plugin, plugin: p, label: 承認, scope: selection, batchSize: ${value} }\n`),
          { strict: true },
        ),
      ).toThrow();
    }
  });

  it("書かなければ undefined（既定は1回で全部渡す）", () => {
    const parsed = parsePageYaml(
      page(`    - { id: approve, type: plugin, plugin: approveOrders, label: 承認, scope: selection }\n`),
      { strict: true },
    );
    expect(parsed.actions[0].batchSize).toBeUndefined();
  });
});

describe("効かない所に書いたら言う", () => {
  it("一括のボタンなら黙る", () => {
    expect(rules(BULK())).toEqual([]);
  });

  it("1件ずつのボタンに書いても、区切るものが無い", () => {
    const found = warnings(
      page(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 承認
      batchSize: 20
`),
    );
    expect(found.map((one) => one.rule)).toEqual(["batchsize-without-selection"]);
    expect(found[0].path).toBe("page.actions[0].batchSize");
    expect(found[0].fix).toContain("scope: selection");
  });

  it("上限以上の区切りは1回で終わる＝進み具合も中断も出ない", () => {
    const found = warnings(
      page(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 一括承認
      scope: selection
      maxRows: 20
      batchSize: 20
`),
    );
    expect(found.map((one) => one.rule)).toEqual(["batchsize-above-maxrows"]);
    expect(found[0].message).toContain("進み具合も中断も出ません");
    // 直し方は数で言う（「小さくしてください」だけでは決められない）。
    expect(found[0].fix).toContain("10 件");
  });

  it("役割ごとの区切りは、同じ役割の上限と比べる", () => {
    const found = warnings(
      page(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 一括承認
      scope: selection
      maxRows: { default: 40, byRole: { branch: 5 } }
      batchSize: { default: 20, byRole: { branch: 5 } }
`),
    );
    // 既定（20 < 40）は黙る。branch は上限も区切りも5件＝1回で終わるので言う。
    expect(found.map((one) => one.rule)).toEqual(["batchsize-above-maxrows"]);
    expect(found[0].path).toBe("page.actions[0].batchSize.byRole.branch");
    expect(found[0].message).toContain("（branch）");
  });

  it("押せない役割に書いた区切りは効かない", () => {
    const found = warnings(
      page(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 一括承認
      scope: selection
      roles: [manager]
      batchSize: { default: 20, byRole: { branch: 5 } }
`),
    );
    expect(found.map((one) => one.rule)).toEqual(["batchsize-unknown-role"]);
    expect(found[0].message).toContain("branch はこのボタンを押せない");
  });

  it("どこにも出てこない役割名は、綴りの近いものを言う", () => {
    const found = warnings(`
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    columns: [{ field: amount, label: 金額, roles: [manager] }]
  actions:
    - id: approve
      type: plugin
      plugin: approveOrders
      label: 一括承認
      scope: selection
      batchSize: { default: 20, byRole: { managr: 5 } }
`);
    expect(found.map((one) => one.rule)).toEqual(["batchsize-unknown-role"]);
    expect(found[0].fix).toContain("manager");
  });

  it("役割ごとの上限でも、既定の上限で見る", () => {
    expect(
      rules(
        page(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 一括承認
      scope: selection
      maxRows: { default: 40, byRole: { admin: all } }
      batchSize: 20
`),
      ),
    ).toEqual([]);
  });
});

describe("読み返し（いつ止められるのか）", () => {
  it("区切って実行することを言う", () => {
    const actions = explainSource(BULK()).sections.find(
      (one) => one.title === "できる操作",
    );
    expect(actions?.lines.join("\n")).toContain(
      "20 件ずつ実行する（進み具合が出て、区切りで止められる）",
    );
  });

  it("役割で変えてあるなら、誰がどの件数で動くのかまで言う", () => {
    const actions = explainSource(
      page(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 一括承認
      scope: selection
      batchSize: { default: 20, byRole: { branch: 5 } }
`),
    ).sections.find((one) => one.title === "できる操作");
    const text = actions?.lines.join("\n") ?? "";
    expect(text).toContain("20 件ずつ実行する（進み具合が出て、区切りで止められる）");
    expect(text).toContain("区切りは役割で変わる（branch は 5 件）");
  });

  it("上限まで選んだときに何回に分かれるかまで言う", () => {
    const actions = explainSource(
      page(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 一括承認
      scope: selection
      maxRows: 100
      batchSize: 20
`),
    ).sections.find((one) => one.title === "できる操作");
    expect(actions?.lines.join("\n")).toContain("上限まで選ぶと 5 回に分かれる");
  });

  it("1回で終わるなら回数は言わない（区切りが効いていない形は validate の担当）", () => {
    const actions = explainSource(
      page(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 一括承認
      scope: selection
      maxRows: 20
      batchSize: 20
`),
    ).sections.find((one) => one.title === "できる操作");
    expect(actions?.lines.join("\n")).not.toContain("回に分かれる");
  });

  it("1回で動く件数が決まらなければ回数は言わない（ページ送りを切ってある）", () => {
    const actions = explainSource(`page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    pagination: { enabled: false }
    columns: [{ field: orderNo, label: 受注番号 }]
  actions:
    - { id: approve, type: plugin, plugin: p, label: 一括承認, scope: selection, batchSize: 20 }
`).sections.find((one) => one.title === "できる操作");
    const text = actions?.lines.join("\n") ?? "";
    expect(text).toContain("20 件ずつ実行する");
    expect(text).not.toContain("回に分かれる");
  });

  it("1回で渡すなら言わない（そこには進み具合が無い）", () => {
    const actions = explainSource(
      page(`    - { id: approve, type: plugin, plugin: approveOrders, label: 承認, scope: selection }\n`),
    ).sections.find((one) => one.title === "できる操作");
    expect(actions?.lines.join("\n")).not.toContain("件ずつ実行する");
  });
});

describe("送っていない件数（{skipped}）", () => {
  it("差し込みの一覧に載っていて、印は「一括・走ったあと・失敗のとき」", () => {
    const bulk = placeholdersWhere((one) => one.bulkOnly);
    const failure = placeholdersWhere((one) => one.failureOnly);
    expect(bulk).toContain("{skipped}");
    expect(failure).toContain("{skipped}");
  });

  it("失敗の文言に書けば黙る", () => {
    expect(
      rules(
        BULK(`      onError: { message: "{count} 件を承認（{skipped} 件は実行していません）" }`),
      ),
    ).toEqual([]);
  });

  it("成功の文言に書いたら言う（成功に「実行していない分」は無い）", () => {
    const found = warnings(
      BULK(`      onSuccess: { message: "{skipped} 件を残しました" }`),
    );
    expect(found.map((one) => one.rule)).toEqual(["placeholder-not-filled"]);
    expect(found[0].message).toContain("{skipped}");
  });

  it("押す前の文言に書いたら言う（まだ1件も送っていない）", () => {
    const found = warnings(
      BULK(`      confirm: { message: "{skipped} 件を実行します" }`),
    );
    expect(found.map((one) => one.rule)).toEqual(["placeholder-not-filled"]);
  });

  it("1件ずつのボタンの文言に書いたら言う（区切りが無い）", () => {
    const found = warnings(
      page(`    - id: approve
      type: plugin
      plugin: approveOrders
      label: 承認
      onError: { message: "{skipped} 件は実行していません" }
`),
    );
    expect(found.map((one) => one.rule)).toEqual(["placeholder-not-filled"]);
  });
});

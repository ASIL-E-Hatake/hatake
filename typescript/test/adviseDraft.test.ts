import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { applyAdvice, findAdvice, withDrafts } from "../src/index.js";

const raw = (source: string) => parseYaml(source) as Record<string, unknown>;
const advise = (source: string) => withDrafts(raw(source), findAdvice(raw(source)));

/** 入力もある一覧（並べ替え・絞り込み・必須・キーの列が抜けている）。 */
const THIN = `page:
  type: crud
  id: order_list
  title: 受注一覧
  repository: orderRepository
  key: orderNo
  table:
    columns:
      - { field: customer, label: 得意先 }
      - { field: orderDate, label: 受注日, type: date }
      - { field: amount, label: 金額 }
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号 }
          - { field: customer, label: 得意先 }
`;

/** 一括のある照会（確認・失敗の言い方・役割・1回の上限が抜けている）。 */
const BULK = `page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  search:
    filters:
      - { field: orderNo, label: 受注番号 }
  table:
    pagination: { pageSize: 200 }
    columns:
      - { field: orderNo, label: 受注番号, sortable: true }
  actions:
    - { id: approve, type: plugin, plugin: approveOrders, label: 一括承認, scope: selection }
    - { id: exportCsv, type: export, label: CSV 出力, roles: [manager] }
`;

/** 合計の無い帳票。 */
const REPORT = `page:
  type: report
  id: sales_report
  title: 売上帳票
  repository: salesRepository
  table:
    columns:
      - { field: customer, label: 得意先 }
      - { field: amount, label: 金額, type: number }
  report:
    paper: { size: A4 }
`;

describe("助言に値の下書きを添える", () => {
  it("**下書きは全部そのまま当てられる**（当てられない下書きは出さない）", () => {
    const drafted = new Set<string>();
    for (const source of [THIN, BULK, REPORT]) {
      for (const one of advise(source)) {
        if (one.draft === undefined) continue;
        drafted.add(one.rule);
        // 何から作ったかを言わない下書きは、読む側が正解と読む。
        expect(one.draftFrom, one.rule).toBeTruthy();
        const result = applyAdvice(source, [
          { rule: one.rule, where: one.where, value: one.draft },
        ]);
        expect(
          result.applied.map((applied) => applied.rule),
          `${one.rule}: ${JSON.stringify(result.skipped)}`,
        ).toEqual([one.rule]);
      }
    }
    // 下書きを1つも作らずに通ってしまわないよう、出るはずのものを名前で押さえる。
    expect([...drafted].sort()).toEqual(
      [
        "bulk-on-many-rows",
        "bulk-without-confirm",
        "bulk-without-error-message",
        "no-required-field",
        "no-search-filter",
        "no-sortable-column",
        "open-dangerous-action",
        "report-without-totals",
      ].sort(),
    );
  });

  it("並べ替えは名前から選ぶ（日付・コードらしい列）", () => {
    const one = advise(THIN).find((x) => x.rule === "no-sortable-column");
    expect(one?.draft).toEqual(["orderDate"]);
    expect(one?.draftFrom).toContain("列の名前から");
  });

  it("絞り込みは列の名前とラベルをそのまま使う（画面に出る言葉を機械が作らない）", () => {
    const one = advise(THIN).find((x) => x.rule === "no-search-filter");
    expect(one?.draft).toEqual([{ field: "orderDate", label: "受注日" }]);
  });

  it("必須は1件を指すキーから（page.key が項目にあるとき）", () => {
    const one = advise(THIN).find((x) => x.rule === "no-required-field");
    expect(one?.draft).toEqual(["orderNo"]);
    expect(one?.draftFrom).toContain("page.key");
  });

  it("確認の文はボタンの名前から作り、件数の差し込みを入れる", () => {
    const one = advise(BULK).find((x) => x.rule === "bulk-without-confirm");
    expect(one?.draft).toEqual({
      message: "{count} 件を「一括承認」します。よろしいですか？",
    });
    // 文は業務の言葉なので、直す前提だと言う。
    expect(one?.draftFrom).toContain("業務の言葉に直して");
  });

  it("1回の上限は「いま実際に動く件数」から（意味を変えない値）", () => {
    const one = advise(BULK).find((x) => x.rule === "bulk-on-many-rows");
    expect(one?.draft).toBe(200);
    expect(one?.draftFrom).toContain("1ページ 200 件");
  });

  it("役割は定義に出てくる名前を全部並べ、絞ってから渡すと言う", () => {
    const one = advise(BULK).find((x) => x.rule === "open-dangerous-action");
    expect(one?.draft).toEqual(["manager"]);
    expect(one?.draftFrom).toContain("絞ってから");
  });

  it("役割がどこにも書かれていなければ、下書きは作らない", () => {
    const nameless = BULK.replace(", roles: [manager]", "");
    const found = advise(nameless).filter((x) => x.rule === "open-dangerous-action");
    expect(found.length).toBeGreaterThan(0);
    for (const one of found) expect(one.draft).toBeUndefined();
  });

  it("ページ送りを切ってあれば、1回の上限の下書きは作らない（件数が決まらない）", () => {
    const all = BULK.replace("pagination: { pageSize: 200 }", "pagination: { enabled: false }");
    const one = advise(all).find((x) => x.rule === "bulk-on-many-rows");
    expect(one).toBeDefined();
    expect(one?.draft).toBeUndefined();
  });

  it("合計は明細の数の列から", () => {
    const one = advise(REPORT).find((x) => x.rule === "report-without-totals");
    expect(one?.draft).toEqual([{ field: "amount", aggregate: "sum" }]);
  });

  it("値が決まっているものと、文の書き換えには下書きを作らない", () => {
    // 1件を指すキーの列は、当てる側が定義の中の業務名から作る（下書きは要らない）。
    const keyless = advise(THIN).find((one) => one.rule === "key-not-in-table");
    expect(keyless).toBeDefined();
    expect(keyless?.draft).toBeUndefined();

    // 見せ方（currency）も当てる側が入れるので下書きは要らない。
    const money = advise(`page:
  type: search
  id: s
  title: S
  repository: r
  search:
    filters: [{ field: a, label: あ }]
  table:
    columns: [{ field: amount, label: 金額, sortable: true }]
`);
    expect(money.find((one) => one.rule === "money-without-format")?.draft).toBeUndefined();

    // 確認の文に件数を足す話は、どこに入れるかで文が変わる＝機械には書けない。
    const count = advise(`page:
  type: search
  id: s
  title: S
  repository: r
  search:
    filters: [{ field: a, label: あ }]
  table:
    columns: [{ field: a, label: あ, sortable: true }]
  actions:
    - { id: approve, type: plugin, plugin: approveOrders, label: 一括承認, scope: selection,
        confirm: { message: 選んだ受注を承認します }, onError: { message: 失敗 }, maxRows: 20,
        roles: [manager] }
`);
    const one = count.find((x) => x.rule === "bulk-confirm-without-count");
    expect(one).toBeDefined();
    expect(one?.draft).toBeUndefined();
  });

  it("案件の決めごと（require）には下書きを作らない（値は案件のものなので）", () => {
    const document = raw(THIN);
    const rules = {
      off: [],
      options: {},
      require: [
        { rule: "team-column-width", node: "column" as const, key: "width", every: true },
      ],
    };
    const found = withDrafts(document, findAdvice(document, rules)).filter(
      (one) => one.rule === "team-column-width",
    );
    expect(found.length).toBeGreaterThan(0);
    for (const one of found) expect(one.draft).toBeUndefined();
  });
});

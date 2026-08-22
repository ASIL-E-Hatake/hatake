import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  type Advice,
  type AdviceRules,
  BUILTIN_RULES,
  buildReference,
  DEFAULT_RULES,
  findAdvice,
  parseAdviceRules,
  renderAdvice,
  unwritableAdvice,
} from "../src/index.js";

const reference = buildReference(
  JSON.parse(readFileSync("../spec/hatake-page.schema.json", "utf8")),
);

/** 組み込みの規則が**全部1件ずつ**出る定義（規則名の表と実装が合っているかを見るため）。 */
const EVERYTHING = `app:
  id: sales
  title: 販売
  menu:
    - { id: orders, label: 受注, page: order_list }
  pages:
    - type: crud
      id: order_list
      title: 受注一覧
      repository: orderRepository
      key: orderNo
      table:
        # ページ送りを切ってあるので「一括があるのに1回で全件」が出る。
        pagination: { enabled: false }
        columns:
          - { field: customer, label: 得意先 }
          - { field: orderDate, label: 受注日, type: date }
          - { field: amount, label: 金額, type: number }
      form:
        sections:
          - fields:
              - { field: customer, label: 得意先 }
              - { field: startDate, label: 開始日, type: date }
              - { field: endDate, label: 終了日, type: date }
              - { field: total, label: 合計金額, type: number }
              - field: lines
                label: 明細
                type: subTable
                source: { repository: orderLineRepository }
                columns:
                  - { field: item, label: 品名 }
                  - { field: amount, label: 金額, type: number }
      actions:
        - { id: remove, type: delete, label: 削除 }
        # 一括は roles を書いてあるので open-dangerous-action は出ない。
        # ここで出るのは「確認が無い」と「失敗の言い方が無い」の2つ。
        - { id: approve, type: plugin, plugin: approveOrders, label: 一括承認,
            scope: selection, roles: [admin] }
        # 確認はあるが件数が無い（他の一括の規則は満たしている）。
        - { id: notify, type: plugin, plugin: notifyOrders, label: 通知,
            scope: selection, roles: [admin],
            confirm: { message: 選んだ受注に通知します },
            onError: { message: '{failed} 件は通知できませんでした' } }
        # 戻せない名前なのに確認の OK が赤くない（他の一括の規則は満たしている）。
        - { id: discardSelected, type: plugin, plugin: discardOrders, label: 破棄,
            scope: selection, roles: [admin],
            confirm: { message: '{count} 件を破棄します' },
            onError: { message: '{failed} 件は破棄できませんでした' } }
    - type: report
      id: sales_report
      title: 売上明細表
      repository: orderRepository
      table:
        columns:
          - { field: customer, label: 得意先 }
      report:
        sort: { field: customer }
`;

const advise = (source: string, rules: AdviceRules = DEFAULT_RULES): Advice[] =>
  findAdvice(parseYaml(source) as Record<string, unknown>, rules);

const names = (source: string, rules?: AdviceRules): string[] =>
  advise(source, rules).map((one) => one.rule);

describe("物差しの読み方", () => {
  it("何も渡さなければ組み込みのまま", () => {
    expect(parseAdviceRules({})).toEqual(DEFAULT_RULES);
  });

  it("$comment は書ける（設定ファイルに理由を書けないと、そのうち誰も直せない）", () => {
    expect(parseAdviceRules({ $comment: "うちの決めごと" }).off).toEqual([]);
  });

  // ここが要点。設定が黙って効かないのが一番まずい（止めたつもりの規則が動き続ける）。
  it("知らないキーはエラー", () => {
    expect(() => parseAdviceRules({ offf: [] })).toThrow(/知らないキー "offf"/);
  });

  it("知らない規則名を止めようとしたらエラー", () => {
    expect(() => parseAdviceRules({ off: ["no-sortable-colum"] })).toThrow(
      /規則名ではありません/,
    );
  });

  it("知らないつまみはエラー（何が回せるかまで言う）", () => {
    expect(() =>
      parseAdviceRules({ options: { "no-sortable-column": { minColumn: 5 } } }),
    ).toThrow(/知らないつまみ "minColumn"/);
  });

  it("つまみを持たない規則に目盛りは渡せない", () => {
    expect(() =>
      parseAdviceRules({ options: { "key-not-in-table": { minColumns: 5 } } }),
    ).toThrow(/知らないつまみ/);
  });

  it("つまみの型が違えばエラー", () => {
    expect(() =>
      parseAdviceRules({ options: { "no-sortable-column": { minColumns: "5" } } }),
    ).toThrow(/数で書いて/);
  });

  it("組み込みと同じ名前の決めごとは作れない（どちらの話か分からなくなる）", () => {
    expect(() =>
      parseAdviceRules({
        require: [{ rule: "no-sortable-column", node: "column", key: "sortable" }],
      }),
    ).toThrow(/組み込みの規則名です/);
  });

  it("同じ名前の決めごとが2つあればエラー", () => {
    const one = { rule: "team-x", node: "column", key: "sortable" };
    expect(() => parseAdviceRules({ require: [one, one] })).toThrow(/2回出てきます/);
  });

  it("見られない場所を指したらエラー（どこが見られるかまで言う）", () => {
    expect(() =>
      parseAdviceRules({ require: [{ rule: "t", node: "theme", key: "radius" }] }),
    ).toThrow(/見られる場所ではありません/);
  });

  it("決めごとの知らないキーもエラー", () => {
    expect(() =>
      parseAdviceRules({
        require: [{ rule: "t", node: "column", key: "sortable", onlyIf: {} }],
      }),
    ).toThrow(/知らないキー "onlyIf"/);
  });
});

describe("組み込みの規則を切る", () => {
  // 規則名の表（BUILTIN_RULES）と実装が合っているかを、両向きに見る。
  // 表にあるのに出ない＝消えた規則が表に残っている。出るのに表に無い＝off で止められない。
  it("表にある規則は全部、この定義で出る", () => {
    expect(names(EVERYTHING).sort()).toEqual(Object.keys(BUILTIN_RULES).sort());
  });

  it("表のどの規則も、off で止まる", () => {
    for (const rule of Object.keys(BUILTIN_RULES)) {
      const rules = parseAdviceRules({ off: [rule] });
      expect(names(EVERYTHING, rules), rule).not.toContain(rule);
      // 止めたのは1つだけ（他の規則を巻き込まない）。
      expect(names(EVERYTHING, rules).length, rule).toBe(
        Object.keys(BUILTIN_RULES).length - 1,
      );
    }
  });

  it("全部切れば1件も出ない", () => {
    const rules = parseAdviceRules({ off: Object.keys(BUILTIN_RULES) });
    expect(names(EVERYTHING, rules)).toEqual([]);
  });
});

describe("目盛りを変える", () => {
  const source = `page:
  type: search
  id: order_list
  title: 受注一覧
  repository: orderRepository
  search:
    filters:
      - { field: orderNo, label: 受注番号 }
  table:
    columns:
      - { field: customer, label: 得意先 }
      - { field: orderDate, label: 受注日, type: date }
      - { field: unitPrice, label: 単価, type: number }
`;

  it("並べ替えを言い出す列数を変えられる", () => {
    expect(names(source)).toContain("no-sortable-column");
    const rules = parseAdviceRules({
      options: { "no-sortable-column": { minColumns: 4 } },
    });
    expect(names(source, rules)).not.toContain("no-sortable-column");
  });

  it("金額らしいと見なす語を変えられる（英語の名前しか使わない現場もある）", () => {
    expect(names(source)).toContain("money-without-format");
    const rules = parseAdviceRules({
      options: { "money-without-format": { words: ["金額"] } },
    });
    expect(names(source, rules)).not.toContain("money-without-format");
  });

  it("危ないと見なすアクション種別を変えられる", () => {
    const withSave = `page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true }
  actions:
    - { id: save, type: save, label: 保存 }
`;
    expect(names(withSave)).not.toContain("open-dangerous-action");
    const rules = parseAdviceRules({
      options: { "open-dangerous-action": { types: ["save"] } },
    });
    expect(names(withSave, rules)).toContain("open-dangerous-action");
  });
});

describe("案件の決めごとを足す", () => {
  const listPage = `page:
  type: crud
  id: order_list
  title: 受注一覧
  repository: orderRepository
  key: orderNo
  search:
    filters:
      - { field: orderNo, label: 受注番号 }
  table:
    columns:
      - { field: orderNo, label: 受注番号 }
      - { field: customer, label: 得意先 }
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true }
  actions:
    - { id: remove, type: delete, label: 削除, roles: [admin] }
    - { id: csv, type: export, label: CSV出力, roles: [admin] }
`;

  it("「一覧には必ず並べ替えを付ける」（1つでもあればよい）", () => {
    const rules = parseAdviceRules({
      require: [
        {
          rule: "team-sortable-column",
          node: "column",
          key: "sortable",
          pages: ["crud", "master", "search"],
          says: "うちの決めごとで、一覧は並べ替えできるようにします。",
          add: "よく使う列に `sortable: true`。",
        },
      ],
    });
    const found = advise(listPage, rules).filter((one) => one.rule === "team-sortable-column");
    expect(found).toHaveLength(1);
    expect(found[0].where).toBe("page.table.columns");
    expect(found[0].says).toContain("うちの決めごと");
  });

  it("1つでも書いてあれば言わない", () => {
    const rules = parseAdviceRules({
      require: [{ rule: "team-sortable-column", node: "column", key: "sortable" }],
    });
    // 列のほうだけ直す（同じ書き方の絞り込みが上にあるので、後ろから数えて置き換える）。
    const at = listPage.lastIndexOf("- { field: orderNo, label: 受注番号 }");
    const ok =
      listPage.slice(0, at) +
      "- { field: orderNo, label: 受注番号, sortable: true }" +
      listPage.slice(at + "- { field: orderNo, label: 受注番号 }".length);
    expect(names(ok, rules)).not.toContain("team-sortable-column");
  });

  it("every: true なら1つずつ言う（場所も1つずつ指す）", () => {
    const rules = parseAdviceRules({
      require: [
        { rule: "team-column-width", node: "column", key: "width", every: true },
      ],
    });
    const found = advise(listPage, rules).filter((one) => one.rule === "team-column-width");
    expect(found).toHaveLength(2);
    expect(found.map((one) => one.where)).toEqual([
      "page.table.columns[0].width",
      "page.table.columns[1].width",
    ]);
  });

  it("when でその場所を絞れる（削除ボタンだけ見る）", () => {
    const rules = parseAdviceRules({
      require: [
        {
          rule: "team-delete-confirm",
          node: "action",
          key: "confirm",
          when: { type: "delete" },
          every: true,
        },
      ],
    });
    const found = advise(listPage, rules).filter((one) => one.rule === "team-delete-confirm");
    expect(found).toHaveLength(1);
    expect(found[0].where).toBe("page.actions[0].confirm");
  });

  it("pages でページ種別を絞れる", () => {
    const rules = parseAdviceRules({
      require: [
        {
          rule: "team-report-paper",
          node: "page",
          key: "report",
          pages: ["report"],
        },
      ],
    });
    expect(names(listPage, rules)).not.toContain("team-report-paper");
  });

  it("見る場所そのものが無ければ黙る（一覧の無い画面に「列に書け」は言えない）", () => {
    const formOnly = `page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true }
`;
    const rules = parseAdviceRules({
      require: [{ rule: "team-sortable-column", node: "column", key: "sortable" }],
    });
    expect(names(formOnly, rules)).not.toContain("team-sortable-column");
  });

  it("空で書いてあるのは書いていない扱い（roles: [] は「まだ決めていない」）", () => {
    const empty = listPage.replace("roles: [admin] }", "roles: [] }");
    const rules = parseAdviceRules({
      require: [
        { rule: "team-roles", node: "action", key: "roles", when: { type: "delete" }, every: true },
      ],
    });
    expect(names(empty, rules)).toContain("team-roles");
  });

  it("決めごとも off で止まる", () => {
    const rules = parseAdviceRules({
      require: [{ rule: "team-sortable-column", node: "column", key: "sortable" }],
      off: ["team-sortable-column"],
    });
    expect(names(listPage, rules)).not.toContain("team-sortable-column");
  });

  it("どの画面の話かが分かる（app の1枚に絞れるように）", () => {
    const found = advise(EVERYTHING);
    expect(new Set(found.map((one) => one.page))).toEqual(
      new Set(["order_list", "sales_report"]),
    );
  });
});

describe("嘘をつかない", () => {
  it("決めごとが挙げるキーも、その場所に本当に書けるかを見られる", () => {
    const rules = parseAdviceRules({
      require: [
        { rule: "team-sortable-column", node: "column", key: "sortable" },
        { rule: "team-report-search", node: "page", key: "search", pages: ["report"] },
      ],
    });
    expect(unwritableAdvice(advise(EVERYTHING, rules), reference)).toEqual([]);
  });

  it("書けないキーを勧める決めごとは、見つけられる", () => {
    const rules = parseAdviceRules({
      require: [{ rule: "team-typo", node: "column", key: "sortble" }],
    });
    const bad = unwritableAdvice(advise(EVERYTHING, rules), reference);
    // 一覧を持つ画面が2枚あるので2件。挙げたキー（綴り違い）が両方で拾えている。
    expect(bad.map((one) => one.rule)).toEqual(["team-typo", "team-typo"]);
    expect(bad.map((one) => one.key)).toEqual(["sortble", "sortble"]);
  });

  it("同梱の物差しの例は、書けるキーだけを勧める", () => {
    const rules = parseAdviceRules(
      JSON.parse(readFileSync("../docs/guide/advise-rules.example.json", "utf8")),
    );
    expect(rules.require.length).toBeGreaterThan(0);
    const app = readFileSync("../spec/examples/sales_app.yaml", "utf8");
    expect(unwritableAdvice(advise(app, rules), reference)).toEqual([]);
  });
});

describe("物差しを渡したことは出力に書く", () => {
  it("組み込みのままだと思って読まれないように（誰の決めごとかが変わる）", () => {
    const rules = parseAdviceRules({
      off: ["money-without-format"],
      require: [{ rule: "team-sortable-column", node: "column", key: "sortable" }],
    });
    const text = renderAdvice(advise(EVERYTHING, rules), {
      rulesFrom: "team.json",
      rules,
    });
    expect(text).toContain("物差しは team.json を使いました");
    expect(text).toContain("止めた規則 1 件");
    expect(text).toContain("案件の決めごと 1 件");
  });

  it("渡していないときは何も言わない", () => {
    expect(renderAdvice(advise(EVERYTHING))).not.toContain("物差し");
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  explainApp,
  explainPage,
  explainSource,
  parseAppYaml,
  parsePageYaml,
  renderExplain,
} from "../src/index.js";

/** 定義（YAML）→ 説明。素の document も渡す（遷移先はモデルに無い）。 */
const explain = (source: string) => {
  const raw = parseYaml(source) as Record<string, unknown>;
  return explainPage(parsePageYaml(source, { strict: true }), raw.page as Record<string, unknown>);
};

const lines = (source: string, title: string): string[] =>
  explain(source).sections.find((s) => s.title === title)?.lines ?? [];

const all = (source: string): string => renderExplain(explain(source));

const page = ({
  kind = "crud",
  extra = "",
  filters = "      - { field: name, label: 顧客名, operator: contains }",
  columns = "      - { field: code, label: コード, sortable: true }",
  fields = "          - { field: code, label: コード, required: true }",
  actions = "    - { id: create, type: create, label: 新規登録 }",
}: {
  kind?: string;
  extra?: string;
  filters?: string;
  columns?: string;
  fields?: string;
  actions?: string;
} = {}) => `
page:
  type: ${kind}
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  key: id
  search:
    filters:
${filters}
  table:
    columns:
${columns}
  form:
    sections:
      - fields:
${fields}
  actions:
${actions}
${extra}`;

describe("画面が何をするものか", () => {
  it("1行目で種別を言う", () => {
    expect(explain(page()).headline).toBe(
      "顧客マスタ（customer_master）— 検索して一覧に出し、その場で登録・修正・削除までできる画面",
    );
  });

  it("できないことも言う（照会専用は書き換えられない）", () => {
    const search = `
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: id
  table:
    columns:
      - { field: id, label: ID }
`;
    expect(lines(search, "この画面でできないこと")).toContain(
      "登録・修正・削除はできない（照会専用）",
    );
  });

  it("削除のボタンが無ければ、そう言う", () => {
    expect(lines(page(), "この画面でできないこと")).toContain(
      "削除はできない（削除のボタンが無い）",
    );
  });

  it("データの出どころとキーを言う（アプリ側が用意するもの）", () => {
    expect(lines(page(), "データ")).toEqual([
      "データの出どころは customerRepository（アプリ側が用意する）。",
      "1件を指すキーは id。",
    ]);
  });
});

describe("条件を日本語にする", () => {
  const withCondition = (condition: string) =>
    page({
      fields: `          - { field: kind, label: 区分, type: select,
              options: [{ value: personal, label: 個人 }, { value: corp, label: 法人 }] }
          - { field: invoiceNo, label: 登録番号, ${condition} }`,
    });

  it("項目名も値も、書いてあるラベルで言う", () => {
    expect(lines(withCondition("visibleWhen: { field: kind, value: corp }"), "入力する項目")).toContain(
      "登録番号 … 区分 が 法人 のときだけ出る",
    );
  });

  it("新規／編集は状態の話として言う", () => {
    expect(lines(withCondition("enabledWhen: { mode: create }"), "入力する項目")).toContain(
      "登録番号 … 新規のときだけ触れる",
    );
  });

  it("条件つき必須・読み取り専用は、それぞれの言い方で", () => {
    expect(
      lines(withCondition("requiredWhen: { field: kind, value: corp }"), "入力する項目"),
    ).toContain("登録番号 … 区分 が 法人 のときだけ必須");
    expect(
      lines(withCondition("readOnlyWhen: { field: kind, value: personal }"), "入力する項目"),
    ).toContain("登録番号 … 区分 が 個人 のときは直せない");
  });

  it("all / any は「かつ」「または」で繋ぐ", () => {
    const text = all(
      withCondition(
        "visibleWhen: { all: [{ field: kind, value: corp }, { field: amount, operator: gte, value: 1000 }] }",
      ),
    );
    expect(text).toContain("区分 が 法人 のとき、かつ amount が 1000 以上のときだけ出る");
  });

  it("条件で使えない演算子は、そう書いてあると言う（嘘をつかない）", () => {
    const text = all(
      withCondition("visibleWhen: { field: amount, operator: between, value: [1, 2] }"),
    );
    expect(text).toContain("between は条件では使えません");
  });

  it("枠ごとの条件は見出しに出す", () => {
    const withSection = `
page:
  type: form
  id: customer_form
  title: 顧客入力
  repository: customerRepository
  form:
    sections:
      - fields:
          - { field: kind, label: 区分, type: select,
              options: [{ value: corp, label: 法人 }] }
      - title: 請求先
        visibleWhen: { field: kind, value: corp }
        fields:
          - { field: billingCode, label: 請求先コード, required: true }
`;
    expect(explain(withSection).sections.map((s) => s.title)).toContain(
      "請求先（区分 が 法人 のときだけ出る枠）",
    );
  });
});

describe("見えるもの・できること", () => {
  it("検索条件は突合の意味を日本語で言う", () => {
    const text = lines(
      page({
        filters: `      - { field: name, label: 顧客名, operator: contains }
      - { field: orderDate, label: 受注日, type: date, operator: between }`,
      }),
      "絞り込める条件",
    );
    expect(text).toEqual([
      "顧客名 … 部分一致",
      "受注日 … 期間・範囲（開始と終了の2つ）",
    ]);
  });

  it("連動する選択肢は、親をラベルで言う", () => {
    const text = lines(
      page({
        filters: `      - { field: category, label: カテゴリ, type: select, operator: equals,
          options: [{ value: food, label: 食品 }] }
      - { field: sub, label: 細目, type: select, operator: equals, optionsFrom: category,
          options: [{ value: veg, label: 野菜, when: food }] }`,
      }),
      "絞り込める条件",
    );
    expect(text[1]).toContain("カテゴリを選ぶと、それに合うものだけになる");
  });

  it("列の見せ方は例で言う（金額なら ¥ 付きの例）", () => {
    expect(
      lines(
        page({
          columns: "      - { field: amount, label: 金額, format: currency }",
        }),
        "一覧に出る列",
      ),
    ).toContain("金額（¥1,234,567 のように見せる）");
  });

  it("ボタンは何が起きるか・確認するか・そのあとどうなるかを言う", () => {
    const text = lines(
      page({
        actions: `    - { id: remove, type: delete, label: 削除,
        onSuccess: { message: 消しました } }
    - { id: detail, type: navigate, label: 詳細, page: customer_detail }
    - { id: printPdf, type: print, label: 印刷 }
    - { id: approve, type: plugin, plugin: approveOrders, label: 一括承認,
        scope: selection, onError: { message: 承認できませんでした } }
    - id: reject
      type: plugin
      plugin: rejectOrders
      label: 却下
      confirm: { message: 戻せません }
      prompt:
        fields:
          - { field: reason, label: 理由, required: true }
          - { field: rejectedOn, label: 却下日, type: date }`,
      }),
      "できる操作",
    );
    expect(text[0]).toBe(
      "削除 … 削除する。押すと確認を出す（削除は既定で確認する）。終わったら「消しました」と出す",
    );
    expect(text[1]).toBe("詳細 … 別の画面へ移る（customer_detail へ）");
    expect(text[2]).toBe("印刷 … 紙に刷る");
    // 聞くダイアログが在るなら「確認を出す」とは言わない（ダイアログは1枚）。
    expect(text[4]).toBe(
      "却下 … アプリ側の処理を呼ぶ（rejectOrders）。押すと 理由 / 却下日 を聞く",
    );
    // 一括は「一度に何件動くか」まで言う（危険度がそこで変わる）。
    expect(text[3]).toBe(
      "一括承認 … アプリ側の処理を呼ぶ（approveOrders）。" +
        "選んだ行に対して実行する（一度に最大 50 件）。" +
        "失敗したら「承認できませんでした」と出す",
    );
  });

  it("行ごとの操作は、宣言されたボタンのラベルで言う", () => {
    const withRowActions = page({
      extra: "",
      actions: "    - { id: detail, type: navigate, label: 詳細, page: customer_detail }",
    }).replace(
      "  table:\n    columns:",
      "  table:\n    rowActions: [detail, edit]\n    columns:",
    );
    expect(lines(withRowActions, "行ごとの操作（一覧の各行に出る）")).toEqual([
      "詳細",
      "編集を開く",
    ]);
  });

  // 「画面の中で隠れるもの」と「この画面を開ける人」は別の話（後者は入口から辿る）。
  it("権限で絞っているものは「画面の中で隠れるもの」にまとめる", () => {
    const text = lines(
      page({
        columns: "      - { field: amount, label: 金額, roles: [admin] }",
        actions: "    - { id: create, type: create, label: 新規登録, roles: [admin, staff] }",
      }),
      "画面の中で隠れるもの（権限）",
    );
    expect(text).toEqual([
      "列「金額」 … admin だけ",
      "ボタン「新規登録」 … admin / staff だけ",
    ]);
  });

  it("明細は1行の中身も言う", () => {
    const text = all(
      page({
        fields: `          - field: lines
            label: 明細
            type: subTable
            columns:
              - { field: item, label: 品名 }
              - { field: qty, label: 数量, type: number }`,
      }),
    );
    expect(text).toContain("明細 … 明細（表で複数行）、1行は 品名・数量");
  });
});

describe("アプリ全体", () => {
  const app = `
dsl_version: "1.0"
app:
  id: sales
  title: 販売管理
  home: menu_orders
  menu:
    - { id: menu_orders, label: 受注, page: order_search }
    - group: マスタ
      items:
        - { label: 商品, page: product_master }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      key: id
      table:
        columns: [{ field: id, label: ID }]
    - type: master
      id: product_master
      title: 商品マスタ
      repository: productRepository
      key: id
      table:
        columns: [{ field: id, label: ID }]
      form:
        sections:
          - fields: [{ field: id, label: ID }]
`;

  it("メニューは道で、画面は種別つきで並べる", () => {
    const document = explainApp(parseAppYaml(app, { strict: true }));
    expect(document.headline).toContain("2 枚の画面");
    const menu = document.sections.find((s) => s.title === "メニュー")?.lines;
    expect(menu).toEqual([
      "受注 → order_search",
      "マスタ > 商品 → product_master",
    ]);
    const pages = document.sections.find((s) => s.title === "画面")?.lines;
    expect(pages?.[0]).toContain("検索して一覧を見るだけの画面");
    expect(
      document.sections.find((s) => s.title === "最初に開く画面")?.lines,
    ).toEqual(["menu_orders"]);
  });
});

describe("項目間の検証の言い方", () => {
  const explainOf = (validators: string): string =>
    all(`page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - { field: startDate, label: 開始日, type: date }
          - field: endDate
            label: 終了日
            type: date
            validators:
${validators}
          - { field: total, label: 合計, type: number }
          - field: lines
            label: 明細
            type: subTable
            fields:
              - { field: amount, label: 金額, type: number }
`);

  // 相手を項目名で言うと、DSL を知らない人には読めない。
  it("相手はラベルで言う", () => {
    const text = explainOf("              - { type: compare, operator: gte, field: startDate }");
    expect(text).toContain("開始日 以上");
    expect(text).not.toContain("startDate");
  });

  it("突合ごとに言い方が変わる", () => {
    expect(
      explainOf("              - { type: compare, operator: lt, field: startDate }"),
    ).toContain("開始日 より小さい値");
    expect(
      explainOf("              - { type: compare, operator: notEquals, field: startDate }"),
    ).toContain("開始日 と違う値");
  });

  it("明細の畳み込みも言葉にする（合計＝明細の和）", () => {
    const text = explainOf(
      "              - { type: compare, operator: equals, field: lines, aggregate: sum, of: amount }",
    );
    expect(text).toContain("明細 の合計 と同じ値");
  });

  it("相手が書いていなければ、そう言う（黙って通ることを隠さない）", () => {
    expect(explainOf("              - { type: compare, operator: gte }")).toContain(
      "比べる相手が書いてありません",
    );
  });
});

describe("同梱の例", () => {
  it("すべての例が説明できて、中身が空にならない", () => {
    const dir = "../spec/examples";
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".yaml"))) {
      const source = readFileSync(`${dir}/${file}`, "utf8");
      const document = /^\s*app\s*:/m.test(source)
        ? explainApp(parseAppYaml(source, { strict: true }))
        : explain(source);
      expect(document.headline, file).not.toBe("");
      expect(document.sections.length, file).toBeGreaterThan(1);
      // 空の見出しを出さない（読む側に「何も無い節」を見せない）。
      for (const section of document.sections) {
        expect(section.lines.length, `${file} / ${section.title}`).toBeGreaterThan(0);
      }
      // 説明にキー名の羅列を出していない（読み手は DSL を知らない）。
      expect(renderExplain(document), file).not.toContain("visibleWhen");
    }
  });
});

describe("明細の行を畳む計算の読み返し", () => {
  const YAML = `page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - field: lines
            label: 明細
            type: subTable
            fields:
              - { field: productName, label: 品名 }
              - { field: amount, label: 金額, type: number }
      - title: 金額
        fields:
          - { field: subtotal, label: 小計, computed: { op: sum, field: lines, of: amount } }
          - { field: rows, label: 行数, computed: { op: count, field: lines } }
          - { field: total, label: 合計, computed: { op: sum, fields: [subtotal] } }
`;

  it("何を畳むのかを名前で言う（行のラベルも使う）", () => {
    const text = renderExplain(explainSource(YAML));

    // 「自動で計算する」では、レビューする人に何も伝わらない。
    expect(text).toContain("小計 … 明細 の 金額 の合計（手では入れない）");
    expect(text).toContain("行数 … 明細 の件数（手では入れない）");
    // 同じレコードの項目を畳む形は今までどおりの言い方。
    expect(text).toContain("合計 … 他の項目から自動で計算する（手では入れない）");
  });

  it("英語でも同じことを言う", () => {
    const text = renderExplain(explainSource(YAML, { lang: "en" }));

    expect(text).toContain("小計 … the total of 金額 in 明細 (not typed in)");
    expect(text).toContain("行数 … the number of rows in 明細 (not typed in)");
  });
});

describe("行を絞ってから畳む・並べて1行にする", () => {
  const source = `page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - field: lines
            label: 明細
            type: subTable
            fields:
              - { field: item, label: 品名 }
              - { field: amount, label: 金額, type: number }
              - { field: cancelled, label: 取消, type: checkbox }
      - title: 金額
        fields:
          - { field: subtotal, label: 小計,
              computed: { op: sum, field: lines, of: amount,
                          where: { field: cancelled, operator: notEquals, value: true } } }
          - { field: itemNames, label: 品名,
              computed: { op: join, field: lines, of: item, separator: "、" } }
`;

  it("何で絞ったかまで言う（合計が合わない相談のほとんどはこれ）", () => {
    const text = renderExplain(explainSource(source));
    expect(text).toContain(
      "小計 … 明細 の 金額 の合計（手では入れない）、取消 が true でないときの行だけ",
    );
  });

  it("並べる計算は「合計」と別の言い方をする（文字が出るので）", () => {
    expect(renderExplain(explainSource(source))).toContain("品名 … 明細 の 品名 を並べたもの（手では入れない）");
  });

  it("英語も同じことを言う", () => {
    const text = renderExplain(explainSource(source, { lang: "en" }));
    expect(text).toContain(
      "the total of 金額 in 明細 (not typed in), only rows where 取消 is not true",
    );
    expect(text).toContain("the 品名 of every row in 明細, listed (not typed in)");
  });
});

describe("突き合わせも「何で絞ったか」を言う", () => {
  const source = `page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - field: lines
            label: 明細
            type: subTable
            fields:
              - { field: amount, label: 金額, type: number }
              - { field: cancelled, label: 取消, type: checkbox }
          - field: total
            label: 合計
            type: number
            validators:
              - { type: compare, operator: equals, field: lines, aggregate: sum, of: amount,
                  where: { field: cancelled, operator: notEquals, value: true } }
`;

  it("計算と同じ言い方で絞り込みを言う（通った理由が読めるように）", () => {
    expect(renderExplain(explainSource(source))).toContain(
      "合計 … 数値、明細 の合計（取消 が true でないときの行だけ） と同じ値",
    );
  });

  it("英語も同じことを言う（集約の英語は the で始まるので重ねない）", () => {
    expect(renderExplain(explainSource(source, { lang: "en" }))).toContain(
      "the same value as the total of 明細 (only rows where 取消 is not true)",
    );
  });
});

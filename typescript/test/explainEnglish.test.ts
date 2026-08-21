import { describe, expect, it } from "vitest";
import {
  briefSource,
  explainMarkdown,
  explainSource,
  renderBrief,
  renderExplain,
  voice,
} from "../src/index.js";
import { runCli, type CliIo } from "../src/cli.js";

/// 説明を英語で出す（`explain --lang en`）。
///
/// ここで守るのは4つ。**定義に書いてある言葉は訳さない**（ラベルは業務の言葉で、
/// 訳すと現場と違うものを指す）・**語彙は spec の en を使う**・**日本語の出力は
/// 1文字も変わらない**（既存の試験が全部それを見ている）・**半分だけ英語にしない**
/// （まだ英語にできない道具に `--lang en` を渡したら落ちる）。
const PAGE = `
page:
  type: crud
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  search:
    filters:
      - { field: status, label: 状態, type: select, operator: equals,
          options: [{ value: open, label: 未出荷 }] }
  table:
    rowActions: [edit, delete]
    columns:
      - { field: orderNo, label: 受注番号, sortable: true }
      - { field: amount, label: 金額, type: number, format: currency }
  form:
    sections:
      - title: 基本
        fields:
          - { field: orderNo, label: 受注番号, required: true,
              validators: [{ type: maxLength, value: 20 }] }
          - { field: kind, label: 区分, type: select,
              options: [{ value: corp, label: 法人 }, { value: person, label: 個人 }] }
          - { field: billTo, label: 請求先, requiredWhen: { field: kind, value: corp } }
          - { field: memo, label: 備考, type: textarea, readOnly: true }
          - { field: total, label: 合計, type: number,
              computed: { op: sum, field: amount }, normalize: [toHankaku] }
  actions:
    - id: save
      type: create
      label: 登録
      onSuccess: { message: 登録しました }
    - id: reject
      type: plugin
      plugin: rejectOrders
      label: 却下
      scope: selection
      confirm: { message: 戻せません }
      prompt:
        fields: [{ field: reason, label: 理由, required: true }]
      onError: { message: 却下できませんでした }
      roles: [admin]
`;

const APP = `
app:
  id: sales
  title: 販売管理
  home: order_search
  theme: { primaryColor: "#1B5E20" }
  menu:
    - group: マスタ
      items:
        - { label: 単価, page: price_master, roles: [admin] }
    - { id: orders, label: 受注照会, page: order_search }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      key: orderNo
      table:
        columns: [{ field: orderNo, label: 受注番号 }]
    - type: master
      id: price_master
      title: 単価マスタ
      repository: priceRepository
      key: itemCode
      table:
        columns: [{ field: itemCode, label: 品目 }]
      form:
        sections: [{ fields: [{ field: itemCode, label: 品目 }] }]
`;

const REPORT = `
page:
  type: report
  id: sales_report
  title: 売上明細表
  repository: orderRepository
  table:
    columns: [{ field: amount, label: 金額, type: number }]
  report:
    paper: { size: A4, orientation: landscape }
    rowsPerPage: 40
    sort: { field: orderDate, ascending: false }
    groupBy: [{ field: customerName, label: 得意先, pageBreak: true }]
    totals: [{ field: amount, aggregate: sum }]
    limit: 5000
`;

const en = (source: string, page?: string) =>
  renderExplain(explainSource(source, { page, lang: "en" }));

function fakeIo(files: Record<string, string>): CliIo & {
  stdout: string[];
  stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    out: (text) => stdout.push(text),
    err: (text) => stderr.push(text),
    readFile: (path) => {
      const found = files[path];
      if (found === undefined) throw new Error(`no such file: ${path}`);
      return found;
    },
    writeFile: () => {},
    listFiles: () => null,
  };
}

describe("explain --lang en", () => {
  it("節の見出しと文が英語になる", () => {
    const text = en(PAGE);

    expect(text).toContain("受注入力 (order_entry) — search, list, and create");
    expect(text).toContain("## Data");
    expect(text).toContain("Data comes from orderRepository");
    expect(text).toContain("One record is addressed by orderNo.");
    expect(text).toContain("## Filters");
    expect(text).toContain("## Columns in the list");
    expect(text).toContain("## What can be done");
    expect(text).toContain("## Per-row actions (on every row)");
  });

  it("定義に書いてある言葉は訳さない（ラベルは業務の言葉）", () => {
    const text = en(PAGE);

    // 項目名・ボタン名・選択肢・メッセージはそのまま。
    expect(text).toContain("受注番号");
    expect(text).toContain("却下");
    expect(text).toContain("未出荷");
    expect(text).toContain('then says "登録しました"');
    // 枠の見出しも定義のもの。
    expect(text).toContain("## 基本");
  });

  it("項目の注記が英語になる（型・必須・条件・検証・正規化）", () => {
    const text = en(PAGE);

    expect(text).toContain("受注番号 … required, at most 20 characters");
    expect(text).toContain("備考 … multi-line, read-only");
    expect(text).toContain("請求先 … required only when 区分 is 法人");
    expect(text).toContain("区分 … a choice, one of 法人 / 個人");
    expect(text).toContain("computed from other fields (not typed in)");
    expect(text).toContain("tidied before saving (full-width to half-width)");
  });

  it("ボタンの1行が英語で組める（聞く・一括・失敗・権限）", () => {
    const text = en(PAGE);

    expect(text).toContain(
      "却下 … calls the application's own code (rejectOrders)" +
        "; runs on the rows the user checked (at most 50 at a time)" +
        "; asks for 理由 first" +
        '; on failure says "却下できませんでした"' +
        "; shown to admin only",
    );
  });

  it("列と見せ方も英語（フォーマッタは spec の言い方）", () => {
    const text = en(PAGE);

    expect(text).toContain("受注番号 (sortable)");
    expect(text).toContain("金額 (shown as ¥1,234,567)");
    expect(text).toContain("paged 50 rows at a time");
  });

  it("帳票の体裁が英語になる", () => {
    const text = en(REPORT);

    expect(text).toContain("## Paper layout");
    expect(text).toContain("A4 landscape, 40 rows per sheet");
    expect(text).toContain("printed in descending order of orderDate");
    expect(text).toContain("a subtotal where 得意先 (customerName) changes, starting a new sheet");
    expect(text).toContain("totals for amount (the total)");
    expect(text).toContain("at most 5000 rows per run");
  });

  it("app 全体も英語（メニュー・画面・開ける人）", () => {
    const text = en(APP);

    expect(text).toContain("販売管理 (sales) — an app of 2 screens");
    expect(text).toContain("## Menu");
    expect(text).toContain("## Screens");
    expect(text).toContain("## Opens first");
    expect(text).toContain("## Who can open which screen");
    expect(text).toContain("受注照会 (order_search) … anyone");
    expect(text).toContain("単価マスタ (price_master) … admin only");
    expect(text).toContain("## Look and feel");
    expect(text).toContain("a theme is set");
  });

  it("1枚の「開ける人」も英語", () => {
    const text = en(APP, "price_master");

    expect(text).toContain("## Who can open this screen");
    expect(text).toContain("Can open … admin only");
    expect(text).toContain('entry "単価" (the menu) … only admin can pass');
  });

  it("1行の要約も英語", () => {
    const one = briefSource(PAGE, { lang: "en" });
    expect(renderBrief(one)).toBe(
      "受注入力 (order_entry) … search + list + create/update/delete. " +
        "1 filter, 2 columns, 5 fields (1 required), 2 buttons, " +
        "1 field shown by condition, some things are shown by role, from orderRepository",
    );

    const app = briefSource(APP, { lang: "en" });
    expect(renderBrief(app)).toContain("販売管理 (sales) — 2 screens");
  });

  it("PR 本文の形でも英語（折りたたみの件数まで）", () => {
    const markdown = explainMarkdown(explainSource(PAGE, { lang: "en" }));

    expect(markdown).toContain("## 受注入力 (order_entry) —");
    expect(markdown).toContain("### Data");
    // 8行を超える節は折りたたみ、その件数の書き方も言語による。
    expect(explainMarkdown(explainSource(APP, { lang: "en" }))).not.toContain("件）");
  });

  it("日本語は1文字も変わらない（既定は ja）", () => {
    const ja = renderExplain(explainSource(PAGE));
    expect(ja).toContain("データの出どころは orderRepository（アプリ側が用意する）。");
    expect(ja).toContain("請求先 … 区分 が 法人 のときだけ必須");
    expect(ja).toContain("金額（¥1,234,567 のように見せる）");
    expect(ja).toBe(renderExplain(explainSource(PAGE, { lang: "ja" })));
  });

  it("言い回しの表は両方の言語がそろっている", () => {
    const ja = voice("ja");
    const enWords = voice("en");
    expect(Object.keys(enWords)).toEqual(Object.keys(ja));
    for (const [key, value] of Object.entries(enWords)) {
      if (typeof value === "string") {
        expect(value.trim(), key).not.toBe("");
      } else {
        expect(typeof value, key).toBe("function");
      }
    }
  });

  it("知らない言語は黙って日本語にしない", () => {
    const io = fakeIo({ "page.yaml": PAGE });
    expect(runCli(["explain", "page.yaml", "--lang", "fr"], io)).toBe(1);
    expect(io.stderr.join("")).toContain("--lang は ja か en です");
    expect(io.stdout).toEqual([]);
  });

  it("まだ英語にできない道具では、半分だけ英語にせず落ちる", () => {
    const io = fakeIo({ "page.yaml": PAGE });
    expect(
      runCli(["explain", "page.yaml", "--review", "--lang", "en"], io),
    ).toBe(1);
    expect(io.stderr.join("")).toContain("--lang en は説明");
  });

  it("CLI から英語で出せる（--markdown と組める）", () => {
    const io = fakeIo({ "page.yaml": PAGE });
    expect(
      runCli(["explain", "page.yaml", "--lang", "en", "--markdown"], io),
    ).toBe(0);
    expect(io.stdout.join("\n")).toContain("### What can be done");
  });
});

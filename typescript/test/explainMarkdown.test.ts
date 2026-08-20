import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  briefMarkdown,
  briefSource,
  definitionDiffMarkdown,
  diffDefinitions,
  escapeMarkdown,
  explainDiffMarkdown,
  explainDiffSources,
  explainMarkdown,
  explainSource,
  reviewMarkdown,
  reviewSource,
} from "../src/index.js";

const PAGE = `
page:
  type: crud
  id: order_list
  title: 受注一覧
  repository: orderRepository
  key: orderNo
  search:
    filters: [{ field: orderNo, label: 受注番号 }]
  table:
    columns:
      - { field: orderNo, label: 受注番号, sortable: true }
      - { field: amount, label: 金額, type: number, format: currency }
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true }
  actions:
    - { id: create, type: create, label: 新規登録 }
`;

/** 列を n 本持つ一覧（節の折りたたみを試すため）。 */
const wide = (count: number): string => `
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  search:
    filters: [{ field: orderNo, label: 受注番号 }]
  table:
    columns:
${Array.from({ length: count }, (_, i) => `      - { field: c${i}, label: 列${i} }`).join("\n")}
`;

describe("PR 本文の形（Markdown）", () => {
  it("見出しは h2 から、節は h3、行は箇条書き", () => {
    const text = explainMarkdown(explainSource(PAGE));
    expect(text.split("\n")[0]).toBe(
      "## 受注一覧（order_list）— 検索して一覧に出し、その場で登録・修正・削除までできる画面",
    );
    expect(text).toContain("### 絞り込める条件");
    expect(text).toContain("- 受注番号 … 部分一致");
    // h1 は使わない（本文の題は PR の題）。
    expect(text).not.toMatch(/^# /m);
  });

  it("節の見出しの後には空行を入れる（無いと箇条書きが読まれない）", () => {
    const text = explainMarkdown(explainSource(PAGE));
    expect(text).toMatch(/### 絞り込める条件\n\n- /);
  });

  it("長い節は折りたたむ（レビューの本題が埋まらないように）", () => {
    const text = explainMarkdown(explainSource(wide(12)));
    expect(text).toContain("<details>");
    expect(text).toContain("<summary><b>一覧に出る列</b>（13 件）</summary>");
    // summary の直後の空行が無いと、中の箇条書きが Markdown として読まれない。
    expect(text).toMatch(/<\/summary>\n\n- /);
    expect(text).toContain("</details>");
  });

  it("短い節は折りたたまない", () => {
    const text = explainMarkdown(explainSource(PAGE));
    expect(text).not.toContain("<details>");
  });

  describe("HTML として食われる文字", () => {
    it("地の文の < > & は逃がす", () => {
      expect(escapeMarkdown("hatake explain <file> --page <id>")).toBe(
        "hatake explain &lt;file&gt; --page &lt;id&gt;",
      );
      expect(escapeMarkdown("A & B")).toBe("A &amp; B");
    });

    it("`` で囲んだ中は触らない（そのまま見せたい所なので）", () => {
      expect(escapeMarkdown("`<file>` を渡す")).toBe("`<file>` を渡す");
      expect(escapeMarkdown("`a < b` と <c>")).toBe("`a < b` と &lt;c&gt;");
    });

    it("app の説明の「<file>」が消えない", () => {
      const app = `
app:
  id: sales
  title: 受注
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      table:
        columns: [{ field: orderNo, label: 受注番号 }]
`;
      const text = explainMarkdown(explainSource(app));
      expect(text).toContain("hatake explain &lt;file&gt; --page &lt;id&gt;");
      expect(text).not.toContain("<file>");
    });
  });

  it("1行の要約（app）は表にする（端末向けの桁揃えは貼ると崩れる）", () => {
    const app = `
app:
  id: sales
  title: 受注
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      search:
        filters: [{ field: orderNo, label: 受注番号 }]
      table:
        columns: [{ field: orderNo, label: 受注番号 }]
`;
    const text = briefMarkdown(briefSource(app));
    expect(text).toContain("| id | 画面 | 何の画面か | 規模 |");
    expect(text).toContain("|---|---|---|---|");
    expect(text).toContain("| `order_search` | 受注照会 | 照会（読み取り専用）");
  });

  it("表の中の | は逃がす（桁が壊れる）", () => {
    const brief = briefSource(`
app:
  id: sales
  title: 受注
  pages:
    - type: search
      id: order_search
      title: 受注照会 | 旧
      repository: orderRepository
      table:
        columns: [{ field: orderNo, label: 受注番号 }]
`);
    expect(briefMarkdown(brief)).toContain("| 受注照会 \\| 旧 |");
  });

  it("レビュー1枚は、助言の節と「警告ではない」の注記を持つ", () => {
    const text = reviewMarkdown(reviewSource(PAGE));
    expect(text).toContain("### 書き足したほうがいい所（助言）");
    // 注記は引用（PR 本文で埋もれない）。
    expect(text).toMatch(/^> ※ ここは\*\*助言\*\*/m);
  });

  it("物差しを渡したときは、そう書く", () => {
    const text = reviewMarkdown(reviewSource(PAGE), { rulesFrom: "team.json" });
    expect(text).toContain("> 助言の物差しは team.json を使いました");
  });

  describe("変更（explain --diff）", () => {
    const after = PAGE.replace("label: 金額, type: number, format: currency", "label: 税抜金額, type: number, format: currency");

    it("件数を先に言い、節ごとにまとめる", () => {
      const text = explainDiffMarkdown(explainDiffSources(PAGE, after));
      expect(text).toContain("変わったところ **");
      expect(text).toContain("### 一覧に出る列");
    });

    it("前と後は `` で囲む（値がそのまま読める）", () => {
      const text = explainDiffMarkdown(explainDiffSources(PAGE, after));
      expect(text).toMatch(/前: `.*金額/);
      expect(text).toMatch(/後: `.*税抜金額/);
    });

    it("変わらないときも、後方互換の話はしないと書く", () => {
      const text = explainDiffMarkdown(explainDiffSources(PAGE, PAGE));
      expect(text).toContain("見え方は変わりません。");
      expect(text).toMatch(/^> ※ ここは\*\*見え方\*\*/m);
    });
  });

  describe("後方互換の判定（diff）は表にする", () => {
    const before = parseYaml(PAGE) as Record<string, unknown>;

    it("変わらなければ、表を出さずにそう言う", () => {
      const text = definitionDiffMarkdown(diffDefinitions(before, before));
      expect(text).toContain("後方互換です");
      expect(text).toContain("変わりません。");
      expect(text).not.toContain("| 影響 |");
    });

    // ラベルだけの変更は diff には出ない（見え方の話は explain --diff の担当）。
    // 列を増やすのは「目で見て確かめてほしい変更」。
    it("変わったところは表にする（件数を先に言う）", () => {
      const after = parseYaml(
        PAGE.replace(
          "      - { field: amount, label: 金額, type: number, format: currency }",
          "      - { field: amount, label: 金額, type: number, format: currency }\n      - { field: memo, label: 備考 }",
        ),
      ) as Record<string, unknown>;
      const diff = diffDefinitions(before, after);
      const text = definitionDiffMarkdown(diff);
      expect(text).toMatch(/^## 定義の変更 — /m);
      expect(text).toContain(`変わったところ **${diff.changes.length} 件**`);
      expect(text).toContain("| 影響 | 区分 | 場所 | 内容 |");
      // 場所は道のまま（`` で囲む）。
      expect(text).toMatch(/\| `[\w.]+` \|/);
    });

    it("壊す変更はそう書く", () => {
      const after = parseYaml(
        PAGE.replace("required: true", "required: true, validators: [{ type: maxLength, value: 5 }]"),
      ) as Record<string, unknown>;
      const text = definitionDiffMarkdown(diffDefinitions(after, before));
      expect(text).toContain("## 定義の変更 — 後方互換");
    });
  });

  it("Markdown でも、言っている中身は端末向けと同じ", () => {
    // 形だけの違いであることを縛る（片方にしか出ない節があると、貼った先で情報が減る）。
    const document = explainSource(PAGE);
    const text = explainMarkdown(document);
    for (const section of document.sections) {
      expect(text).toContain(section.title);
      for (const line of section.lines) {
        expect(text).toContain(escapeMarkdown(line));
      }
    }
    expect(parseYaml("a: 1")).toEqual({ a: 1 });
  });
});

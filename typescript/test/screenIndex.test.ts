import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildIndex,
  type IndexInput,
  renderIndex,
  searchIndex,
  sizeOf,
} from "../src/index.js";

const dir = "../spec/examples";
const shipped: IndexInput[] = readdirSync(dir)
  .filter((file) => file.endsWith(".yaml"))
  .map((file) => ({ file, source: readFileSync(`${dir}/${file}`, "utf8") }));

const index = buildIndex(shipped);

const PAGE = `page:
  type: crud
  id: order_list
  title: 受注一覧
  repository: orderRepository
  key: orderNo
  search:
    filters:
      - { field: customer, label: 得意先 }
  table:
    columns:
      - { field: orderNo, label: 受注番号 }
      - { field: amount, label: 金額, type: number, format: currency }
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true }
  actions:
    - { id: csv, type: export, label: CSV出力 }
`;

describe("画面の索引", () => {
  it("app の中身も1枚ずつ数える（ファイル単位ではなく画面単位）", () => {
    // 同梱は11ファイル。うち sales_app が8枚を持つので、画面は18枚になる。
    expect(shipped).toHaveLength(11);
    expect(index.screens).toHaveLength(18);
    expect(index.unreadable).toEqual([]);
  });

  it("1行の要約をそのまま持つ（索引のために別の語彙を作らない）", () => {
    const one = buildIndex([{ file: "page.yaml", source: PAGE }]).screens[0];
    expect(one.brief).toBe(
      "受注一覧（order_list）… 検索＋一覧＋登録・修正・削除。条件 1、列 2、項目 1（必須 1）、ボタン 1、orderRepository から",
    );
    expect(one.what).toBe("検索＋一覧＋登録・修正・削除");
    expect(one.counts).toEqual({
      filters: 1,
      columns: 2,
      sections: 1,
      fields: 1,
      required: 1,
      actions: 1,
    });
  });

  it("並びは「ファイル → id」で固定（同じ入力なら同じ索引）", () => {
    const again = buildIndex(shipped);
    expect(again.screens.map((s) => `${s.file}/${s.id}`)).toEqual(
      index.screens.map((s) => `${s.file}/${s.id}`),
    );
  });

  it("現場の言葉でも実装の言葉でも当たる", () => {
    const one = buildIndex([{ file: "page.yaml", source: PAGE }]);
    // ラベル（現場）と項目名（実装）の両方が語に入っている。
    expect(searchIndex(one, "得意先")).toHaveLength(1);
    expect(searchIndex(one, "customer")).toHaveLength(1);
    expect(searchIndex(one, "orderRepository")).toHaveLength(1);
    expect(searchIndex(one, "CSV出力")).toHaveLength(1);
  });

  it("語の AND で絞る", () => {
    expect(searchIndex(index, "顧客 検索").length).toBeGreaterThan(0);
    // 両方を含む画面だけ。片方しか無いものは落ちる。
    const both = searchIndex(index, "顧客 帳票");
    expect(both).toEqual([]);
  });

  it("種別は「検索」のような現場の言葉でも当たる（説明の語彙を使う）", () => {
    // master の見出し語は「マスタ保守」だが、説明の語彙は「検索・一覧・登録…」なので
    // 「検索」で探しても出る。
    const masters = searchIndex(index, "マスタ 検索").map((s) => s.kind);
    expect(masters).toContain("master");
  });

  it("当たらなければ空", () => {
    expect(searchIndex(index, "ブロックチェーン")).toEqual([]);
    expect(renderIndex([])).toContain("当てはまる画面はありません");
  });

  it("語が無ければ全件（並びはそのまま）", () => {
    expect(searchIndex(index)).toHaveLength(index.screens.length);
    expect(searchIndex(index, "   ")).toHaveLength(index.screens.length);
  });

  it("規模で並べ替えられる（大きい画面から見たいとき）", () => {
    const sorted = [...index.screens].sort((a, b) => sizeOf(b) - sizeOf(a));
    expect(sizeOf(sorted[0])).toBeGreaterThan(sizeOf(sorted[sorted.length - 1]));
    // 必須の数は規模に数えない（項目数に含まれているので二重に効く）。
    expect(
      sizeOf({
        ...index.screens[0],
        counts: { fields: 2, required: 2, controlled: 2 },
      }),
    ).toBe(2);
  });

  it("定義でないファイルは飛ばし、読めない定義は言う（索引は消さない）", () => {
    const result = buildIndex([
      { file: "pubspec.yaml", source: "name: demo\n" },
      { file: "broken.yaml", source: "page:\n  type: crud\n" }, // id / title が無い
      { file: "page.yaml", source: PAGE },
    ]);
    expect(result.ignored).toBe(1);
    expect(result.unreadable.map((one) => one.file)).toEqual(["broken.yaml"]);
    expect(result.screens).toHaveLength(1);
  });

  it("綴り間違いのある定義も索引に載せる（消すと余計に探せない）", () => {
    const typo = PAGE.replace("label: 金額", "label: 金額, witdh: 140");
    const result = buildIndex([{ file: "page.yaml", source: typo }]);
    expect(result.screens).toHaveLength(1);
    expect(result.unreadable).toEqual([]);
  });

  it("人が読む形は画面名の桁が揃う（目で追える表になる）", () => {
    const screens = index.screens.slice(0, 3);
    const lines = renderIndex(screens, { showFile: false }).split("\n").slice(1);
    // 画面名がどの行でも同じ桁から始まる（id の長さがバラバラでも）。
    const columns = lines.map((line, at) => line.indexOf(screens[at].title));
    expect(new Set(columns).size).toBe(1);
    expect(columns[0]).toBeGreaterThan(0);
  });
});

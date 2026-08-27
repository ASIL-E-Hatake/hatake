import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  appDiagram,
  computedGraph,
  graphOfDiagram,
  hasLateDependency,
  parseAppSource,
  toDot,
  toMermaid,
} from "../src/index.js";

/// 計算の依存を絵にする（`hatake diagram --computed`）と、図を貼れる形で出す。
///
/// ここで守るのは3つ。**依存は定義から読める**（`fields` / `field` + `of` / `where`）・
/// **順番が逆の線は赤で出る**（`computed-order` の警告と同じ判定＝2つの言い方をしない）・
/// **貼れる形は箱の中身まで運ぶ**（見出しだけの箱が並んだ図は、貼っても読めない）。
type Dict = Record<string, unknown>;

const pageOf = (yaml: string): Dict =>
  (parseYaml(yaml) as { page: Dict }).page;

/** 小計 → 消費税 → 合計（正しい順）と、明細の行の計算。 */
const ORDERED = `
page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - { field: lines, label: 明細, type: subTable, fields: [
                { field: qty, label: 数量, type: number },
                { field: price, label: 単価, type: number },
                { field: cancelled, label: 取消, type: boolean },
                { field: amount, label: 金額, type: number,
                  computed: { op: product, fields: [qty, price] } } ] }
          - { field: subtotal, label: 小計, type: number,
              computed: { op: sum, field: lines, of: amount,
                          where: { field: cancelled, operator: notEquals, value: true } } }
          - { field: tax, label: 消費税, type: number,
              computed: { op: consumptionTax, fields: [subtotal] } }
          - { field: total, label: 合計, type: number,
              computed: { op: sum, fields: [subtotal, tax] } }
`;

/** 合計を先に書いてしまった形（計算は書いた順に1回なので空のまま計算される）。 */
const LATE = ORDERED.replace(
  `          - { field: subtotal, label: 小計, type: number,
              computed: { op: sum, field: lines, of: amount,
                          where: { field: cancelled, operator: notEquals, value: true } } }
          - { field: tax, label: 消費税, type: number,
              computed: { op: consumptionTax, fields: [subtotal] } }
          - { field: total, label: 合計, type: number,
              computed: { op: sum, fields: [subtotal, tax] } }`,
  `          - { field: total, label: 合計, type: number,
              computed: { op: sum, fields: [subtotal, tax] } }
          - { field: subtotal, label: 小計, type: number,
              computed: { op: sum, field: lines, of: amount } }
          - { field: tax, label: 消費税, type: number,
              computed: { op: consumptionTax, fields: [subtotal] } }`,
);

const edge = (graph: ReturnType<typeof computedGraph>, from: string, to: string) =>
  graph.edges.find((one) => one.from === from && one.to === to);

describe("計算の依存", () => {
  it("どの項目がどの項目から出るかを線にする", () => {
    const graph = computedGraph(pageOf(ORDERED));

    // 同じレコードの項目を畳む（① fields）。
    expect(edge(graph, "subtotal", "tax")).toBeDefined();
    expect(edge(graph, "subtotal", "total")).toBeDefined();
    expect(edge(graph, "tax", "total")).toBeDefined();
    // 明細の行を畳む（② field + of）＝行から親へ1本。
    expect(edge(graph, "lines.amount", "subtotal")?.label).toBe("sum");
    // 行の中の計算も同じ絵に入る。
    expect(edge(graph, "lines.qty", "lines.amount")).toBeDefined();
    // 正しい順なら赤い線は無い。
    expect(hasLateDependency(graph)).toBe(false);
  });

  it("畳む前の絞り込みも、行の項目を読んでいるので線にする", () => {
    const graph = computedGraph(pageOf(ORDERED));
    const filter = edge(graph, "lines.cancelled", "subtotal");
    expect(filter?.label).toBe("絞り込み");
    // 値の流れではないので細い線（貼ったときに主線と区別できる）。
    expect(filter?.back).toBe(true);
  });

  it("順番が逆の線を赤で出す（どこを動かせばいいかが1枚で見える）", () => {
    const graph = computedGraph(pageOf(LATE));

    expect(hasLateDependency(graph)).toBe(true);
    const late = graph.edges.filter((one) => one.warn === true);
    expect(late.map((one) => `${one.from}→${one.to}`)).toEqual([
      "subtotal→total",
      "tax→total",
    ]);
    expect(late[0].label).toBe("順番が逆");
    // 受け側の箱も赤にする（線だけだと、どの項目が壊れているのか読めない）。
    expect(graph.nodes.find((one) => one.id === "total")?.tone).toBe("warn");
  });

  it("この画面に無い項目も箱にする（書いたつもりの依存を消さない）", () => {
    const graph = computedGraph(
      pageOf(`
page:
  type: form
  id: x
  title: X
  repository: xRepository
  form:
    sections:
      - fields:
          - { field: total, label: 合計, computed: { op: sum, fields: [subtotl] } }
`),
    );
    const ghost = graph.nodes.find((one) => one.id === "subtotl");
    expect(ghost?.note).toBe("この画面に無い項目");
    expect(ghost?.tone).toBe("outside");
  });

  it("計算が無ければ空の図（呼ぶ側が「描くものが無い」と言える）", () => {
    const graph = computedGraph(
      pageOf(`
page:
  type: form
  id: x
  title: X
  repository: xRepository
  form:
    sections: [{ fields: [{ field: name, label: 名前 }] }]
`),
    );
    expect(graph.nodes).toEqual([]);
    expect(graph.subtitle).toContain("計算項目はありません");
  });

  it("同梱の例（受注入力）でも線が引ける", () => {
    const graph = computedGraph(
      pageOf(readFileSync("../spec/examples/order_entry.yaml", "utf8")),
    );
    expect(edge(graph, "lines.amount", "subtotal")).toBeDefined();
    expect(hasLateDependency(graph)).toBe(false);
  });
});

describe("貼れる形（Mermaid / DOT）", () => {
  const graph = computedGraph(pageOf(LATE), { title: "受注入力: 計算の依存" });

  it("Mermaid はフェンスを付けない（貼る側が決める）", () => {
    const text = toMermaid(graph);
    expect(text.startsWith("%% 受注入力: 計算の依存")).toBe(true);
    expect(text).not.toContain("```");
    expect(text).toContain("flowchart LR");
    expect(text).toContain('subtotal -.->|順番が逆| total');
    // 赤い線は太さも変える（色だけだと白黒で刷ったときに消える）。
    expect(text).toContain("stroke-width:2px");
  });

  it("DOT は Graphviz に渡せる形", () => {
    const text = toDot(graph);
    expect(text).toContain("digraph hatake {");
    expect(text).toContain("rankdir=LR;");
    expect(text).toMatch(/subtotal -> total \[label="順番が逆", color="#d93025"/);
    expect(text.trimEnd().endsWith("}")).toBe(true);
  });

  it("名前は機械が作る（日本語の id でも壊れない・同じ名前に潰れない）", () => {
    const text = toMermaid({
      title: "t",
      nodes: [
        { id: "受注 番号", label: "受注番号" },
        { id: "受注/番号", label: "もう1つ" },
      ],
      edges: [{ from: "受注 番号", to: "受注/番号" }],
    });
    // 同じ形に潰れる id が2つあっても、線が繋ぎ変わらないこと。
    const names = [...text.matchAll(/^ {2}(\w+)\["/gm)].map((one) => one[1]);
    expect(new Set(names).size).toBe(2);
    expect(text).toContain(`${names[0]} --> ${names[1]}`);
  });

  it("画面の図も同じ出し口を通る（箱の中身まで運ぶ）", () => {
    const source = readFileSync("../spec/examples/sales_app.yaml", "utf8");
    const parsed = parseAppSource(source);
    const picture = appDiagram(parsed.app, parseYaml(source) as Dict, {});
    const text = toMermaid(graphOfDiagram(picture));

    // 箱の中の「誰が開けるか」が落ちていないこと（落ちると副題が嘘になる）。
    expect(picture.subtitle).toContain("箱の中は誰が開けるか");
    expect(text).toContain("<br/>");
    expect(text).toMatch(/order_search\["受注照会<br\/>/);
    // 遷移の線と札。
    expect(text).toContain("order_search -->|詳細| order_detail");
  });
});

// 図を**貼れる形**で出す（Mermaid / DOT）。
//
// なぜ要るか: SVG は貼れる場所が限られる（PR の本文にも Wiki にも貼れない）。貼れない形の
// 図は結局共有されないので、道具が出した図が読まれない。Mermaid は GitHub がそのまま
// 描くので PR に貼れて、DOT は Graphviz に渡せる。
//
// もう1つの理由: **依存の図は縦積みの作図器では描けない**（合計は小計と消費税の両方から
// 来る＝行を飛ぶ線が出る）。レイアウトを向こうに任せられる形が要る。
//
// 決めごと:
//   ・**同じ図を2つの言葉で言わない。** 画面の図（[appDiagram] が作る [Diagram]）も
//     依存の図（[computedGraph]）も、いったん [TextGraph] に寄せてから文字にする
//     ＝出し方（Mermaid / DOT）は1か所。
//   ・**名前は機械が作る。** ノードの id は日本語も入るので、Mermaid / DOT で使える形に
//     直す（人が読むのは label）。同じ id が2つの名前に落ちないように連番で逃がす。
//   ・**色は意味を持つ**（赤＝気をつける所）。凡例は出さない（図の中の言葉で分かる形に
//     しておく方が、貼ったときに崩れない）。

import type { Diagram, DiagramBox } from "./diagram.js";

/** 箱1つ。 */
export interface TextNode {
  /** 線を引くときの名前（図の中で重複させない）。 */
  id: string;
  label: string;
  /** 箱の中の小さい字（1行）。 */
  note?: string;
  /**
   * 箱の中の箇条書き（[DiagramBox.lines] と同じ形。先頭が `+` なら○、`!` なら×）。
   *
   * ここを落とすと「箱の中は誰が開けるか」のような**図の本文**が消える（見出しだけの
   * 箱が並んだ図になり、貼っても読めない）。
   */
  lines?: string[];
  /** 色味（[DiagramBox.tone] と同じ語彙）。 */
  tone?: DiagramBox["tone"];
}

/** 線1本。 */
export interface TextEdge {
  from: string;
  to: string;
  label?: string;
  /** 細い線（戻り・補助）。 */
  back?: boolean;
  /** 気をつける線（順番が逆・誰でも通れる等）。赤で出す。 */
  warn?: boolean;
}

/** 図1枚（レイアウトは持たない＝並べ方は描く側の仕事）。 */
export interface TextGraph {
  title: string;
  subtitle?: string;
  nodes: TextNode[];
  edges: TextEdge[];
}

/** 出せる形。 */
export const graphFormats = ["mermaid", "dot"] as const;
export type GraphFormat = (typeof graphFormats)[number];

const TONE_FILL: Record<NonNullable<DiagramBox["tone"]>, string> = {
  input: "#e8f0fe",
  core: "#e6f4ea",
  output: "#fff7e0",
  outside: "#f1f3f4",
  warn: "#fce8e6",
};

const TONE_LINE: Record<NonNullable<DiagramBox["tone"]>, string> = {
  input: "#4285f4",
  core: "#34a853",
  output: "#f9ab00",
  outside: "#9aa0a6",
  warn: "#d93025",
};

/** Mermaid / DOT で使える名前にする（人が読むのは label）。 */
function safeNames(nodes: TextNode[]): Map<string, string> {
  const names = new Map<string, string>();
  const used = new Set<string>();
  nodes.forEach((node, index) => {
    const base = node.id.replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+/, "");
    let name = base === "" ? `n${index}` : base;
    // 潰れた名前が既に在れば連番で逃がす（別の箱が同じ名前になると線が繋ぎ変わる）。
    while (used.has(name)) name = `${name}_${index}`;
    used.add(name);
    names.set(node.id, name);
  });
  return names;
}

/** 箱の中の行（`+` / `!` の印は○ / × に開く。SVG 側と同じ読み方）。 */
const bulleted = (line: string): string => {
  const mark = line.startsWith("!") ? "×" : line.startsWith("+") ? "○" : "・";
  const body = mark === "・" ? line : line.slice(1).trim();
  return `${mark} ${body}`;
};

/** 箱の中の文字を上から順に（見出し・小さい字・箇条書き）。 */
const boxLines = (node: TextNode): string[] => [
  node.label,
  ...(node.note === undefined ? [] : [node.note]),
  ...(node.lines ?? []).map(bulleted),
];

const quote = (text: string): string => text.replace(/"/g, "'");

/**
 * Mermaid（GitHub の本文にそのまま貼れる）。
 *
 * ```mermaid のフェンスは**付けない**（貼る側が決める。ファイルに書くときは要らない）。
 */
export function toMermaid(graph: TextGraph): string {
  const names = safeNames(graph.nodes);
  const out: string[] = [`%% ${graph.title}`];
  if (graph.subtitle !== undefined) out.push(`%% ${graph.subtitle}`);
  out.push("flowchart LR");
  for (const node of graph.nodes) {
    // Mermaid の箱の中の改行は <br/>（実体参照は使えない）。
    const text = boxLines(node).map(quote).join("<br/>");
    out.push(`  ${names.get(node.id)}["${text}"]`);
  }
  for (const edge of graph.edges) {
    const from = names.get(edge.from);
    const to = names.get(edge.to);
    if (from === undefined || to === undefined) continue;
    const line = edge.back === true || edge.warn === true ? "-.->" : "-->";
    const label = edge.label === undefined ? "" : `|${quote(edge.label)}|`;
    out.push(`  ${from} ${line}${label} ${to}`);
  }
  // 色は意味に付ける（tone が無い箱には何も付けない）。
  for (const tone of Object.keys(TONE_FILL) as NonNullable<DiagramBox["tone"]>[]) {
    const members = graph.nodes.filter((one) => one.tone === tone);
    if (members.length === 0) continue;
    out.push(
      `  classDef ${tone} fill:${TONE_FILL[tone]},stroke:${TONE_LINE[tone]},color:#202124`,
    );
    out.push(
      `  class ${members.map((one) => names.get(one.id)).join(",")} ${tone}`,
    );
  }
  graph.edges.forEach((edge, index) => {
    if (edge.warn !== true) return;
    out.push(`  linkStyle ${index} stroke:${TONE_LINE.warn},stroke-width:2px`);
  });
  return `${out.join("\n")}\n`;
}

/** DOT（Graphviz に渡す形）。 */
export function toDot(graph: TextGraph): string {
  const names = safeNames(graph.nodes);
  const out: string[] = [
    `// ${graph.title}`,
    ...(graph.subtitle === undefined ? [] : [`// ${graph.subtitle}`]),
    "digraph hatake {",
    "  rankdir=LR;",
    '  node [shape=box, style="rounded,filled", fontname="sans-serif"];',
    '  edge [fontname="sans-serif", fontsize=10];',
    `  label="${quote(graph.title)}";`,
    "  labelloc=t;",
  ];
  for (const node of graph.nodes) {
    const tone = node.tone;
    const paint =
      tone === undefined
        ? ""
        : `, fillcolor="${TONE_FILL[tone]}", color="${TONE_LINE[tone]}"`;
    // DOT の箱の中の改行は、ラベルの中の \n（ファイルには2文字で書く）。
    const text = boxLines(node).map(quote).join("\\n");
    out.push(`  ${names.get(node.id)} [label="${text}"${paint}];`);
  }
  for (const edge of graph.edges) {
    const from = names.get(edge.from);
    const to = names.get(edge.to);
    if (from === undefined || to === undefined) continue;
    const bits: string[] = [];
    if (edge.label !== undefined) bits.push(`label="${quote(edge.label)}"`);
    if (edge.warn === true) bits.push(`color="${TONE_LINE.warn}"`, "penwidth=2");
    else if (edge.back === true) bits.push('style=dashed, color="#9aa0a6"');
    const attrs = bits.length === 0 ? "" : ` [${bits.join(", ")}]`;
    out.push(`  ${from} -> ${to}${attrs};`);
  }
  out.push("}");
  return `${out.join("\n")}\n`;
}

/** 形を選んで文字にする。 */
export const renderGraph = (graph: TextGraph, format: GraphFormat): string =>
  format === "dot" ? toDot(graph) : toMermaid(graph);

/**
 * 画面の図（[Diagram]）を [TextGraph] に開く。
 *
 * 縦積みの図は「行の順番」でも意味を持たせているが、Mermaid / DOT では並べ方は
 * 向こうが決めるので、**箱と線だけ**を渡す（注記の行は箱にしない＝線の無い箱が
 * 浮くと、貼ったときに読めない）。
 */
export function graphOfDiagram(diagram: Diagram): TextGraph {
  const nodes: TextNode[] = [];
  const edges: TextEdge[] = [];
  let anonymous = 0;
  for (const row of diagram.rows) {
    if (row.kind === "boxes") {
      for (const box of row.items) {
        const id = box.id ?? `box${anonymous++}`;
        nodes.push({
          id,
          label: box.label,
          ...(box.note === undefined ? {} : { note: box.note }),
          ...(box.lines === undefined ? {} : { lines: box.lines }),
          ...(box.tone === undefined ? {} : { tone: box.tone }),
        });
      }
      continue;
    }
    if (row.kind === "links") {
      for (const link of row.items) {
        edges.push({
          from: link.from,
          to: link.to,
          ...(link.label === undefined ? {} : { label: link.label }),
          ...(link.back === true ? { back: true } : {}),
        });
      }
    }
  }
  return {
    title: diagram.title,
    ...(diagram.subtitle === undefined ? {} : { subtitle: diagram.subtitle }),
    nodes,
    edges,
  };
}

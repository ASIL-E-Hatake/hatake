// 助言を**定義の隣**で止める（`# advise-off: <規則>`）。
//
// 物差し（[AdviceRules]）は案件ぜんたいの決めごとなので、**1画面のための例外**が書けない。
// 1枚のために規則を切ると他の画面まで緩む＝結局その規則は死ぬ。だから「この画面では言わ
// なくていい」を、その画面の中に書けるようにする。
//
// 決めごと4つ:
//   ・**止められるのは助言だけ。** 警告（書いたのに効かない＝事実）は止められない。
//     好みは黙らせてよいが、事実を黙らせる口を作ると、定義が嘘をつけるようになる
//   ・**知らない規則名は落とす。** 物差しと同じ考え＝止めたつもりで止まっていない、が
//     いちばんまずい（誰も見ていない設定になる）
//   ・**黙らせた件数を必ず言う。** 消えた助言が見えないと、助言ゼロが「きれいな定義」に
//     見える。印と、それが何を消したかは毎回出す
//   ・**1件も消さなかった印は「効いていません」と言う。** 消し忘れた印・書く場所を
//     間違えた印は、そう言われなければ誰も気づけない
//
// 書く場所は**その画面の中**（`app:` なら `- id: …` の並びの中、単票なら定義のどこでも）。
// 画面の外に書いた印は**定義ぜんたい**に効く。どちらに効いたかは出力に出るので、思って
// いたのと違えばそこで分かる。

import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import { type Advice } from "./advise.js";
import { type AdviceRules, BUILTIN_RULES, DEFAULT_RULES } from "./adviseRules.js";
import { PROJECT_ADVICE_RULES } from "./projectAdvise.js";

/**
 * その定義で出うる助言の規則名の全部（組み込み＋前書き＋案件の決めごと）。
 *
 * 印を弾く相手はこれ。3つのうちどれかを忘れると、**正しい名前なのに落とす**道具になる
 * （案件の決めごとを止められないのは、止められないこと自体が分からないので特に悪い）。
 */
export const adviceRuleNames = (rules: AdviceRules = DEFAULT_RULES): string[] => [
  ...Object.keys(BUILTIN_RULES),
  ...PROJECT_ADVICE_RULES,
  ...rules.require.map((one) => one.rule),
];

/** 印1つ。 */
export interface AdviseOffMark {
  /** 止める規則名。 */
  rule: string;
  /** どの画面か。`undefined` = 定義ぜんたい。 */
  page?: string;
  /** なぜ止めるか（書いてあれば）。 */
  reason?: string;
  /** 何行目に書いてあるか（1 始まり）。 */
  line: number;
}

/** 印を当てた結果。 */
export interface SilencedAdvice {
  /** 残った助言。 */
  kept: Advice[];
  /** 黙らせた助言。 */
  silenced: Advice[];
  /** 読み取った印の全部。 */
  marks: AdviseOffMark[];
  /** 1件も黙らせなかった印（消し忘れ・場所違い）。 */
  idle: AdviseOffMark[];
}

export class AdviseOffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdviseOffError";
  }
}

/** 行頭のコメントだけを見る（値の中の `#` は印にしない）。 */
const MARK = /^[ \t]*#[ \t]*advise-off:[ \t]*(.+)$/;

/** 画面1枚の範囲（印がどの画面の中に書いてあるかを決めるため）。 */
interface PageRange {
  id: string;
  /** 中身の [始まり, 終わり)。**後ろに続くコメントは含めない**（次の画面の頭に書いた
   * つもりの印が、前の画面のものになるのを防ぐ）。 */
  start: number;
  end: number;
}

function pageRanges(source: string): PageRange[] {
  const document = parseDocument(source, { keepSourceTokens: false });
  const pages = document.getIn(["app", "pages"], true);
  if (!isSeq(pages)) return [];
  const found: PageRange[] = [];
  for (const item of pages.items) {
    if (!isMap(item)) continue;
    const range = item.range;
    if (range === undefined || range === null) continue;
    const id = item.items.find(
      (pair) => isScalar(pair.key) && pair.key.value === "id",
    )?.value;
    if (!isScalar(id) || typeof id.value !== "string") continue;
    found.push({ id: id.value, start: range[0], end: range[1] });
  }
  return found;
}

/**
 * 定義の文字列から印を読む。
 *
 * `known` はその定義で出うる規則名の全部（組み込み＋案件の決めごと＋前書きから来るもの）。
 * ここに無い名前は落とす。
 */
export function parseAdviseOff(source: string, known: Iterable<string>): AdviseOffMark[] {
  const names = new Set(known);
  const ranges = pageRanges(source);
  const marks: AdviseOffMark[] = [];
  let at = 0;
  const lines = source.split("\n");
  for (const [index, raw] of lines.entries()) {
    const start = at;
    at += raw.length + 1;
    const matched = MARK.exec(raw.replace(/\r$/, ""));
    if (matched === null) continue;
    const [listed, ...rest] = matched[1].split("#");
    const reason = rest.join("#").trim();
    const page = ranges.find((one) => start >= one.start && start < one.end)?.id;
    for (const name of listed.split(",").map((one) => one.trim()).filter(Boolean)) {
      if (!names.has(name)) {
        throw new AdviseOffError(
          `${index + 1}行目の advise-off に、規則ではない名前 "${name}" が書いてあります` +
            `（この定義で出る規則: ${[...names].sort().join(" / ")}）。` +
            "止めたつもりで止まっていないのが、いちばん困るので落としました。",
        );
      }
      marks.push({
        rule: name,
        ...(page === undefined ? {} : { page }),
        ...(reason === "" ? {} : { reason }),
        line: index + 1,
      });
    }
  }
  return marks;
}

/** 印を当てる（黙らせたものは捨てずに持って返す）。 */
export function applyAdviseOff(
  advice: Advice[],
  marks: AdviseOffMark[],
): SilencedAdvice {
  const used = new Set<AdviseOffMark>();
  const kept: Advice[] = [];
  const silenced: Advice[] = [];
  for (const one of advice) {
    // 画面の中の印はその画面だけ、外の印は全部に効く。
    const hit = marks.find(
      (mark) => mark.rule === one.rule && (mark.page === undefined || mark.page === one.page),
    );
    if (hit === undefined) {
      kept.push(one);
      continue;
    }
    used.add(hit);
    silenced.push(one);
  }
  return {
    kept,
    silenced,
    marks,
    idle: marks.filter((mark) => !used.has(mark)),
  };
}

/** 印の効き方を1行で（どの紙に出すときも同じ字を使う）。 */
export function silencedNote(result: SilencedAdvice): string {
  const where = (mark: AdviseOffMark): string =>
    mark.page === undefined ? "定義ぜんたい" : mark.page;
  const parts = [
    `定義の中の印（advise-off）で ${result.silenced.length} 件を黙らせました` +
      `（印 ${result.marks.length} 件: ` +
      `${result.marks.map((one) => `${one.rule}／${where(one)}`).join("、")}）。`,
  ];
  if (result.idle.length > 0) {
    parts.push(
      `このうち ${result.idle.length} 件は**何も黙らせていません**` +
        `（${result.idle
          .map((one) => `${one.line}行目 ${one.rule}／${where(one)}`)
          .join("、")}）＝` +
        "消し忘れか、書く場所が違います。",
    );
  }
  return parts.join("");
}

/** 端末向け（`advise` の最後に添える）。印が無ければ何も出さない。 */
export function silencedLines(result: SilencedAdvice): string[] {
  if (result.marks.length === 0) return [];
  const out = [`※ ${silencedNote(result)}`];
  for (const one of result.silenced) {
    out.push(`   ・黙らせた: ${one.where} [${one.rule}]`);
  }
  for (const one of result.marks.filter((mark) => mark.reason !== undefined)) {
    out.push(`   ・${one.rule}: ${one.reason}`);
  }
  return out;
}

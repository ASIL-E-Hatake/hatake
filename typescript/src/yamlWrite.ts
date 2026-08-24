// 「定義の文字列に、書いていないものを1つ足す」だけの層。
//
// [yamlSpans] が「この場所はどこからどこまでか」を持つのに対して、ここは**入れる文字**を
// 作る。消す側（[minimizeSource]）・替える側（[fixSource]）に続いて、足す側
// （[applyAdvice]）が要るので分けた。
//
// 決めごと:
//   ・足すのは**1行の流し書き（flow）だけ**。書いてある定義の書き方（字下げ・改行コード・
//     コメント）には触らない。書き足しのたびに行が散ると、当てたあとの差分が読めない。
//   ・書けない形（改行のある文・深すぎる入れ子・DSL のキーに使えない名前）は**足さない**
//     ＝ null を返す。半端に書き込むより、書かないほうがいい。
//   ・**書いてあるものは上書きしない**。空（`[]` / `{}` / 空文字 / null）だけは
//     「まだ決めていない」と見て置き換える（助言が「書いていない」と数えるのと同じ）。

import {
  type Document,
  isMap,
  isScalar,
  isSeq,
  type Node,
  type YAMLMap,
  type YAMLSeq,
} from "yaml";
import { type Path } from "./shrink.js";
import { indentAt, lineBreakOf, lineStart, type Span, valueSpanAt } from "./yamlSpans.js";

/** 書き足し1つ（[applySpans] にそのまま渡せる形）。 */
export interface Write {
  at: Span;
  text: string;
}

/** そのまま書くと別の意味になる語（引用符で囲む）。 */
const RESERVED = new Set([
  "",
  "true",
  "false",
  "yes",
  "no",
  "on",
  "off",
  "null",
  "~",
]);

/** 流し書きの中で意味を持つ字（1つでも入っていたら引用符で囲む）。 */
const SPECIAL = /[:#,{}[\]&*!|>'"%@`]/;

/** 値1つを1行で書く。書けない形なら null。 */
function scalarText(value: unknown): string | null {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value !== "string") return null;
  if (value.includes("\n")) return null; // 改行のある文は1行に書けない
  const quoted = `'${value.replace(/'/g, "''")}'`;
  if (RESERVED.has(value.toLowerCase())) return quoted;
  if (/^[-+]?[0-9][0-9_.]*$/.test(value)) return quoted; // 数に見える文字列
  if (/^[\s-?]|\s$/.test(value)) return quoted;
  return SPECIAL.test(value) ? quoted : value;
}

/** DSL のキーとして書ける名前か（設定の値をキーの位置に入れないための門）。 */
const isKeyName = (name: string): boolean => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);

/**
 * 値を**1行の流し書き**にする（`{ message: '{count} 件を承認します', danger: true }`）。
 *
 * 空の配列・空の map は書かない（書いても「まだ決めていない」ままなので）。
 */
export function flowText(value: unknown, depth = 0): string | null {
  if (depth > 2) return null; // これ以上深い値を1行に押し込むと読めない
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const parts = value.map((one) => flowText(one, depth + 1));
    return parts.some((one) => one === null) ? null : `[${parts.join(", ")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return null;
    const parts: string[] = [];
    for (const [key, one] of entries) {
      if (!isKeyName(key)) return null;
      const text = flowText(one, depth + 1);
      if (text === null) return null;
      parts.push(`${key}: ${text}`);
    }
    return `{ ${parts.join(", ")} }`;
  }
  return scalarText(value);
}

/**
 * 「まだ決めていない」と見なす値（空で書いてあるものは書いていないと数える）。
 *
 * 見るのは**節点**（`getIn(path, true)`）。JS の値に落とすと、空の配列も空の map も
 * `yaml` の節点そのものになって「空ではない」ように見える。
 */
const isEmptyNode = (node: unknown): boolean => {
  if (isMap(node) || isSeq(node)) return node.items.length === 0;
  if (isScalar(node)) return node.value === null || node.value === "";
  return node === null;
};

/**
 * その入れ物の**最後の行の終わり**（そこに改行を足して1行差し込む）。
 *
 * ブロックの値は終わりに改行を含むことがあるので、いったん空白を戻ってから行末まで進む。
 * CRLF の定義に LF だけを足さないよう、`\r` の手前で止める。
 */
function endOfBlock(node: Node, source: string): number | null {
  const to = node.range?.[1];
  if (to === undefined || to === null) return null;
  let end = Math.min(to, source.length);
  while (end > 0 && /\s/.test(source[end - 1])) end--;
  while (end < source.length && source[end] !== "\n") end++;
  return end > 0 && source[end - 1] === "\r" ? end - 1 : end;
}

/**
 * その位置の**桁**ぶんの空白（同じ列に次の行を書くため）。
 *
 * 字下げ（行頭の空白）では足りない。`- field: amount` の隣に `format:` を書くときは、
 * 揃えるのは行頭ではなく `field` の桁（`- ` のぶんだけ右）。
 */
const columnAt = (source: string, at: number): string =>
  source.slice(lineStart(source, at), at).replace(/[^\t]/g, " ");

/** 流し書きの入れ物（`{ … }` / `[ … ]`）の、閉じ括弧の手前に足す。 */
function intoFlow(
  node: YAMLMap | YAMLSeq,
  source: string,
  close: string,
  body: string,
): Write | null {
  const to = node.range?.[1];
  if (to === undefined || to === null) return null;
  const bracket = source.lastIndexOf(close, to);
  if (bracket < 0) return null;
  let at = bracket;
  while (at > 0 && /[ \t]/.test(source[at - 1])) at--;
  if (node.items.length === 0) return { at: [at, at], text: ` ${body} ` };
  return { at: [at, at], text: `, ${body}` };
}

/**
 * その道に**書いていないもの**を足す差し込み。
 *
 * 途中の map は作る（`search` が無い所に `search.filters` を書ける）。書いてある所
 * （空でない値）は触らない＝ null。
 */
export function addKeyAt(
  document: Document,
  source: string,
  path: Path,
  value: unknown,
): Write | null {
  if (path.length === 0) return null;
  const body = flowText(value);
  if (body === null) return null;

  // 既に書いてある所。空なら置き換える（`roles: []` は「まだ決めていない」）。
  const current = document.getIn(path, true);
  if (current !== undefined) {
    if (!isEmptyNode(current)) return null;
    const span = valueSpanAt(document, path);
    return span === null ? null : { at: span, text: body };
  }

  // 無い所。どこまで在るかを探して、残りは入れ子にして1行で書く。
  let at = path.length - 1;
  while (at > 0 && document.getIn(path.slice(0, at), true) === undefined) at--;
  const holder = at === 0 ? document.contents : document.getIn(path.slice(0, at), true);
  if (!isMap(holder)) return null;
  const tail = path.slice(at);
  if (tail.some((step) => typeof step !== "string")) return null; // 無い番号は作らない
  if (!(tail as string[]).every(isKeyName)) return null;
  // 途中の入れ物は**文字のまま**包む（値の深さの数え方を、道の深さで食い潰さないため）。
  const text = (tail.slice(1) as string[]).reduceRight(
    (inner, key) => `{ ${key}: ${inner} }`,
    body,
  );
  const key = tail[0] as string;
  if (holder.flow) return intoFlow(holder, source, "}", `${key}: ${text}`);
  if (holder.items.length === 0) return null; // ブロックで空の map は書けない
  const first = holder.items[0].key as Node | null;
  const from = first?.range?.[0];
  const end = endOfBlock(holder, source);
  if (from === undefined || end === null) return null;
  return {
    at: [end, end],
    text: `${lineBreakOf(source)}${columnAt(source, from)}${key}: ${text}`,
  };
}

/** 既にある配列の**後ろに1件足す**差し込み（列を1本足す、など）。 */
export function appendItemAt(
  document: Document,
  source: string,
  path: Path,
  value: unknown,
): Write | null {
  const body = flowText(value);
  if (body === null) return null;
  const seq = document.getIn(path, true);
  if (!isSeq(seq)) return null;
  if (seq.flow) return intoFlow(seq, source, "]", body);
  if (seq.items.length === 0) return null;
  const from = (seq.items[0] as Node | null)?.range?.[0];
  const end = endOfBlock(seq, source);
  if (from === undefined || end === null) return null;
  return {
    at: [end, end],
    text: `${lineBreakOf(source)}${indentAt(source, from)}- ${body}`,
  };
}

// 「定義の文字列の、この場所はどこからどこまでか」だけを持つ層。
//
// 定義を書き換える道具（[minimizeSource] / [fixSource]）は、どれも**元の文字列を切り貼り
// する**。`yaml` の Document を作り直して書き戻すと、コメントは残っても折り返し・空白・
// 改行コードが変わって差分が読めなくなるので、書き換えは常に「その場だけ」に閉じる。
//
// 位置の出し方は yaml の Node の `range`。ここに集めておけば、切る側（消す）と替える側
// （直す）が同じ場所の数え方を使える。

import {
  type Document,
  isMap,
  isScalar,
  type Node,
  type Pair,
} from "yaml";
import { type Path } from "./shrink.js";

/** 文字列の中の範囲（[開始, 終了)）。 */
export type Span = [number, number];

/** その道にあるキーと値の組（と、フローの中かどうか）。 */
export function pairAt(
  document: Document,
  path: Path,
): { pair: Pair; flow: boolean } | null {
  const parent =
    path.length > 1 ? document.getIn(path.slice(0, -1), true) : document.contents;
  if (!isMap(parent)) return null;
  const name = path[path.length - 1];
  for (const item of parent.items) {
    if (isScalar(item.key) && item.key.value === name) {
      return { pair: item, flow: parent.flow === true };
    }
  }
  return null;
}

/** その道の**値**の範囲（`repository: orderRepo` の `orderRepo`）。 */
export function valueSpanAt(document: Document, path: Path): Span | null {
  const found = pairAt(document, path);
  const range = (found?.pair.value as Node | undefined)?.range;
  return range === undefined || range === null ? null : [range[0], range[1]];
}

/** その道の**キー**の範囲（綴り違いを直すのに使う）。 */
export function keySpanAt(document: Document, path: Path): Span | null {
  const found = pairAt(document, path);
  const range = (found?.pair.key as Node | undefined)?.range;
  return range === undefined || range === null ? null : [range[0], range[1]];
}

/** 配列の要素そのものの範囲（`rowActions: [edit, aprove]` の `aprove`）。 */
export function itemSpanAt(document: Document, path: Path): Span | null {
  const node = document.getIn(path, true) as Node | undefined;
  const range = node?.range;
  return range === undefined || range === null ? null : [range[0], range[1]];
}

/**
 * そのキーを**消すため**の範囲。
 *
 * ブロックなら行ごと（前の字下げと後ろの改行まで。同じ行の後ろにコメントが付いて
 * いれば、それはそのキーの説明なので一緒に消す）。フローならその場だけを切って、
 * 続くカンマ（最後の要素なら前のカンマ）も落とす。
 */
export function deleteSpanAt(
  document: Document,
  path: Path,
  source: string,
): Span | null {
  const found = pairAt(document, path);
  if (found === null) return null;
  const key = found.pair.key as Node | null;
  const value = found.pair.value as Node | null;
  const from = key?.range?.[0];
  const to = value?.range?.[1] ?? key?.range?.[1];
  if (from === undefined || to === undefined) return null;

  const spaceBefore = (at: number): number => {
    let start = at;
    while (start > 0 && /[ \t]/.test(source[start - 1])) start--;
    return start;
  };

  if (found.flow) {
    let end = to;
    while (end < source.length && /[ \t]/.test(source[end])) end++;
    if (source[end] === ",") {
      end++;
      while (end < source.length && /[ \t]/.test(source[end])) end++;
      // 続きが次の行なら、行末に空白を残さないよう前の空白も一緒に切る。
      return [/^\r?\n/.test(source.slice(end)) ? spaceBefore(from) : from, end];
    }
    // 最後の要素。前のカンマまで戻して切る。
    let start = from;
    while (start > 0 && /[ \t\r\n]/.test(source[start - 1])) start--;
    if (source[start - 1] === ",") return [start - 1, to];
    return [from, to];
  }

  // ブロック。行頭（字下げの先頭）から、行末の改行までを消す。
  const start = spaceBefore(from);
  // 改行の直後でなければ行頭ではない（想定外なので触らない）。CRLF も見る。
  if (start > 0 && !/[\n\r]/.test(source[start - 1])) return null;
  let end = to;
  while (end < source.length && source[end] !== "\n") end++;
  // 後ろに残るのが空白かコメントだけなら行ごと消せる。値らしきものが続くなら触らない。
  if (!/^[ \t\r]*(#.*?)?\r?$/.test(source.slice(to, end))) return null;
  return [start, Math.min(end + 1, source.length)];
}

/** その位置を含む行の、行頭（字下げの先頭）の位置。 */
export function lineStart(source: string, at: number): number {
  let start = at;
  while (start > 0 && source[start - 1] !== "\n") start--;
  return start;
}

/** その位置を含む行の字下げ（空白の並び）。 */
export function indentAt(source: string, at: number): string {
  const start = lineStart(source, at);
  const match = /^[ \t]*/.exec(source.slice(start, at));
  return match === null ? "" : match[0];
}

/** この定義が使っている改行（CRLF のファイルに LF を足さないため）。 */
export const lineBreakOf = (source: string): string =>
  source.includes("\r\n") ? "\r\n" : "\n";

/**
 * ブロックのキーの**隣に1行足す**ための差し込み（位置と、入れる文字列）。
 *
 * 足す先はフローの中では扱わない（1行に収まっている所へ行を挿すと形が壊れる）。
 */
export function insertLineBefore(
  document: Document,
  path: Path,
  source: string,
  text: string,
): { at: number; text: string } | null {
  const found = pairAt(document, path);
  if (found === null || found.flow) return null;
  const from = (found.pair.key as Node | undefined)?.range?.[0];
  if (from === undefined) return null;
  const start = lineStart(source, from);
  return {
    at: start,
    text: `${indentAt(source, from)}${text}${lineBreakOf(source)}`,
  };
}

/** 範囲の書き換えを、後ろから当てる（前から当てると位置がずれる）。 */
export function applySpans(
  source: string,
  edits: { at: Span; text: string }[],
): string {
  let out = source;
  for (const edit of [...edits].sort((a, b) => b.at[0] - a.at[0])) {
    out = out.slice(0, edit.at[0]) + edit.text + out.slice(edit.at[1]);
  }
  return out;
}

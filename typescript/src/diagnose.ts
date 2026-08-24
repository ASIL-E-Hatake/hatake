// 「この定義で今どんな診断が出ているか」を数えるだけの層。
//
// 定義を機械が書き換える道具（[fixSource] / [applyAdvice]）は、どれも同じやり方で身を
// 守っている: **当てる前と当てたあとの診断を並べて、悪くなっていないことを確かめる**。
// その数え方が道具ごとに違うと、片方が通す書き換えを片方が拒む（同じ定義に対して答えが
// 2つある状態）になるので、ここに1つだけ置く。
//
// 「悪くなっていない」は件数の比較では足りない。**新しい名前が出ていない**ことまで見る
// ＝ 1件直して1件壊したときに件数は同じなので、名前ごとに数える。

import { parseAppMap } from "./appParse.js";
import { parsePageMap } from "./parse.js";
import { type DefinitionRegistry } from "./refs.js";
import { findUnknownKeys } from "./strictKeys.js";
import { findWarnings } from "./warnings.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** その定義で出ている診断（名前の並び。同じ名前が何度も出る）。 */
export function diagnoses(document: Dict, registry?: DefinitionRegistry): string[] {
  return [
    ...findWarnings(document, { registry }).map((warning) => warning.rule),
    ...findUnknownKeys(document).map((unknown) => `unknown-key:${unknown.key}`),
  ];
}

/** 構造として読めるか（読めなくなる書き換えをしない門）。 */
export function readable(document: Dict): boolean {
  try {
    if (isDict(document.app)) parseAppMap(document);
    else parsePageMap(document);
    return true;
  } catch {
    return false;
  }
}

/** 診断の数え上げ（名前ごとの件数）。 */
const tally = (names: string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return counts;
};

/**
 * 悪くなっていないか（**新しい名前が出ていない・同じ名前が増えていない**）。
 *
 * 助言を当てる側はこれで足りる。助言は警告ではないので、当てても診断の数は普通は
 * 変わらない（減ることを求めると、書き足しが全部拒まれる）。
 */
export function notWorse(before: string[], after: string[]): boolean {
  const known = tally(before);
  for (const [name, count] of tally(after)) {
    if ((known.get(name) ?? 0) < count) return false; // 増えた or 新顔
  }
  return true;
}

/** 診断が**減っていて**、悪くなっていないか（直す側はここまで求める）。 */
export const improves = (before: string[], after: string[]): boolean =>
  after.length < before.length && notWorse(before, after);

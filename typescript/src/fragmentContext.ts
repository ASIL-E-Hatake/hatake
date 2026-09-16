// 手引きに載せた**断片**を、書ける場所まで見る（囲みの `context:<ノード>` の印）。
//
// 断片（`columns:` だけ・`- { field: … }` だけ）は丸ごとの定義ではないので `validate` に
// かけられない。そこで今までは**キー名だけ**を DSL の語彙と突き合わせていた。これだと
// 「キーは在るが、その場所には書けない」が黙って通る ── `filter` の下に `columns` を
// 書いた手引きは、読んだ人の所で初めて効かないと分かる（`validate` なら言えることを、
// 手引きの側では言えていなかった）。
//
// 足りないのは**囲む文脈**の1語だけなので、それを印で渡してもらう:
//
//   ```yaml context:table
//   columns:
//     - { field: orderNo, label: 受注番号 }
//   ```
//
// 決めごと:
//   ・**印が無い断片は今までどおり**（キー名だけ）。印を全部の囲みに強いると手引きを
//     書く手間が増えるので、そこは釣り合いで決める。ただし**何枚を場所まで見たか**は
//     必ず数えて出す（見ていないものを見たように言わない）。
//   ・**知らないノード名は落とす。** 黙って「見なかったことにする」と、ノード名が
//     変わった手引きは印を付けたまま何も見られなくなる。
//   ・**中身が自由な所（`closed: false`）から下は見ない。** `config` / `params` /
//     条件式の中はプラグインの語彙で、DSL の語彙で見ると全部知らないキーになる。
//   ・場所の正は `spec/reference.json`（`hatake reference` が引くのと同じ1枚）＝
//     **同じ物差しを2つ持たない**。
//
// 書ける場所を言うときは `keyIndex`（キー名 → 書けるノード）をそのまま使う。
// 「ここには書けません」で終わらせず、**どこなら書けるか**まで言うのが値打ち。

import type { DslReference, ReferenceNode } from "./reference.js";
import { closestKey } from "./strictKeys.js";

/** 場所が合っていないキー1件。 */
export interface FragmentFinding {
  /** 断片の中の道（`columns[0].width`）。 */
  at: string;
  key: string;
  /** そこに来るノード（候補が複数なら全部）。 */
  in: string[];
  /** そのキーを書けるノード。**空なら DSL のどこにも無いキー**。 */
  writableIn: string[];
  /** 綴り違いの候補（DSL に無いキーのときだけ）。 */
  near?: string;
}

/** 印に書ける名前（ノード名の全部）。 */
export const fragmentContexts = (reference: DslReference): string[] =>
  Object.keys(reference.nodes).sort();

/** 知らないノード名を印に書いてある（＝その断片は誰も見ていない）。 */
export class UnknownFragmentContextError extends Error {
  constructor(context: string, reference: DslReference) {
    const near = closestKey(context, fragmentContexts(reference));
    super(
      `context:${context} という場所は DSL にありません` +
        `${near === null ? "" : `（${near} の間違い？）`}` +
        "（書ける名前は hatake reference で引けます）。",
    );
  }
}

/**
 * 断片を、囲む文脈の中で見る。
 *
 * [value] は YAML を読んだもの（配列なら、その要素が [context] のノード）。
 * 返すのは**場所が合っていないキー**だけ（合っていれば空）。
 */
export function checkFragmentInContext(
  value: unknown,
  context: string,
  reference: DslReference,
): FragmentFinding[] {
  if (reference.nodes[context] === undefined) {
    throw new UnknownFragmentContextError(context, reference);
  }
  const found: FragmentFinding[] = [];
  walk(value, [context], "", reference, found);
  return found;
}

/** そのノードたちのキーの表（見つからないノード名は無視＝`nodes` は reference が正）。 */
const nodesOf = (names: string[], reference: DslReference): ReferenceNode[] =>
  names.flatMap((name) =>
    reference.nodes[name] === undefined ? [] : [reference.nodes[name]],
  );

/**
 * 候補が複数のとき（`page` は7種類ある）、`type:` が書いてあればそこまで絞る。
 *
 * 絞らないと「検索画面に帳票のキーを書いた」が通る。`type:` が無ければ絞らない
 * （抜粋の断片には書いていないことがあるので、**言えない側に倒す**）。
 */
function narrow(
  node: Record<string, unknown>,
  candidates: string[],
  reference: DslReference,
): string[] {
  const type = node.type;
  if (typeof type !== "string") return candidates;
  const kind = reference.pageKinds.find((one) => one.type === type);
  if (kind === undefined || !candidates.includes(kind.node)) return candidates;
  return [kind.node];
}

function walk(
  value: unknown,
  candidates: string[],
  at: string,
  reference: DslReference,
  found: FragmentFinding[],
): void {
  if (Array.isArray(value)) {
    value.forEach((one, i) => walk(one, candidates, `${at}[${i}]`, reference, found));
    return;
  }
  if (value === null || typeof value !== "object") return;
  const nodes = nodesOf(candidates, reference);
  // 中身が自由な所（条件式・`config` / `params`）から下は、DSL の語彙ではない。
  if (nodes.length === 0 || nodes.some((one) => one.closed === false)) return;
  const here = narrow(value as Record<string, unknown>, candidates, reference);
  const keys = nodesOf(here, reference).flatMap((one) => one.keys);
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = at === "" ? key : `${at}.${key}`;
    const defs = keys.filter((one) => one.key === key);
    if (defs.length === 0) {
      const writableIn = reference.keyIndex[key] ?? [];
      const near =
        writableIn.length > 0
          ? null
          : closestKey(key, Object.keys(reference.keyIndex));
      found.push({
        at: path,
        key,
        in: here,
        writableIn,
        ...(near === null ? {} : { near }),
      });
      continue;
    }
    const childNodes = [...new Set(defs.flatMap((one) => one.nodes ?? []))];
    if (childNodes.length === 0) continue;
    walk(child, childNodes, path, reference, found);
  }
}

/** 人に見せる1行（**どこなら書けるか**まで言う）。 */
export function describeFragmentFinding(finding: FragmentFinding): string {
  const where = finding.in.join(" / ");
  if (finding.writableIn.length === 0) {
    return (
      `${finding.at}: \`${finding.key}\` は DSL にありません` +
      `${finding.near === null || finding.near === undefined ? "" : `（${finding.near} の間違い？）`}`
    );
  }
  return (
    `${finding.at}: \`${finding.key}\` は ${where} の下には書けません` +
    `（書けるのは ${finding.writableIn.join(" / ")}）`
  );
}

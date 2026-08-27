// 登録の名前が、**登録の外**（アプリのコードの中）で使われていないか。
//
// なぜ要るか: `refs --unused` は「定義のどこからも使われていない登録」を出す道具だが、
// それを**落とす旗**（`--unused-as-error`）にすると嘘になる。画面の外から直接呼んでいる
// 登録（バッチが使う変換・別画面のコードから呼ぶプラグイン）が普通に在るので、定義から
// 使われていないことは「消してよい」を意味しない。
//
// なので、消してよいかを言う前に**実装の中で名前が書かれているか**を見る。
//
// 決めごと:
//   ・**言語のパーサは持たない**（[scanRegistrations] と同じ立場）。見るのは
//     「その名前が文字列として書かれている所」だけ。
//   ・**登録の中に書かれているぶんは数えない。** 登録そのものは「使っている」ことの
//     証拠にならない（それを数えると、全部の登録が「使われている」になる）。
//   ・見つけたら**場所を出す**（消す前に人が開く所）。数だけ言われても確かめられない。

import type { RegistrationSite, SourceFile } from "./registryScan.js";
import { looksUnfilled, stripComments } from "./registryScan.js";
import { UNWIRED_REPOSITORY } from "./wireKinds.js";

/** 名前が書かれていた場所（`file:line`）。 */
export type NameUses = Record<string, string[]>;

/** その行が、どれかの登録の中か。 */
function insideRegistration(
  sites: RegistrationSite[],
  file: string,
  line: number,
): boolean {
  return sites.some(
    (site) => site.file === file && line >= site.line && line <= site.endLine,
  );
}

/**
 * [names] のそれぞれが、登録の外で書かれている場所を集める。
 *
 * 探すのは文字列リテラル（`'approveOrders'` / `"approveOrders"`）。プラグイン名や
 * フォーマッタ名は定義から来る文字列なので、コードから呼ぶときも文字列で書く。
 */
export function usesInCode(
  names: string[],
  files: SourceFile[],
  sites: RegistrationSite[],
): NameUses {
  const found: NameUses = {};
  for (const file of files) {
    const lines = stripComments(file.source).split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (insideRegistration(sites, file.path, i + 1)) continue;
      for (const name of names) {
        if (!lines[i].includes(`'${name}'`) && !lines[i].includes(`"${name}"`)) {
          continue;
        }
        found[name] = [...(found[name] ?? []), `${file.path}:${i + 1}`];
      }
    }
  }
  return found;
}

/** 登録の外に残っている TODO（配線そのものの埋め忘れ）。 */
export interface LooseTodo {
  file: string;
  line: number;
  /** その行（そのまま人に見せる）。 */
  what: string;
}

/**
 * 登録の外に残っている「まだ埋めていない」所。
 *
 * なぜ数えるか: REST で組んだ配線（`wire --base`）は Repository の登録は済んでいるのに、
 * **実際に通信する所**（`_send`）が TODO のまま残る。登録1件ずつを数えるだけだと
 * 「全部埋まっている」と出て、動かすと1件も取れない。
 *
 * まだ繋いでいない Repository の仮実装（[UNWIRED_REPOSITORY] のクラス）は数えない
 * ＝そこは登録1件ずつの方で数えているので、同じ話を2回言わないため。
 */
export function looseTodos(
  files: SourceFile[],
  sites: RegistrationSite[],
): LooseTodo[] {
  const found: LooseTodo[] = [];
  for (const file of files) {
    const lines = stripComments(file.source).split("\n");
    let inStub = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (inStub > 0) {
        inStub += (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length;
        continue;
      }
      if (line.includes(`class ${UNWIRED_REPOSITORY}`)) {
        inStub = 1;
        continue;
      }
      if (!looksUnfilled(line)) continue;
      if (insideRegistration(sites, file.path, i + 1)) continue;
      found.push({ file: file.path, line: i + 1, what: line.trim() });
    }
  }
  return found;
}

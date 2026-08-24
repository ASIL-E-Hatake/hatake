// レビュー用の1枚（説明＋助言）。
//
// `explain` の「この画面でできないこと」と `advise` の「書き足したほうがいい所」は隣の話で、
// どちらも**定義を人がレビューするため**に在る。道具ごとに出力が散ると、レビューする人は
// 2回コマンドを打つことになり、片方しか読まれない。だから1枚にする。
//
// 混ぜないものは混ぜない: 助言は最後の節にまとめ、**警告ではない**と毎回書く。事実（書いた
// のに効かない）は `validate` の担当なので、ここには入れない＝この1枚で終了コードは動かない。
//
// app の1枚だけを読むときは、助言も**その画面のものだけ**に絞る（他の画面の指摘が混じると、
// 目の前の画面の話だと読み違える）。

import { type Advice, ADVICE_NOTE, findAdvice } from "./advise.js";
import { withDrafts } from "./adviseDraft.js";
import { type AdviceRules, DEFAULT_RULES } from "./adviseRules.js";
import { type ExplainDocument, renderExplain } from "./explain.js";
import { explainSource, rawDocument } from "./explainSource.js";

/** レビュー1枚ぶん。 */
export interface ReviewDocument {
  /** 説明（`explain` と同じもの）。 */
  explain: ExplainDocument;
  /** 助言（`advise` と同じもの）。 */
  advice: Advice[];
  /** 助言をこの画面に絞ったか（app の1枚を読んだとき）。 */
  page?: string;
}

/**
 * 定義の文字列からレビュー1枚を作る。
 *
 * 説明は strict で読む（読めない定義はレビューの前に直す話）。助言は素の document を見る
 * ＝**書いてあるもの**を見たいので、既定値で埋まった姿では見ない。
 */
export function reviewSource(
  source: string,
  options: { page?: string; rules?: AdviceRules } = {},
): ReviewDocument {
  const explain = explainSource(source, { page: options.page });
  const raw = rawDocument(source);
  // 下書きも添える（レビューする人が「じゃあ何を書くのか」で止まらないように）。
  const all = withDrafts(raw, findAdvice(raw, options.rules ?? DEFAULT_RULES));
  const advice =
    options.page === undefined
      ? all
      : all.filter((one) => one.page === options.page);
  return {
    explain,
    advice,
    ...(options.page === undefined ? {} : { page: options.page }),
  };
}

/** 人が読む形。説明の続きに助言の節を足すだけ（見た目を変えない）。 */
export function renderReview(
  review: ReviewDocument,
  options: { rulesFrom?: string; rules?: AdviceRules } = {},
): string {
  const out = [renderExplain(review.explain), ""];
  out.push("## 書き足したほうがいい所（助言）");
  if (review.advice.length === 0) {
    out.push("  ・見つかりませんでした。");
  } else {
    for (const one of review.advice) {
      out.push(
        `  ・${one.says}${one.guess === true ? "（名前からの推測）" : ""}`,
        `    → ${one.add}`,
        `      ${one.where} [${one.rule}]`,
      );
    }
  }
  out.push("");
  if (options.rulesFrom !== undefined) {
    const rules = options.rules ?? DEFAULT_RULES;
    out.push(
      `※ 助言の物差しは ${options.rulesFrom} を使いました` +
        `（止めた規則 ${rules.off.length} 件 / 案件の決めごと ${rules.require.length} 件）。`,
    );
  }
  out.push(ADVICE_NOTE);
  return out.join("\n");
}

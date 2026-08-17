// 実際に転んだ実例のカタログ（spec/failures.json）。
//
// 対照表（pitfalls.json）との違いは**出どころ**。対照表は「人が考えた間違い」を整理した
// 教材で、キーから引ける。こちらは「実際にこう書いて、道具にこう言われた」記録で、
// 直し方だけでなく**なぜそう書いてしまうか**を持つ。
//
// 大事なのは、各件が**再生できる**こと。`wrote` を本当に道具にかけ直して、記録した
// `diagnosis` と一致することを CI で確認する。だからこの表は嘘をつけないし、診断の
// 質が落ちたら（検出しなくなった・文言が変わった）そこで気づける。
//
// `diagnosis` が空の件は「**機械では拾えない**」ことの記録で、`review` にレビュー時の
// 着眼点を書く。拾えないものを載せないと、カタログが「道具が万全である」という嘘をつく。

import { type DefinitionRegistry } from "./refs.js";

/** 転んだ実例1件。 */
export interface Failure {
  id: string;
  /** 何をしようとして、どう書いたか（1行）。 */
  title: string;
  /** なぜそう書いてしまうか。ここが対照表と違う所。 */
  why: string;
  /** 実際に書いた定義（YAML の行）。 */
  wrote: string[];
  /** かけ直したときに出るもの。空 = 機械では拾えない。 */
  diagnosis: { warnings?: string[]; unknownKeys?: string[] };
  /** 登録済み一覧（外との辻褄を見る件だけ）。 */
  registry?: DefinitionRegistry;
  /** 機械が拾えないときの、レビューでの着眼点。 */
  review?: string;
  /** どう直すか（1行）。 */
  fix: string;
  /** 直したあとの定義（必ず問題ゼロで通る）。 */
  fixed: string[];
}

export interface FailureCatalog {
  failures: Failure[];
}

/** YAML の行を1つの文字列に戻す。 */
export const failureSource = (lines: string[]): string => `${lines.join("\n")}\n`;

/**
 * 実例を絞り込む。id・題・理由・直し方・出る警告のどれかに [query] を含むもの。
 * 空なら全件（並びは書いてある順＝新しく足したものが後ろ）。
 */
export function filterFailures(
  catalog: FailureCatalog,
  query?: string,
): Failure[] {
  const needle = query?.trim().toLowerCase();
  if (needle === undefined || needle === "") return catalog.failures;
  return catalog.failures.filter((failure) =>
    [
      failure.id,
      failure.title,
      failure.why,
      failure.fix,
      failure.review ?? "",
      ...(failure.diagnosis.warnings ?? []),
      ...(failure.diagnosis.unknownKeys ?? []),
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

/** 人が読む形。1件ずつ「こう書いた → こう言われた → こう直す」。 */
export function describeFailure(failure: Failure): string {
  const warnings = failure.diagnosis.warnings ?? [];
  const unknown = failure.diagnosis.unknownKeys ?? [];
  const said =
    warnings.length === 0 && unknown.length === 0
      ? "（何も言われない＝機械では拾えない）"
      : [...unknown.map((k) => `知らないキー "${k}"`), ...warnings].join(" / ");
  return [
    `# ${failure.title}`,
    `  なぜそう書くか: ${failure.why}`,
    `  書いたもの:`,
    ...failure.wrote.map((line) => `    ${line}`),
    `  道具が言うこと: ${said}`,
    ...(failure.review === undefined ? [] : [`  レビューの着眼点: ${failure.review}`]),
    `  直し方: ${failure.fix}`,
    `  直したもの:`,
    ...failure.fixed.map((line) => `    ${line}`),
  ].join("\n");
}

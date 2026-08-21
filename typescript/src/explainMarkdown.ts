// 説明・レビュー・変更を **PR 本文の形**で出す。
//
// 端末向けの出力（`  ・…`）は、貼ると崩れる。読む場所が PR やチケットなら、貼れる形で
// ないと結局貼られない＝説明が在っても読まれない。同じ内容を2つの形で出すだけで、
// 中身（何を言うか）はどちらも同じ。
//
// 決めごと3つ:
//   ・**見出しは h2 から**。PR 本文の中では h1 は使わない（本文の題は PR の題）
//   ・**長い節は折りたたむ**（`<details>`）。列が30本ある画面の説明で PR が埋まると、
//     レビューの本題（差分）が見えなくなる
//   ・`<` `>` `&` は**逃がす**。ただし `` ` `` で囲んだ中は触らない（`hatake explain
//     <file>` のような行が消えるのを防ぐ。HTML として食われる）

import { type Advice, ADVICE_NOTE } from "./advise.js";
import { type AdviceRules, DEFAULT_RULES } from "./adviseRules.js";
import { type DefinitionChange, type DefinitionDiff } from "./defDiff.js";
import { type ExplainDocument, type ExplainSection } from "./explain.js";
import { type AppBrief, type PageBrief } from "./explainBrief.js";
import { type ExplainChange, type ExplainDiff, EXPLAIN_DIFF_NOTE } from "./explainDiff.js";
import type { Lang } from "./explainPhrases.js";
import { voice } from "./explainVoice.js";
import { type ReviewDocument } from "./review.js";

/** これより行数の多い節は折りたたむ。 */
const FOLD_AT = 8;

/**
 * HTML として食われる文字を逃がす。`` ` `` で囲んだ中は触らない。
 *
 * 逃がしすぎると `` `<file>` `` が `&lt;file&gt;` と**そのまま見えて**しまうので、
 * 区切りで割って交互に扱う（偶数番目が地の文）。
 */
export function escapeMarkdown(line: string): string {
  return line
    .split("`")
    .map((part, index) =>
      index % 2 === 0
        ? part.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        : part,
    )
    .join("`");
}

const bullets = (lines: string[]): string[] =>
  lines.map((line) => `- ${escapeMarkdown(line)}`);

/** 節1つ。長ければ折りたたむ（見出しは残るので、目次としては読める）。 */
function section(
  title: string,
  lines: string[],
  depth = 3,
  lang: Lang = "ja",
): string[] {
  if (lines.length === 0) return [];
  const heading = "#".repeat(depth);
  if (lines.length <= FOLD_AT) {
    return [`${heading} ${escapeMarkdown(title)}`, "", ...bullets(lines), ""];
  }
  return [
    "<details>",
    `<summary><b>${escapeMarkdown(title)}</b>${voice(lang).countOfLines(
      lines.length,
    )}</summary>`,
    // 空行が無いと、中の箇条書きが Markdown として読まれない。
    "",
    ...bullets(lines),
    "",
    "</details>",
    "",
  ];
}

const note = (text: string): string[] => [`> ${escapeMarkdown(text)}`];

const sections = (list: ExplainSection[], lang: Lang = "ja"): string[] =>
  list.flatMap((one) => section(one.title, one.lines, 3, lang));

/** 説明（`explain`）。文書の言語をそのまま使う（飾りだけが言語に依る）。 */
export function explainMarkdown(document: ExplainDocument): string {
  return [
    `## ${escapeMarkdown(document.headline)}`,
    "",
    ...sections(document.sections, document.lang),
  ]
    .join("\n")
    .trimEnd();
}

/** レビュー1枚（`explain --review`）。助言は最後の節にまとめる。 */
export function reviewMarkdown(
  review: ReviewDocument,
  options: { rulesFrom?: string; rules?: AdviceRules } = {},
): string {
  const out = [explainMarkdown(review.explain), ""];
  out.push(...section("書き足したほうがいい所（助言）", adviceLines(review.advice)));
  if (options.rulesFrom !== undefined) {
    const rules = options.rules ?? DEFAULT_RULES;
    out.push(
      ...note(
        `助言の物差しは ${options.rulesFrom} を使いました` +
          `（止めた規則 ${rules.off.length} 件 / 案件の決めごと ${rules.require.length} 件）。`,
      ),
    );
  }
  out.push(...note(ADVICE_NOTE));
  return out.join("\n").trimEnd();
}

/** 助言1件を1行に畳む（PR 本文では3行に割ると読みにくい）。 */
const adviceLines = (advice: Advice[]): string[] =>
  advice.length === 0
    ? ["見つかりませんでした。"]
    : advice.map(
        (one) =>
          `${one.says}${one.guess === true ? "（名前からの推測）" : ""} ` +
          `**→ ${one.add}** \`${one.where}\` [${one.rule}]`,
      );

/** 変更（`explain --diff`）。節ごとにまとめる。 */
export function explainDiffMarkdown(diff: ExplainDiff): string {
  const out = [`## ${escapeMarkdown(diff.headline)}`, ""];
  if (diff.same) {
    out.push("見え方は変わりません。", "");
  } else {
    // 何件変わったかを先に言う（折りたたみの中を開く前に規模が分かる）。
    out.push(`変わったところ **${diff.changes.length} 件**。`, "");
    for (const [title, changes] of groupBySection(diff.changes)) {
      out.push(...section(title, changes.map(changeLine)));
    }
  }
  out.push(...note(EXPLAIN_DIFF_NOTE));
  return out.join("\n").trimEnd();
}

/** 節の順は出てきた順（説明の並びと同じ＝目が行き来しない）。 */
function groupBySection(changes: ExplainChange[]): [string, ExplainChange[]][] {
  const grouped = new Map<string, ExplainChange[]>();
  for (const change of changes) {
    const found = grouped.get(change.section);
    if (found === undefined) grouped.set(change.section, [change]);
    else found.push(change);
  }
  return [...grouped];
}

/** 前後の値は、文が既に言っていないときだけ添える（同じことを2度書かない）。 */
function changeLine(change: ExplainChange): string {
  const parts = [change.message];
  if (shows(change.before, change.message)) parts.push(`前: \`${change.before}\``);
  if (shows(change.after, change.message)) parts.push(`後: \`${change.after}\``);
  return parts.join(" ／ ");
}

const shows = (value: string | undefined, message: string): boolean =>
  value !== undefined && value !== "" && !message.includes(value);

/** 1行の要約（`explain --brief`）。app は表にする（端末向けの桁揃えは貼ると崩れる）。 */
export function briefMarkdown(brief: PageBrief | AppBrief): string {
  if (!("pages" in brief)) return escapeMarkdown(brief.line);
  const out = [
    `## ${escapeMarkdown(brief.headline)}`,
    "",
    "| id | 画面 | 何の画面か | 規模 |",
    "|---|---|---|---|",
  ];
  for (const page of brief.pages) {
    out.push(
      `| \`${page.id}\` | ${cell(page.title)} | ${cell(page.what)} | ${cell(
        page.parts.join("、"),
      )} |`,
    );
  }
  return out.join("\n");
}

/** 表の中では `|` が桁の区切りになるので逃がす。 */
const cell = (text: string): string =>
  escapeMarkdown(text).replace(/\|/g, "\\|");

/** 影響の印（端末向けと同じ語。表の1桁目に出る）。 */
const IMPACT: Record<string, string> = {
  breaking: "✗ 破壊的",
  caution: "△ 要確認",
  safe: "・安全",
};

/**
 * 後方互換の判定（`diff`）を表にする。
 *
 * こちらは**止めるための道具**（終了コードで CI を落とす）だが、落ちた理由は人が PR で
 * 読む。何が壊れるかは行数が多くなりがちなので、端末向けの1行ずつよりも表が読みやすい。
 */
export function definitionDiffMarkdown(
  diff: DefinitionDiff,
  changes: DefinitionChange[] = diff.changes,
): string {
  const verdict = !diff.compatible
    ? "**後方互換を壊します**（既存の呼び出し側の修正が要ります）"
    : diff.quiet
      ? "後方互換です"
      : "後方互換ですが、**目で見て確かめてほしい変更**があります";
  const out = [`## 定義の変更 — ${verdict}`, ""];
  if (changes.length === 0) {
    out.push("変わりません。");
    return out.join("\n");
  }
  const rows = [
    "| 影響 | 区分 | 場所 | 内容 |",
    "|---|---|---|---|",
    ...changes.map(
      (change) =>
        `| ${IMPACT[change.impact] ?? change.impact} | ${change.area} | ` +
        `\`${change.path}\` | ${cell(change.message)} |`,
    ),
  ];
  // 表は折りたたむと中が読めない（GitHub は details の中の表を潰さないが、開くまで
  // 件数しか見えない）。件数を先に言って、表はそのまま出す。
  out.push(`変わったところ **${changes.length} 件**。`, "", ...rows);
  return out.join("\n");
}

// 案件の前書きを、AI の設定ファイル（AGENTS.md / CLAUDE.md）に貼る形で出す。
//
// 前書きを読めるのは hatake の道具だけ（`hatake project` / `hatake_project`）。けれど
// AI に渡る前置きは**その設定ファイル**にも書くので、同じことを2か所に書くことになる
// ＝必ず食い違う（前書きを直したのに設定ファイルが古い、が起きる）。
//
// だから**1枚を正にして、貼る側を生成する**。生成物であることを断片の中に書き、印
// （`hatake:project:begin` / `end`）で挟んで、次からは印の中だけを差し替える。
//
// 印の外は触らない。ブランチ名・コミット規約・レビューの回し方は前書きが持たない
// （定義に現れないものは機械が突き合わせられない）ので、**そこは人が手で書く場所**として
// 空けておく。

import {
  NAMING_TARGETS,
  namingSubject,
  type ProjectDocument,
} from "./project.js";

/** 差し替える範囲の印（この行そのものが目印なので、消さないでもらう）。 */
export const AGENTS_BEGIN = "<!-- hatake:project:begin -->";
export const AGENTS_END = "<!-- hatake:project:end -->";

/** 表の升に入れる（`|` が入ると表が壊れるので逃がす）。 */
const cell = (text: string): string => text.replace(/\|/g, "\\|");

/**
 * 貼る断片（印つきの Markdown）。
 *
 * 中身は前書きそのままで、**足すのは2つだけ**＝これが生成物だという断り書きと、
 * 「機械が見ていない所」の注意。後者を書かないと、設定ファイルに前提が載っている
 * ことで「守られている」と読まれる。
 */
export function agentsSection(
  project: ProjectDocument,
  options: { from?: string } = {},
): string {
  const from = options.from ?? "hatake.project.yaml";
  const out: string[] = [
    AGENTS_BEGIN,
    "## この案件について",
    "",
    `> ここは \`${from}\` から生成した節です（\`npx hatake project --agents\`）。`,
    "> **直すときは前書きを直して貼り直す**（同じことを2か所に書くと必ず食い違う）。",
    "",
    project.system.what,
  ];

  const bullets = (title: string, lines: string[]): void => {
    if (lines.length === 0) return;
    out.push("", `**${title}**`, "");
    for (const line of lines) out.push(`- ${line}`);
  };

  bullets("使う人", project.system.users);
  bullets("業務の前提（できないことも含む）", project.system.premises);
  bullets(
    "外の相手",
    project.system.external.map(
      (one) =>
        `\`${one.name}\` … ${one.what}` +
        `${one.owner === undefined ? "" : `（聞く相手: ${one.owner}）`}`,
    ),
  );

  if (project.glossary.length > 0) {
    out.push(
      "",
      "**業務の言葉（この字で呼ぶ）**",
      "",
      "| 業務の言葉 | 定義に書く名前 | この字で呼ばない |",
      "| --- | --- | --- |",
    );
    for (const entry of project.glossary) {
      out.push(
        `| ${cell(entry.term)} | ${entry.field === undefined ? "—" : `\`${entry.field}\``} ` +
          `| ${entry.avoid.length === 0 ? "—" : cell(entry.avoid.join(" / "))} |`,
      );
    }
  }

  const rules: string[] = [];
  for (const target of NAMING_TARGETS) {
    const shape = project.naming.shapes[target];
    if (shape !== undefined) rules.push(`${namingSubject(target)} \`${shape}\``);
  }
  for (const [type, ending] of Object.entries(project.naming.suffix)) {
    rules.push(`\`type: ${type}\` の項目は \`${ending}\` で終わらせる`);
  }
  bullets("名前の決めごと", rules);

  out.push(
    "",
    "**定義を書くとき**",
    "",
    `- 書けたら \`npx hatake advise <定義> --project ${from}\` にかける` +
      "（上の名前と言葉の決めごととの食い違いが出る）",
    "- **上の「業務の前提」は機械が見ていない**（読むのはあなた）。前提に反する定義を" +
      "書いても、道具は何も言わない",
    "",
    AGENTS_END,
  );
  return `${out.join("\n")}\n`;
}

/**
 * 印の中だけを差し替える。印が無ければ null（**勝手に足さない**）。
 *
 * 足さないのは、AGENTS.md が人の書いた紙だから＝どこに入れるかは人が決める。1回目は
 * 貼ってもらい、2回目からはここが差し替える。
 */
export function replaceAgentsSection(text: string, section: string): string | null {
  const begin = text.indexOf(AGENTS_BEGIN);
  const end = text.indexOf(AGENTS_END);
  if (begin === -1 || end === -1 || end < begin) return null;
  // 改行の書き方はその紙のものに合わせる（差分が全行になるのを避ける）。
  const crlf = text.includes("\r\n");
  const body = crlf ? section.replace(/\n/g, "\r\n") : section;
  return (
    text.slice(0, begin) +
    body.trimEnd() +
    text.slice(end + AGENTS_END.length)
  );
}

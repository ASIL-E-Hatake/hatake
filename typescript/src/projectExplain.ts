// 案件の前書きを読み返す（`hatake project` / MCP の `hatake_project`）。
//
// 前書きは**人が書く**ので、書いた本人以外（次の担当・AI）が読んで同じ意味に取れるかが
// 全部。だから読み返しを1つ置く。
//
// ここでいちばん大事なのは最後の2行＝**機械が見るもの／見ないもの**。前書きを渡すと
// 「これで縛れた」と思ってしまうが、`system` と `premises` は誰も突き合わせていない
// （人と AI が読むだけ）。見ていないものを見ているように見せないために、毎回言う。

import {
  NAMING_TARGETS,
  namingSubject,
  type ProjectDocument,
} from "./project.js";
import { WHERE_WORDS } from "./responsibility.js";

/** 案件の前書きを人の言葉で並べる。 */
export function projectLines(project: ProjectDocument): string[] {
  const out: string[] = [];
  out.push(`この案件: ${project.system.what}`);

  if (project.system.users.length > 0) {
    out.push("");
    out.push("使う人:");
    for (const one of project.system.users) out.push(`  ・${one}`);
  }
  if (project.system.premises.length > 0) {
    out.push("");
    out.push("業務の前提（できないことも含む）:");
    for (const one of project.system.premises) out.push(`  ・${one}`);
  }
  if (project.system.external.length > 0) {
    out.push("");
    out.push("外の相手:");
    for (const one of project.system.external) {
      out.push(
        `  ・${one.name} … ${one.what}` +
          `${one.owner === undefined ? "" : `（聞く相手: ${one.owner}）`}`,
      );
    }
  }

  if (project.glossary.length > 0) {
    out.push("");
    out.push("用語（この字で呼ぶ）:");
    for (const entry of project.glossary) {
      const parts = [`  ・${entry.term}`];
      if (entry.field !== undefined) parts.push(`→ ${entry.field}`);
      if (entry.avoid.length > 0) parts.push(`（${entry.avoid.join(" / ")} とは呼ばない）`);
      out.push(parts.join(" "));
      if (entry.note !== undefined) out.push(`      ${entry.note}`);
    }
  }

  if (project.logic.length > 0) {
    out.push("");
    out.push("業務ロジックの置き場:");
    for (const rule of project.logic) {
      out.push(
        `  ・[${WHERE_WORDS[rule.where]}] ${rule.what}` +
          `${rule.name === undefined ? "" : `（${rule.name}）`}`,
      );
      if (rule.why !== undefined) out.push(`      ${rule.why}`);
    }
  }

  const shapes = NAMING_TARGETS.filter(
    (target) => project.naming.shapes[target] !== undefined,
  );
  const suffixes = Object.entries(project.naming.suffix);
  if (shapes.length > 0 || suffixes.length > 0) {
    out.push("");
    out.push("名前の決めごと:");
    for (const target of shapes) {
      out.push(`  ・${namingSubject(target)} ${project.naming.shapes[target]}`);
    }
    for (const [type, ending] of suffixes) {
      out.push(`  ・\`type: ${type}\` の項目は "${ending}" で終わる`);
    }
  }

  out.push("");
  out.push(...boundaryLines(project));
  return out;
}

/**
 * 何を機械が見て、何を見ていないか。
 *
 * 見ている所は「どの道具が」まで言う（読んだ人が確かめに行けるように）。
 */
function boundaryLines(project: ProjectDocument): string[] {
  const watched: string[] = [];
  if (project.glossary.length > 0) watched.push("用語（ラベルと項目名）");
  // 業務ロジックは**名前だけ**が見られる（規則の中身は誰も見ていない）。
  if (project.logic.some((rule) => rule.name !== undefined)) {
    watched.push("業務ロジックの名前（定義が呼んでいるか）");
  }
  if (
    Object.keys(project.naming.suffix).length > 0 ||
    NAMING_TARGETS.some((target) => project.naming.shapes[target] !== undefined)
  ) {
    watched.push("名前の決めごと");
  }
  return [
    watched.length === 0
      ? "機械が見るもの: ありません（glossary も naming も書いていないので、" +
        "この前書きは読み物だけです）。"
      : `機械が見るもの: ${watched.join(" / ")}` +
        "。`hatake advise <定義> --project <この1枚>` が定義と突き合わせて**助言**に出します" +
        "（好みなので終了コードは変えません）。",
    "機械が見ないもの: この案件は何か・使う人・業務の前提・外の相手" +
      `${project.logic.length === 0 ? "" : "・業務ロジックの中身（規則そのもの）"}。` +
      "**人と AI が読むだけ**で、誰も突き合わせていません（定義に書きようがないので）。",
  ];
}

// 人が書いた資料から、**前書きの下書き**を起こす（`hatake project --draft --from`）。
//
// 最初の1枚を白紙から書くのが重いのは、意図の1枚（[draftIntent]）と同じ壁。けれど
// 提案書・要件メモはもう在るので、「見出しのある所を拾う」ところまでは機械にできる。
//
// 決めごと（意図の下書きと同じ作法）:
//
// * **入力は人が書いた資料だけ。** 定義（`page:` / `app:`）を渡されたら**落とす**＝
//   前書きを定義から起こすと、必ず一致して読む値打ちが無くなる（[parseProject] の
//   注記を、注記ではなく機械で守る）
// * **書いてある字のまま**。要約しない・言い換えない・順番を変えない
// * **見出しでしか分けない。** 推し量って分けると、前提を説明に格下げしたりする
// * **拾えなかった行は捨てない。** 一覧に出す（黙って落とすと、拾ったつもりで抜ける）
// * 起こしたものは**下書き**。`$comment` にそう書く＝人が読んで直すまで正ではない

type Dict = Record<string, unknown>;

/** 見出しから、前書きのどこに入れるかを決める合図（部分一致・上から見る）。 */
const HEADING_CUES: { cues: string[]; into: Bucket }[] = [
  { cues: ["使う人", "利用者", "ユーザー", "対象者"], into: "users" },
  {
    cues: ["前提", "できないこと", "制約", "しないこと", "範囲外"],
    into: "premises",
  },
  { cues: ["用語", "言葉", "呼び方", "辞書"], into: "glossary" },
  { cues: ["外", "連携", "別システム", "既存"], into: "external" },
  { cues: ["システム", "概要", "目的", "何を"], into: "what" },
];

type Bucket = "what" | "users" | "premises" | "glossary" | "external";

/** 拾えなかった行（捨てずに返す）。 */
export interface DraftLeftover {
  line: number;
  text: string;
  why: string;
}

/** 起こした下書き。 */
export interface ProjectDraft {
  /** そのまま貼れる YAML。 */
  yaml: string;
  /** 拾えなかった行。 */
  leftovers: DraftLeftover[];
  /** 何件拾ったか（見出しごと）。 */
  picked: Record<Bucket, number>;
}

const headingOf = (line: string): string | undefined => {
  const match = /^#{1,6}\s+(.*)$/.exec(line.trim());
  return match === null ? undefined : match[1].trim();
};

const bucketOf = (heading: string): Bucket | undefined => {
  for (const one of HEADING_CUES) {
    if (one.cues.some((cue) => heading.includes(cue))) return one.into;
  }
  return undefined;
};

/** 箇条書きの印を落とす。 */
const stripBullet = (line: string): string =>
  line.trim().replace(/^(?:[-*+]\s+|・\s*|\d+[.)]\s+)/, "").trim();

/** 定義を渡されていないか（前書きを定義から起こさない、を機械で守る）。 */
export function looksLikeDefinition(source: string): boolean {
  return /^\s*(page|app|dsl_version)\s*:/m.test(source);
}

/** YAML の文字として安全に書く（この道具は1行の値しか書かない）。 */
const quote = (value: string): string =>
  /^[^\s#:{}[\],&*!|>'"%@`-][^#:]*$/.test(value) ? value : `"${value.replace(/"/g, '\\"')}"`;

/**
 * 用語の行から「業務の言葉」と「項目名」を拾う。
 *
 * 拾うのは**書いてある対だけ**（`取引先 = partnerCode` / `取引先: partnerCode`）。
 * 項目名らしきもの（英数字）が無ければ、言葉だけの行として拾う（`field` は書かない
 * ＝機械が項目名を作らない）。
 */
function glossaryOf(text: string): { term: string; field?: string } | null {
  const split = /^(.+?)\s*[=＝:：]\s*([A-Za-z][A-Za-z0-9_]*)\s*$/.exec(text);
  if (split !== null) {
    return { term: split[1].trim(), field: split[2] };
  }
  const word = text.trim();
  return word === "" ? null : { term: word };
}

/**
 * 資料から下書きを起こす。
 *
 * [source] は**人が書いた資料**（Markdown でも素の文でも）。定義を渡されたら投げる。
 */
export function draftProject(source: string): ProjectDraft {
  if (looksLikeDefinition(source)) {
    throw new Error(
      "定義（page: / app: / dsl_version:）が渡されました。" +
        "**前書きを定義から起こしてはいけません**（起こせば必ず一致して、読む値打ちが" +
        "無くなります）。入力は人が書いた資料（提案書・要件メモ）にしてください。",
    );
  }

  const picked: Record<Bucket, number> = {
    what: 0,
    users: 0,
    premises: 0,
    glossary: 0,
    external: 0,
  };
  const what: string[] = [];
  const users: string[] = [];
  const premises: string[] = [];
  const glossary: { term: string; field?: string }[] = [];
  const external: string[] = [];
  const leftovers: DraftLeftover[] = [];

  let here: Bucket | undefined;
  for (const [index, raw] of source.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (line === "") continue;
    const heading = headingOf(raw);
    if (heading !== undefined) {
      here = bucketOf(heading);
      if (here === undefined) {
        leftovers.push({
          line: index + 1,
          text: heading,
          why: "見出しから、前書きのどこに入れるか決められませんでした。",
        });
      }
      continue;
    }
    if (here === undefined) {
      leftovers.push({
        line: index + 1,
        text: line,
        why: "見出しの外に書かれています（どこに入れるか決められません）。",
      });
      continue;
    }
    const text = stripBullet(line);
    if (text === "") continue;
    picked[here] += 1;
    if (here === "what") what.push(text);
    else if (here === "users") users.push(text);
    else if (here === "premises") premises.push(text);
    else if (here === "external") external.push(text);
    else {
      const entry = glossaryOf(text);
      if (entry === null) picked[here] -= 1;
      else glossary.push(entry);
    }
  }

  const out: string[] = [
    "# `hatake project --draft --from` が起こした**下書き**です。",
    "# 書いてある字をそのまま移しただけで、**人が読んで直すまでは正ではありません**。",
    "# 定義からは起こしていません（渡された資料だけを読んでいます）。",
    '$comment: "AI が資料から起こした下書き。人が読んで直すまでは正ではない。"',
    'project_version: "1.0"',
    "system:",
    `  what: ${quote(what.join(" ") || "TODO_この案件が何のシステムかを1〜3行で")}`,
  ];
  if (users.length > 0) {
    out.push("  users:");
    for (const one of users) out.push(`    - ${quote(one)}`);
  }
  if (premises.length > 0) {
    out.push("  premises:");
    for (const one of premises) out.push(`    - ${quote(one)}`);
  }
  if (external.length > 0) {
    // 外の相手は `name`（定義に書く名前）が要るが、資料には無いことが多い＝
    // **機械が名前を作らない**ので、拾った字は what に置いて name は人に書かせる。
    out.push("  external:");
    for (const one of external) {
      out.push("    - name: TODO_定義に書く名前");
      out.push(`      what: ${quote(one)}`);
    }
  }
  if (glossary.length > 0) {
    out.push("glossary:");
    for (const one of glossary) {
      out.push(`  - term: ${quote(one.term)}`);
      if (one.field !== undefined) out.push(`    field: ${one.field}`);
    }
  }
  return { yaml: out.join("\n"), leftovers, picked };
}

/** 人が読む形（拾えなかった行を必ず出す）。 */
export function draftLines(draft: ProjectDraft): string[] {
  const out = [draft.yaml];
  if (draft.leftovers.length > 0) {
    out.push("");
    out.push(`# 拾えなかった行（${draft.leftovers.length}件。捨てていません）:`);
    for (const one of draft.leftovers) {
      out.push(`#   ${one.line}行目: ${one.text}`);
      out.push(`#     ${one.why}`);
    }
  }
  out.push("");
  out.push(DRAFT_NOTE);
  return out;
}

/** 下書きは下書き。 */
export const DRAFT_NOTE =
  "# ※ 拾うのは**見出しのある所だけ**です（推し量って分けると、前提を説明に格下げ" +
  "したりするので）。`system.what` が TODO_ のままなら、そこは人が書いてください。" +
  "外の相手の名前（`name`）も機械は作りません＝定義に書く字は人が決めます。";

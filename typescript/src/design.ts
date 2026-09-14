// 設計書を1枚に刷る（`hatake design`）。
//
// 突き合わせる道具は揃っている（意図・読み返し・問い・助言）が、**人に渡す紙**にはなって
// いない。レビューに出すのは1枚がいいので、4つを1枚に並べる。
//
// この紙の値打ちは「手で書く欄が無い」こと。手で書く欄を1つでも作ると、そこだけ古くなる
// （しかも古い欄は嘘をつく）。人が書くのは**意図の1枚**（`*.intent.yaml`）と**前書き**だけ
// で、この紙はいつでも刷り直せる＝だから刷った日付も入れない（入れると同じ入力で毎回違う
// 紙になり、差分を読めなくなる）。
//
// もう1つの決めごと: **渡されていない紙の節は消さない**。意図を渡さなかったときに「言った
// こと」の節が消えると、読んだ人は「要求が無い案件」だと読む。空にするのではなく「渡されて
// いません＝この紙では言えません」と書く。
//
// 終了コードは動かさない（この紙はレビューに出すもので、合否ではない）。合否は validate と
// trace の担当。

import { type Advice, ADVICE_NOTE } from "./advise.js";
import { type SilencedAdvice, silencedNote } from "./adviseOff.js";
import { type ExplainDocument } from "./explain.js";
import {
  adviceMarkdownLines,
  escapeMarkdown,
  explainBodyMarkdown,
  mdSection,
} from "./explainMarkdown.js";
import { type IntentDocument, requirementsOf } from "./intent.js";
import { type Question, type QuestionRender, questionMarkdown } from "./questions.js";
import { type TraceFinding, type TraceResult } from "./trace.js";

/** 言ったことの側（意図の1枚と、定義との突き合わせ）。 */
export interface DesignIntent {
  /** 読んだファイル名（紙に「何から刷ったか」を書く）。 */
  from: string;
  document: IntentDocument;
  trace: TraceResult;
}

/** 決まっていないことの側（`ask` と同じもの）。 */
export interface DesignQuestions {
  list: Question[];
  render: QuestionRender;
}

/** 1枚に刷るための材料。**無いものは undefined**（黙って空にしない）。 */
export interface DesignParts {
  /** 刷った元の定義（ファイル名）。 */
  from: string;
  /** 読み返し（`explain`）。定義が読めなければこの紙は刷れないので、これだけ必須。 */
  explain: ExplainDocument;
  intent?: DesignIntent;
  /**
   * 意図が無い理由（渡されていない以外のとき）。
   *
   * 「渡されていません」で片付けると嘘になることがある＝app の定義で画面を決めて
   * いないときは、**紙は在るかもしれないのにこちらが選べていない**。
   */
  intentNote?: string;
  /** 問いの表が読めなかったときは undefined＝**数えていない**（0 件とは違う）。 */
  questions?: DesignQuestions;
  advice: Advice[];
  /** 定義の隣の印で黙らせた助言（印が無ければ undefined）。 */
  silenced?: SilencedAdvice;
  /** 読んだ案件の前書き（無ければ undefined）。 */
  projectFrom?: string;
  /** 使った助言の物差し（無ければ組み込みのまま）。 */
  rulesFrom?: string;
}

/** 食い違いの節での言い方（`trace` と同じ語＝2つの言い方をしない）。 */
const FINDING_WORDS: Record<TraceFinding["kind"], string> = {
  "missing-target": "言ったのに入っていない",
  "undecided-but-decided": "未定なのに決まっている",
  orphan: "由来の無い定義（言っていないのに入っている）",
  "no-covers": "どこに落ちたか書いていない要求",
  unconfirmed: "人が見ていない下書き",
};

/** 表の桁の中では `|` が区切りになるので逃がす。 */
const cell = (text: string): string =>
  escapeMarkdown(text).replace(/\|/g, "\\|");

/**
 * 設計書1枚（Markdown）。
 *
 * 同じ材料を渡せば**1バイトも変わらない**（刷り直して古くならないの担保。試験で見ている）。
 */
export function designMarkdown(parts: DesignParts): string {
  const out: string[] = [
    `# 設計書: ${escapeMarkdown(parts.explain.headline)}`,
    "",
    `この紙は \`hatake design\` が \`${parts.from}\` から刷ったものです。` +
      "**手で書く欄はありません**＝直すのは定義と意図の1枚で、この紙は刷り直します。",
    "",
  ];
  out.push(...requirementSection(parts.intent, parts.intentNote));
  out.push("## 読み返し（定義にこう書いてあります）", "");
  out.push(explainBodyMarkdown(parts.explain), "");
  out.push(...questionSection(parts.questions, parts.intent));
  out.push(...adviceSection(parts));
  out.push(...acceptanceSection(parts.intent, parts.intentNote));
  out.push(...blindSection(parts));
  return out.join("\n").trimEnd();
}

/** 言ったこと（要求）。意図の1枚が無ければ、無いと書く。 */
function requirementSection(
  intent: DesignIntent | undefined,
  note: string | undefined,
): string[] {
  const out = ["## 言ったこと（要求）", ""];
  if (intent === undefined) {
    out.push(
      note ??
        "言ったことの1枚（`--intent`）は渡されていません＝**この定義が誰の要求から来たの" +
          "かは、この紙では言えません**（節を消していないのは、空だと「要求が無い」と" +
          "読めてしまうからです）。",
      "",
    );
    return out;
  }
  const items = requirementsOf(intent.document);
  out.push(
    `\`${intent.from}\` から ${items.length} 件。` +
      `定義の中で指せる相手は ${intent.trace.targets.length} 件あります。`,
    "",
  );
  if (items.length > 0) {
    out.push("| id | 言ったこと | 定義のどこに落ちたか | 人が見たか |", "|---|---|---|---|");
    for (const one of items) {
      out.push(
        `| \`${one.id}\` | ${cell(one.text)} | ` +
          `${one.covers.length === 0 ? "書いていません" : one.covers.map((t) => `\`${t}\``).join("、")} | ` +
          `${one.confirmed ? "見た" : "**まだ（AI の下書き）**"} |`,
      );
    }
    out.push("");
  }
  const findings = intent.trace.findings;
  if (findings.length === 0) {
    out.push("言ったものと書いたものは1対1です（余りもありません）。", "");
    return out;
  }
  for (const kind of Object.keys(FINDING_WORDS) as TraceFinding["kind"][]) {
    const mine = findings.filter((one) => one.kind === kind);
    out.push(...mdSection(FINDING_WORDS[kind], mine.map((one) => one.text)));
  }
  return out;
}

/** 決まっていないこと（問い＋意図の未決）。 */
function questionSection(
  questions: DesignQuestions | undefined,
  intent: DesignIntent | undefined,
): string[] {
  const out = ["## 決まっていないこと", ""];
  if (questions === undefined) {
    out.push(
      "問いの表（`spec/question-kinds.json`）が見つからないので、決まっていないことは" +
        "**数えていません**（0 件ではありません）。",
      "",
    );
  } else {
    out.push(questionMarkdown(questions.list, questions.render), "");
  }
  // 意図に書いた未決は、問いとは別物（問いは定義から機械が出すもの、こちらは人が
  // 「まだ決めていない」と書いたもの）。混ぜると、誰が決める番なのかが分からなくなる。
  const undecided = intent?.document.undecided ?? [];
  if (undecided.length > 0) {
    out.push(
      ...mdSection(
        "人が「まだ決めていない」と書いたこと",
        undecided.map((one) => `${one.id}「${one.text}」`),
      ),
    );
  }
  return out;
}

/** 書き足したほうがいい所（助言）。黙らせた件数も必ず書く。 */
function adviceSection(parts: DesignParts): string[] {
  const out = [
    ...mdSection("書き足したほうがいい所（助言）", adviceMarkdownLines(parts.advice), 2),
  ];
  if (parts.silenced !== undefined && parts.silenced.silenced.length > 0) {
    out.push(`> ${escapeMarkdown(silencedNote(parts.silenced))}`);
  }
  if (parts.rulesFrom !== undefined) {
    out.push(`> 助言の物差しは \`${parts.rulesFrom}\` を使いました。`);
  }
  out.push(`> ${escapeMarkdown(ADVICE_NOTE)}`, "");
  return out;
}

/** 終わりの判定（人が書くもの。機械は運べるだけ）。 */
function acceptanceSection(
  intent: DesignIntent | undefined,
  note: string | undefined,
): string[] {
  const lines = intent?.document.acceptance ?? [];
  if (intent === undefined) {
    // ここも消さない。見出しごと無いと、読んだ人は「終わりの判定は要らない紙」だと読む。
    return [
      "## 終わりの判定",
      "",
      note === undefined
        ? "言ったことの1枚が無いので、**何をもって終わりとするか**もありません。"
        : "言ったことの1枚を読めていないので、**何をもって終わりとするか**も出せません。",
      "",
    ];
  }
  if (lines.length === 0) {
    return [
      "## 終わりの判定",
      "",
      "意図の1枚に `acceptance` がありません＝**何をもって終わりとするか**が書いて" +
        "いません（ここは人が書く欄で、機械には作れません）。",
      "",
    ];
  }
  return mdSection("終わりの判定", lines, 2);
}

/** この紙が見ていないもの。毎回書く（読んだ人が「全部見た紙」だと思うのがいちばんまずい）。 */
function blindSection(parts: DesignParts): string[] {
  const lines = [
    "**業務として正しいか**は見ていません（言ったことと書いたことが噛み合っているかまで）。",
    "サーバの中身・プラグインのハンドラ・アプリの登録は見えません（定義の外）。",
    "画面の見た目は出しません（写真は撮らないので、崩れは分かりません）。",
  ];
  if (parts.projectFrom === undefined) {
    lines.push(
      "案件の前書きは読んでいません＝用語と名前の決めごとはこの紙に出ません" +
        "（`--project` で渡せます）。",
    );
  } else {
    lines.push(
      `案件の前書きは \`${parts.projectFrom}\` を読みました` +
        "（`project-` で始まる助言はそこの決めごとです）。",
    );
  }
  return mdSection("この紙が見ていないもの", lines, 2);
}

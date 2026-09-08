// 指示文から**意図の下書き**を起こす。
//
// 意図の器は在っても、**最初の1枚を書くのは人**だった。けれど指示文はもう在る
// （チャットの依頼文・メールの箇条書き・[/asking] の埋めるだけのテンプレ）ので、
// 「1行 → 1件」に開くところまでは機械にできる。
//
// **できるのは開くことだけ。** 何を言ったのかを読み替えたりまとめたりはしない:
//
// * `text` は**その行のまま**（要約すると読んだ側の解釈が混ざる＝言った言ってないの
//   正体）。まとめない・言い換えない・順番を変えない
// * どの分類（`asked` / `decisions` / `undecided`）に置くかは**見出しと合図の言葉**
//   だけで決める。見出しが無ければ全部 `asked`（推し量って分けると、決めごとを要求に
//   格下げしたり、未決を決定にしてしまう）
// * `covers` は**業務の言葉が一致した所**だけ挙げる（定義を渡したときだけ）。
//   一致しなければ空にして、人に振る＝当てずっぽうを書かない
// * 起こしたものは全部 `source: ai-draft`（未確認）。人が読んで `confirmed: true` に
//   するまでは「AI がこう読んだ」以上のことは主張しない
//
// **指示文だけを入力にする**のも決めごと。定義から要求を起こすと必ず一致するので、
// 突き合わせ（[traceIntent]）が何も言わなくなる。

import { stringify } from "yaml";

import type { PageDefinition } from "./definition.js";
import {
  INTENT_VERSION,
  parseTarget,
  type IntentDocument,
  type IntentItem,
  type TargetKind,
} from "./intent.js";
import { traceIntent, traceableParts, type TraceResult } from "./trace.js";

const kindOf = (target: string): TargetKind => parseTarget(target, target).kind;

/** 見出しから分類を決める合図（部分一致・上から順に見る）。 */
const HEADING_CUES: { cues: string[]; into: "undecided" | "decisions" | "acceptance" }[] =
  [
    { cues: ["決まっていない", "決まってない", "未定", "未決", "保留", "TBD"], into: "undecided" },
    { cues: ["決めごと", "制約", "ルール", "規則", "決まり"], into: "decisions" },
    { cues: ["終わりの判定", "完了条件", "受け入れ", "受入", "done"], into: "acceptance" },
  ];

/** 行そのものに書いてある合図（見出しが無いときの受け皿）。 */
const LINE_CUES = ["未定", "未決", "決まっていない", "決まってない", "TBD"];

/**
 * 行の書き出しから、**どの種類の相手**を当てるかを絞る合図。
 *
 * [/asking] の「埋めるだけのテンプレ」がこの形（`探す:` / `見る:` / `押す:`）で
 * 書かせているので、書き出しは推し量りではなく**決まった字**として読める。同じ言葉が
 * 絞り込みと列の両方に在ることは普通なので（「商品名」）、これが無いと1件が両方を
 * 指してしまう。
 *
 * 書き出しに合図が無い行は、種類を絞らない（全部の相手と突き合わせる）。
 */
const KIND_CUES: { cues: string[]; kinds: TargetKind[] }[] = [
  { cues: ["探す", "絞り込み", "絞る", "検索"], kinds: ["filter"] },
  { cues: ["見る", "一覧", "列"], kinds: ["column"] },
  { cues: ["押す", "ボタン"], kinds: ["action"] },
  { cues: ["入れる", "入力", "直す", "項目"], kinds: ["field"] },
  { cues: ["データの出どころ", "出どころ"], kinds: ["repository"] },
];

/** 行の書き出し（`探す:` / `見る:`）が絞っている種類。 */
function narrowedKinds(text: string): TargetKind[] | undefined {
  const head = /^([^:：]{1,12})[:：]/.exec(text);
  if (head === null) return undefined;
  for (const one of KIND_CUES) {
    if (one.cues.some((cue) => head[1].includes(cue))) return one.kinds;
  }
  return undefined;
}

type Bucket = "asked" | "decisions" | "undecided" | "acceptance";

const ID_PREFIX: Record<Exclude<Bucket, "acceptance">, string> = {
  asked: "R",
  decisions: "D",
  undecided: "U",
};

/** 箇条書きの印を落とす（`- ` / `* ` / `・` / `1. `）。 */
function stripBullet(line: string): { text: string; bullet: boolean } {
  const trimmed = line.trim();
  const match = /^(?:[-*+]\s+|・\s*|\d+[.)]\s+)(.*)$/.exec(trimmed);
  if (match === null) return { text: trimmed, bullet: false };
  return { text: match[1].trim(), bullet: true };
}

/** テンプレの案内文（`（1文。例: …）`）か。要求ではないので飛ばす。 */
const isTemplateHint = (text: string): boolean =>
  /^[（(].*[）)]$/.test(text) && (text.includes("例") || text.includes("例:"));

/** 見出しの行なら、その中身を返す。 */
function headingOf(line: string): string | undefined {
  const match = /^#{1,6}\s+(.*)$/.exec(line.trim());
  return match === null ? undefined : match[1].trim();
}

function bucketOfHeading(heading: string): Bucket {
  for (const one of HEADING_CUES) {
    if (one.cues.some((cue) => heading.includes(cue))) return one.into;
  }
  return "asked";
}

/** 散文は**句点で分ける**（人が区切った所で分ける。それ以上は分けない）。 */
function sentences(text: string): string[] {
  if (!text.includes("。")) return [text];
  return text
    .split("。")
    .map((one) => one.trim())
    .filter((one) => one !== "")
    .map((one) => `${one}。`);
}

/** その文が触っている相手（業務の言葉が一致した所だけ）。 */
export function suggestCovers(
  text: string,
  page: PageDefinition | undefined,
): string[] {
  if (page === undefined) return [];
  const lower = text.toLowerCase();
  const kinds = narrowedKinds(text);
  const found: string[] = [];
  for (const part of traceableParts(page)) {
    if (kinds !== undefined && !kinds.includes(kindOf(part.target))) continue;
    const byLabel = part.label.length >= 2 && text.includes(part.label);
    // 名前（`orderNo`）は指示文に API の項目名として出てくることがある。短い名前は
    // 偶然当たるので見ない（`id` が「〜という id」に当たってしまう）。
    const byName =
      part.name.length >= 4 && lower.includes(part.name.toLowerCase());
    if (byLabel || byName) found.push(part.target);
  }
  return found;
}

export interface DraftedIntent {
  document: IntentDocument;
  /** 人がやること（機械が決められなかったこと）。 */
  todo: string[];
  /** 定義を渡したときだけ。起こした下書きで突き合わせた結果。 */
  trace?: TraceResult;
}

/**
 * 指示文を意図の1枚に開く。
 *
 * [page] を渡すと `covers` を業務の言葉から当て、**指示文のどこにも出てこない
 * 定義**（由来の無い項目・ボタン）も [DraftedIntent.trace] に出る＝「言われて
 * いないのに在るもの」がその場で読める。
 */
export function draftIntent(
  instruction: string,
  page?: PageDefinition,
): DraftedIntent {
  const buckets: Record<Bucket, IntentItem[]> = {
    asked: [],
    decisions: [],
    undecided: [],
    acceptance: [],
  };
  const acceptance: string[] = [];
  const todo: string[] = [];
  let hints = 0;
  let split = 0;
  let bucket: Bucket = "asked";
  let fenced = false;

  for (const line of instruction.split(/\r?\n/)) {
    if (line.trim().startsWith("```")) {
      fenced = !fenced;
      continue;
    }
    if (fenced || line.trim() === "" || /^[-*_]{3,}$/.test(line.trim())) continue;

    const heading = headingOf(line);
    if (heading !== undefined) {
      bucket = bucketOfHeading(heading);
      continue;
    }

    const { text, bullet } = stripBullet(line);
    if (text === "") continue;
    if (isTemplateHint(text)) {
      hints += 1;
      continue;
    }

    // 終わりの判定は要求ではなく**回すもの**なので、文のまま並べる。
    if (bucket === "acceptance") {
      acceptance.push(text);
      continue;
    }

    // 箇条書きは1行1件（人がそう区切った）。散文は句点で分ける。
    const pieces = bullet ? [text] : sentences(text);
    if (pieces.length > 1) split += pieces.length;
    for (const piece of pieces) {
      const into: Bucket =
        bucket === "asked" && LINE_CUES.some((cue) => piece.includes(cue))
          ? "undecided"
          : bucket;
      const kind = into as Exclude<Bucket, "acceptance">;
      buckets[kind].push({
        id: `${ID_PREFIX[kind]}${buckets[kind].length + 1}`,
        text: piece,
        covers: suggestCovers(piece, page),
        source: "ai-draft",
        confirmed: false,
      });
    }
  }

  const document: IntentDocument = {
    version: INTENT_VERSION,
    ...(page === undefined ? {} : { page: page.id }),
    asked: buckets.asked,
    decisions: buckets.decisions,
    undecided: buckets.undecided,
    acceptance,
  };

  const total =
    document.asked.length + document.decisions.length + document.undecided.length;
  if (total === 0) {
    todo.push(
      "指示文から要求を1件も起こせませんでした（箇条書きか、句点で区切った文で" +
        "書いてください）。",
    );
  } else {
    todo.push(
      `${total} 件を起こしました。**どれも AI が読んだ下書き**です` +
        `（人が読んで confirmed: true にしてください）。`,
    );
  }
  if (page === undefined) {
    todo.push(
      "定義を渡していないので covers は空です（定義を渡すと、業務の言葉が一致した" +
        "所を当てます）。",
    );
  }
  for (const one of [...document.asked, ...document.decisions]) {
    if (one.covers.length > 0) continue;
    todo.push(
      `${one.id}「${one.text}」は、定義のどこに落ちるか分かりませんでした` +
        `（covers が空）。まだ書いていないか、業務の言葉が定義と違います。`,
    );
  }
  if (document.decisions.length === 0 && document.undecided.length === 0) {
    todo.push(
      "決めごと（decisions）と決まっていないこと（undecided）が空です。" +
        "見出し（「業務の決めごと」「決まっていないこと」）で分けて渡すと分かれます。",
    );
  }
  if (split > 0) {
    todo.push(
      `句点で ${split} 件に分けました。1件に2つの要求が入っているなら、人が分けて` +
        `ください（機械はそこまで読めません）。`,
    );
  }
  if (hints > 0) {
    todo.push(`テンプレの案内文と思われる行を ${hints} 行飛ばしました。`);
  }
  todo.push(
    "誰が言ったか（by）といつ言ったか（at）は指示文からは分かりません。" +
      "言った言ってないは「誰が」まで要るので、人が足してください。",
  );

  const trace = page === undefined ? undefined : traceIntent(page, document);
  for (const one of trace?.findings ?? []) {
    if (one.kind !== "orphan") continue;
    // 「指示文に無い」とは言い切らない。**言葉が一致しなかった**だけのことがある
    // （「CSV出力」と「CSV で落とせるようにする」）。機械が見たのは字だけ。
    todo.push(
      `${one.target} は、どの要求とも言葉が一致しませんでした` +
        `（頼まれていないか、言い方が違うだけです）。`,
    );
  }

  return { document, todo, trace };
}

/** 意図の1枚を、そのまま置ける YAML にする（読むのは [parseIntent]）。 */
export function intentYaml(document: IntentDocument): string {
  const item = (one: IntentItem) => ({
    id: one.id,
    text: one.text,
    ...(one.covers.length > 0 ? { covers: one.covers } : {}),
    ...(one.why === undefined ? {} : { why: one.why }),
    ...(one.by === undefined ? {} : { by: one.by }),
    ...(one.at === undefined ? {} : { at: one.at }),
    ...(one.source === "human" ? {} : { source: one.source }),
    ...(one.confirmed ? { confirmed: true } : {}),
  });
  const body = {
    intent_version: document.version,
    ...(document.page === undefined ? {} : { page: document.page }),
    ...(document.asked.length > 0 ? { asked: document.asked.map(item) } : {}),
    ...(document.decisions.length > 0
      ? { decisions: document.decisions.map(item) }
      : {}),
    ...(document.undecided.length > 0
      ? { undecided: document.undecided.map(item) }
      : {}),
    ...(document.acceptance.length > 0 ? { acceptance: document.acceptance } : {}),
  };
  const header = [
    "# hatake intent --draft が指示文から起こした下書き。",
    "# **要求は AI が読んだもの**（source: ai-draft）なので、人が読んでから使うこと。",
    "# 読んだら confirmed: true を足す。covers が空の件は、落ちる先を人が書く。",
  ].join("\n");
  // 日本語は折り返すと読めないので、行の幅で折らない。
  return `${header}\n${stringify(body, { lineWidth: 0 })}`;
}

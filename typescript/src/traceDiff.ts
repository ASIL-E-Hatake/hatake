// その変更は**どの要求から来たか**（`trace --diff <前> <後>`）。
//
// `diff` は「何が変わったか」しか言えない。**なぜ変わったか**は人が PR 本文に書くしか
// なく、書き忘れると半年後に誰も理由を思い出せない。意図の1枚（`*.intent.yaml`）と
// 定義の差を組めば、そこは機械が言える:
//
//   ・足された相手に**由来がある**（`R7` が指している）… その要求から来た変更
//   ・足された相手に**由来が無い**… 誰も頼んでいない。AI に直させると必ず出る類
//   ・消えた相手を**指していた要求がある**… その要求が空を指すようになった
//
// **言えないことを決めてある。** 足された／消えた以外（ラベルを書き換えた・必須を
// 外した）は、指せる相手が動かないので**由来を言えない**。件数だけ出して「言えない」と
// 書く ── そこを推し量ると、由来の表そのものが信用されなくなる。
//
// 由来が無い変更で落とすかどうかは呼ぶ側（`--require-intent`）。既定では落とさない＝
// 意図を後から書き始めた定義では最初から全部「由来が無い」になるので、落とすと道具ごと
// 使われなくなる（`trace` と同じ判断）。

import { type PageDefinition } from "./definition.js";
import { requirementsOf, type IntentDocument, type IntentItem } from "./intent.js";
import { traceableParts, type TraceablePart } from "./trace.js";

/** 足された／消えた相手1つ。 */
export interface TargetChange {
  kind: "added" | "removed";
  /** `field:orderNo` の形。 */
  target: string;
  /** 定義に書いてあるラベル（業務の言葉）。 */
  label: string;
  /** その相手を指している要求の id（無ければ空）。 */
  from: string[];
}

export interface TraceDiffResult {
  page: string;
  /** 意図の1枚を渡されたか。 */
  hasIntent: boolean;
  /** 足された／消えた相手（並びは固定）。 */
  changes: TargetChange[];
  /** 相手は動かないが説明が変わった件数（由来は言えない）。 */
  reworded: number;
  /** 由来の無い変更（`changes` の中の `added` で `from` が空のもの）。 */
  orphans: TargetChange[];
}

const labelOf = (parts: TraceablePart[], target: string): string =>
  parts.find((one) => one.target === target)?.label ?? target;

/** その相手を指している要求。 */
const coveredBy = (items: IntentItem[], target: string): string[] =>
  items.filter((one) => one.covers.includes(target)).map((one) => one.id);

/**
 * 前と後の定義を、意図の1枚と突き合わせる。
 *
 * `explained` は**説明の差**（`explain --diff` の変更）をそのまま渡す。数え方は
 * あちらの担当で、ここでは**足された／消えた相手の話ではないもの**だけを数え直す
 * （足した列は説明の差にも出るので、両方で数えると「相手は同じなのに変わった」が
 * 嘘になる）。
 */
export function traceDiff(
  before: PageDefinition,
  after: PageDefinition,
  intent: IntentDocument | undefined,
  explained: { subject?: string }[] = [],
): TraceDiffResult {
  const was = traceableParts(before);
  const now = traceableParts(after);
  const wasSet = new Set(was.map((one) => one.target));
  const nowSet = new Set(now.map((one) => one.target));
  const items = intent === undefined ? [] : requirementsOf(intent);

  const changes: TargetChange[] = [
    ...now
      .filter((one) => !wasSet.has(one.target))
      .map((one) => ({
        kind: "added" as const,
        target: one.target,
        label: one.label,
        from: coveredBy(items, one.target),
      })),
    ...was
      .filter((one) => !nowSet.has(one.target))
      .map((one) => ({
        kind: "removed" as const,
        target: one.target,
        label: labelOf(was, one.target),
        from: coveredBy(items, one.target),
      })),
  ];

  // 足された／消えた相手のラベルで出ている説明の差は、そちらで言っているので数えない。
  const moved = new Set(changes.map((one) => one.label));
  const reworded = explained.filter(
    (one) => one.subject === undefined || !moved.has(one.subject),
  ).length;

  return {
    page: after.id,
    hasIntent: intent !== undefined,
    changes,
    reworded,
    // 意図が無ければ「由来が無い」とは言わない（全部が由来なしになるので、意味が無い）。
    orphans:
      intent === undefined
        ? []
        : changes.filter((one) => one.kind === "added" && one.from.length === 0),
  };
}

/** 人が読む形。 */
export function traceDiffLines(result: TraceDiffResult): string[] {
  const out: string[] = [];
  if (!result.hasIntent) {
    out.push(
      `${result.page} には意図の1枚（intent）がありません。` +
        "変わった所は出せますが、**どの要求から来たのかは言えません**。",
      "",
    );
  }
  const added = result.changes.filter((one) => one.kind === "added");
  const removed = result.changes.filter((one) => one.kind === "removed");

  if (added.length === 0 && removed.length === 0) {
    out.push("足された相手も、消えた相手もありません。");
  }
  if (added.length > 0) {
    out.push(`足されたもの（${added.length} 件）:`);
    for (const one of added) {
      out.push(
        `  ・${one.target}「${one.label}」… ` +
          (one.from.length > 0
            ? `${one.from.join(" / ")} から`
            : result.hasIntent
              ? "**どの要求からも来ていません**"
              : "由来は言えません（意図の1枚がありません）"),
      );
    }
  }
  if (removed.length > 0) {
    if (added.length > 0) out.push("");
    out.push(`消えたもの（${removed.length} 件）:`);
    for (const one of removed) {
      out.push(
        `  ・${one.target}「${one.label}」… ` +
          (one.from.length > 0
            ? `${one.from.join(" / ")} が指していました（その要求は空を指すようになります）`
            : "どの要求も指していませんでした"),
      );
    }
  }
  if (result.reworded > 0) {
    out.push("");
    out.push(
      `ほかに ${result.reworded} 件、**相手は同じで説明だけが変わっています**` +
        "（ラベル・必須・見せ方など）。指せる相手が動かないので、**由来は言えません** ── " +
        "そこは hatake explain --diff で読んでください。",
    );
  }
  out.push("");
  out.push(TRACE_DIFF_NOTE);
  return out;
}

/** この突き合わせに言えないことを毎回書く。 */
export const TRACE_DIFF_NOTE =
  "※ 言えるのは**足された／消えた相手**の由来だけです。書き換え（ラベル・必須・" +
  "見せ方）は指せる相手が動かないので由来を言えません。" +
  "**由来が無い＝間違い、ではありません**（先に書いて、あとで意図に足すこともあります）" +
  "＝既定では落としません。CI で止めるなら --require-intent を渡してください。";

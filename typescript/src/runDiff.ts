// 前回叩いた結果と、いま叩いた結果を比べる（`--since`）。
//
// 通信しない素の関数にしてある（叩く所と分けてあるのは [probeShape] と同じ理由＝判定を
// 試験で並べられるようにするため）。
//
// 嘘をつかないための決めごと:
//   ・**消えた穴を「直った」と言い切らない。** 前回叩けていた相手を今回叩いていなければ
//     （資格が切れた・役割を書き忘れた）、その穴は報告から消える。消えたことと直った
//     ことは別なので、叩いていない相手のぶんは**「分かりません」**と言う。
//   ・**叩けなくなったこと自体を「新しい」に数える。** 毎晩「新しい穴だけで落とす」
//     使い方（`--fail-on new`）で、資格が切れた晩に静かに通ってしまうと、その日から
//     何も見ていないのに緑のままになる。
//   ・**変わらないものは並べない。** それが `--since` の目的（人は同じ表を読み続け
//     られない）。ただし件数は必ず出す＝「前から 3 件残っている」を隠さない。

import type { RunGap, RunItem, RunKind, RunSnapshot } from "./runSnapshot.js";

/** 状態が変わった1件。 */
export interface RunChange {
  item: RunItem;
  /** 前回の状態。 */
  was: string;
}

/** 前回あって今回無い1件。 */
export interface RunGone {
  item: RunItem;
  /** 相手を叩いていないので、直ったかどうかが分からない。 */
  unknown: boolean;
  /** 叩かなかった理由（分からないとき）。 */
  why?: string;
}

export interface RunDiff {
  kind: RunKind;
  /** 前回に無かったもの。 */
  added: RunItem[];
  /** 状態が変わったもの。 */
  changed: RunChange[];
  /** 前回あって今回無いもの。 */
  gone: RunGone[];
  /** 変わらず出続けているもの（在ると落ちるものだけ数える）。 */
  staying: number;
  /** 前回は叩けていたのに、今回叩いていない相手。 */
  lost: RunGap[];
}

/** 比べる（前 → 後）。 */
export function diffRuns(before: RunSnapshot, after: RunSnapshot): RunDiff {
  if (before.kind !== after.kind) {
    throw new Error(
      `前回は ${before.kind}、今回は ${after.kind} の結果です（別の道具の結果は比べられません）。`,
    );
  }
  const past = new Map(before.items.map((one) => [one.id, one]));
  const now = new Map(after.items.map((one) => [one.id, one]));
  const covered = new Set(after.covered);

  const added: RunItem[] = [];
  const changed: RunChange[] = [];
  let staying = 0;
  for (const [id, item] of now) {
    const was = past.get(id);
    if (was === undefined) {
      added.push(item);
    } else if (was.state !== item.state) {
      changed.push({ item, was: was.state });
    } else if (item.bad) {
      staying++;
    }
  }

  const reasons = new Map(after.uncovered.map((one) => [one.scope, one.reason]));
  const gone: RunGone[] = [];
  for (const [id, item] of past) {
    if (now.has(id)) continue;
    const unknown = !covered.has(item.scope);
    gone.push({
      item,
      unknown,
      ...(unknown ? { why: reasons.get(item.scope) ?? "今回は叩いていません" } : {}),
    });
  }

  const missing = before.covered.filter((scope) => !covered.has(scope));
  const lost = missing
    // 役割ごと叩けなかったときは、その役割の画面を1行ずつ並べない（同じ話が
    // 「staff」「staff: 受注照会」「staff: 単価マスタ」の3行になる）。
    .filter(
      (scope) => !missing.some((other) => scope.startsWith(`${other}: `)),
    )
    .map((scope) => ({
      scope,
      reason: reasons.get(scope) ?? "今回は叩いていません（理由が残っていません）",
    }));

  return { kind: after.kind, added, changed, gone, staying, lost };
}

/**
 * 落とすかどうか（`--fail-on new`）。
 *
 * 新しく出た悪いもの・悪い側に変わったもの・**叩けなくなった相手**で落とす。3つ目を
 * 入れないと、資格が切れた晩から「新しい穴なし」で緑のまま止まる。
 */
export const hasNewTrouble = (diff: RunDiff): boolean =>
  diff.added.some((one) => one.bad) ||
  diff.changed.some((one) => one.item.bad) ||
  diff.lost.length > 0 ||
  // 相手が減った理由が残っていない場合の取りこぼしも拾う（消えた穴を黙って
  // 「無くなった」にしないのが、この道具の一番の仕事）。
  diff.gone.some((one) => one.unknown);

const KIND_TITLE: Record<RunKind, string> = {
  probe: "定義とサーバの食い違い",
  attack: "権限の穴",
  "attack-sweep": "権限の穴（役割ぜんぶ）",
};

/** 人が読む形。**変わった所だけ**が本体で、残っている数は最後に1行で言う。 */
export function renderRunDiff(diff: RunDiff): string {
  const out: string[] = [`${KIND_TITLE[diff.kind]}: 前回との違い`, ""];
  const line = (item: RunItem): string => `    ${item.where}: ${item.what}`;

  if (diff.lost.length > 0) {
    out.push("■ 前回は叩けていたのに、今回叩いていない相手");
    for (const one of diff.lost) out.push(`    ${one.scope}: ${one.reason}`);
    out.push("    → この相手のことは、今回の結果からは何も言えません。");
    out.push("");
  }
  if (diff.added.length > 0) {
    out.push("■ 新しく出たもの");
    for (const one of diff.added) out.push(`  [${one.state}] ${line(one).trim()}`);
    out.push("");
  }
  if (diff.changed.length > 0) {
    out.push("■ 変わったもの");
    for (const one of diff.changed) {
      out.push(`  [${one.was} → ${one.item.state}] ${line(one.item).trim()}`);
    }
    out.push("");
  }
  const fixed = diff.gone.filter((one) => !one.unknown);
  const lostSight = diff.gone.filter((one) => one.unknown);
  if (fixed.length > 0) {
    out.push("■ 前回あって今回無いもの（同じ所を叩いています）");
    for (const one of fixed) out.push(`  [直った] ${line(one.item).trim()}`);
    out.push("");
  }
  if (lostSight.length > 0) {
    out.push("■ 前回あって今回無いもの（叩いていないので、直ったかは分かりません）");
    for (const one of lostSight) {
      out.push(`  [分からない] ${line(one.item).trim()}（${one.why}）`);
    }
    out.push("");
  }
  if (
    diff.added.length === 0 &&
    diff.changed.length === 0 &&
    diff.gone.length === 0 &&
    diff.lost.length === 0
  ) {
    out.push("前回と同じです（変わった所はありません）。");
    out.push("");
  }
  out.push(`前から続いているもの: ${diff.staying} 件（変わっていないので並べていません）`);
  return out.join("\n");
}

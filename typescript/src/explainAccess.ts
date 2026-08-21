// 「この画面を開けるのは誰か」を、説明の言葉にする。
//
// これは**1枚だけ読んでも出ない**値。ページに `roles` は書けないので、開ける人は
// メニューとボタンをたどって数えるしかない（[appAccess]）。いままでその答えを持って
// いたのは図（`hatake diagram --roles`）だけで、**図を開かないと分からなかった**。
//
// レビューは1枚の紙で読む。紙に権限が載っていなければ、権限は見られないまま通る。
// だから同じ答えを `explain` と `explain --review` にも出す（計算はもちろん共有する
// ＝図と説明と警告で違うことを言わない）。
//
// ここでやるのは言い方だけ。誰が開けるかを**決める**のは [appAccess] で、間違いを
// **警告する**のは `validate`（`page-nobody-can-open`）。この3つは混ぜない。

import {
  type AccessEntry,
  type AppAccess,
  type Audience,
  describeAudience,
  nobodyCanOpen,
} from "./appAccess.js";
import type { Lang } from "./explainPhrases.js";
import { voice } from "./explainVoice.js";

/** 1枚ぶんの「開ける人」。 */
export interface PageAccess {
  audience: Audience;
  /** その画面への入口（空 = メニューにも遷移先にも書かれていない）。 */
  entries: AccessEntry[];
}

/** 画面1枚の節の見出し（日本語。言語を選ぶなら [voice] の `accessTitle`）。 */
export const ACCESS_TITLE = voice("ja").accessTitle;

/** app 全体の節の見出し（1枚ずつではなく一覧で見せる）。 */
export const ACCESS_OVERVIEW_TITLE = voice("ja").accessOverviewTitle;

/** [access] から1枚ぶんを取り出す。 */
export const pageAccess = (access: AppAccess, id: string): PageAccess => ({
  audience: access.audience.get(id) ?? { everyone: false, roles: [] },
  entries: access.entries.get(id) ?? [],
});

/**
 * 入口1つの言い方。
 *
 * **どこから来られるか**まで言う。「admin だけ」と言われても、直す場所は入口なので、
 * 入口が分からないと読んだ人は動けない。
 */
function describeEntry(entry: AccessEntry, lang: Lang): string {
  const v = voice(lang);
  const from = entry.from === "menu" ? v.fromMenu : v.fromPage(entry.from);
  const who =
    entry.roles.length === 0 ? v.anyonePasses : v.onlyRolesPass(entry.roles);
  return v.entryLine(entry.label, from, who);
}

/**
 * 画面1枚の「開ける人」。
 *
 * 行は「主語 … 説明」に揃える（`explain --diff` が前後で同じものを指す行を組める形）。
 */
export function accessLines(access: PageAccess, lang: Lang = "ja"): string[] {
  const v = voice(lang);
  const { audience, entries } = access;
  if (entries.length === 0) {
    // 入口が無いのに開ける＝メニューの無い app の最初の画面（図と同じ読み方）。
    if (audience.everyone) return [v.openToAnyoneNoMenu];
    return [v.noEntryWritten];
  }
  const lines = [
    nobodyCanOpen(audience)
      ? v.nobodyOpens
      : v.opensTo(describeAudience(audience, lang)),
  ];
  for (const entry of entries) lines.push(describeEntry(entry, lang));
  return lines;
}

/**
 * app 全体の「どの画面を誰が開けるか」。
 *
 * 1枚ずつ引かせない＝棚卸しは一覧で見るもの。並びは定義に書いてある順（画面の節と
 * 同じ順にすると、目が行き来しない）。
 */
export function accessOverviewLines(
  access: AppAccess,
  pages: { id: string; title: string }[],
  lang: Lang = "ja",
): string[] {
  const v = voice(lang);
  return pages.map((page) => {
    const one = pageAccess(access, page.id);
    const who =
      one.entries.length === 0 && !one.audience.everyone
        ? v.overviewNoEntry
        : nobodyCanOpen(one.audience)
          ? v.overviewNobody
          : describeAudience(one.audience, lang);
    return v.subject(v.titleWithId(page.title, page.id), who);
  });
}

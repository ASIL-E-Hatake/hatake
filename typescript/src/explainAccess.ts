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

/** 1枚ぶんの「開ける人」。 */
export interface PageAccess {
  audience: Audience;
  /** その画面への入口（空 = メニューにも遷移先にも書かれていない）。 */
  entries: AccessEntry[];
}

/** 画面1枚の節の見出し。 */
export const ACCESS_TITLE = "この画面を開ける人";

/** app 全体の節の見出し（1枚ずつではなく一覧で見せる）。 */
export const ACCESS_OVERVIEW_TITLE = "画面を開ける人";

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
function describeEntry(entry: AccessEntry): string {
  const from = entry.from === "menu" ? "メニュー" : `${entry.from} から`;
  const who =
    entry.roles.length === 0 ? "誰でも通れる" : `${entry.roles.join(" / ")} だけが通れる`;
  return `入口「${entry.label}」（${from}） … ${who}`;
}

/**
 * 画面1枚の「開ける人」。
 *
 * 行は「主語 … 説明」に揃える（`explain --diff` が前後で同じものを指す行を組める形）。
 */
export function accessLines(access: PageAccess): string[] {
  const { audience, entries } = access;
  if (entries.length === 0) {
    // 入口が無いのに開ける＝メニューの無い app の最初の画面（図と同じ読み方）。
    if (audience.everyone) {
      return [
        "開けるのは … 誰でも（メニューが無いアプリなので、最初に開く画面として開く）",
      ];
    }
    return [
      "入口 … 書かれていない（メニューにも他の画面からの遷移にも出てこない" +
        "＝アプリのコードから開く画面）",
    ];
  }
  const lines = [
    nobodyCanOpen(audience)
      ? "開けるのは … 誰も開けない（入口はあるが、権限が食い違っている）"
      : `開けるのは … ${describeAudience(audience)}`,
  ];
  for (const entry of entries) lines.push(describeEntry(entry));
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
): string[] {
  return pages.map((page) => {
    const one = pageAccess(access, page.id);
    const who =
      one.entries.length === 0 && !one.audience.everyone
        ? "入口が書かれていない（アプリのコードから開く）"
        : nobodyCanOpen(one.audience)
          ? "誰も開けない（入口の権限が食い違っている）"
          : describeAudience(one.audience);
    return `${page.title}（${page.id}） … ${who}`;
  });
}

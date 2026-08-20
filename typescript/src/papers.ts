// 用紙の実寸（ポイント）。
//
// 画面のプレビューは比率しか要らないが、**紙に入るかどうか**は実寸でしか言えない。
// 「A4 縦に幅 200pt の列を5本」は、定義を読んだ時点で入らないと分かる。
//
// 正は [`spec/papers.json`](../../spec/papers.json)。ここは転記で、一致することを試験で
// 確かめている（刷る側の Dart 版も同じ表を転記している＝3か所が同じ数を使う）。
// 転記するのは、警告が**素の関数**であるため（ファイルを読める場所でしか動かない道具に
// したくない。ブラウザでも試験でも同じように動く必要がある）。

import { Orientations, PaperSizes } from "./definition.js";

/** 1枚の紙の大きさ（ポイント）。 */
export interface PaperSize {
  width: number;
  height: number;
}

/** 組み込みの用紙（すべて縦）。 */
export const PAPERS: Record<string, PaperSize> = {
  [PaperSizes.a4]: { width: 595.28, height: 841.89 },
  [PaperSizes.a3]: { width: 841.89, height: 1190.55 },
  [PaperSizes.b5]: { width: 515.91, height: 728.5 },
  [PaperSizes.letter]: { width: 612, height: 792 },
};

/**
 * 定義の用紙指定を実寸にする。知らない名前は undefined
 * （開いた文字列なので、知らないことを**知らないと言う**）。
 */
export function paperSize(
  paper: { size?: unknown; orientation?: unknown } | undefined,
): PaperSize | undefined {
  const name = typeof paper?.size === "string" ? paper.size : PaperSizes.a4;
  const base = PAPERS[name];
  if (base === undefined) return undefined;
  return paper?.orientation === Orientations.landscape
    ? { width: base.height, height: base.width }
    : base;
}

/** 人が読む向きの名前（警告の文に出す）。 */
export const paperName = (
  paper: { size?: unknown; orientation?: unknown } | undefined,
): string => {
  const name = typeof paper?.size === "string" ? paper.size : PaperSizes.a4;
  return `${name} ${paper?.orientation === Orientations.landscape ? "横" : "縦"}`;
};

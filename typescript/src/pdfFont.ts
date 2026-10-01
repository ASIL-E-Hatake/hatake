// PDF に名前で指す書体（**埋め込まない**）。Dart 版（`hatake_print` の `PdfFont`）の転記。
//
// 書体を埋め込まないのは、配る PDF を小さく・決定的に保つため（同じ入力なら同じ
// バイト列）。字の形は開いた環境が決めるが、字送りは `/W` で固定してあるので、
// 寄せと罫線はずれない。

export interface PdfFont {
  /** PDF に書く書体の名前（`/BaseFont`）。 */
  readonly baseFont: string;
  /** 文字の符号化（CID なら CMap の名前）。 */
  readonly encoding: string;
  /** 日本語を書ける合成フォント（CID）か。false は標準14フォント（英数だけ）。 */
  readonly cid: boolean;
  readonly registry: string;
  readonly ordering: string;
  readonly supplement: number;
}

const cidFont = (baseFont: string): PdfFont => ({
  baseFont,
  encoding: "UniJIS-UCS2-H",
  cid: true,
  registry: "Adobe",
  ordering: "Japan1",
  supplement: 6,
});

export const PdfFonts = {
  /** ゴシック体（既定）。 */
  gothic: cidFont("GothicBBB-Medium"),
  /** 明朝体。 */
  mincho: cidFont("Ryumin-Light"),
  /** 英数だけの帳票向け（日本語は `?` になる）。 */
  helvetica: {
    baseFont: "Helvetica",
    encoding: "WinAnsiEncoding",
    cid: false,
    registry: "Adobe",
    ordering: "Japan1",
    supplement: 6,
  } as PdfFont,
} as const;

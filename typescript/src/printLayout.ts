// 紙の中立な出力形（座標まで決めた「刷る前の紙」）。
//
// `ReportDocument` が「紙の中身」なら、こちらは**紙の上のどこに何があるか**。Dart 版
// （`hatake_print` の `PrintLayout`）と同じ形・同じ数を出す（共有フィクスチャで縛る）。
//
// 座標は **左上原点・ポイント・y は下向き**（人が紙を読む向き）。
//
// TS 版が要る理由は「刷るため」ではない。**読ませるため**。
//   ・AI は画面も紙も見られない。座標の並びを文字にすれば、列の順・小計の位置・
//     切れた文字が読める（[renderPaperText] / MCP の `hatake_print_preview`）
//   ・体裁の間違い（紙に入らない・列が潰れる）を、刷る前に人にも AI にも見せられる
// PDF は作らない（バイト列を作るのは Dart 版の仕事で、そこは1つでよい）。

/** 文字の寄せ方（開いた文字列）。 */
export const PrintAligns = {
  left: "left",
  right: "right",
  center: "center",
} as const;

/** 一続きの文字。 */
export interface PrintText {
  kind: "text";
  /** 置ける枠の左端。 */
  x: number;
  /** **ベースライン**の y（文字の下端ではない）。 */
  y: number;
  /** 置ける枠の幅（[align] の基準。溢れた文字は組む前に切ってある）。 */
  width: number;
  text: string;
  size: number;
  /** 太字（標準の日本語フォントに太さは無いので、刷る側が縁取りで太らせる）。 */
  bold: boolean;
  /** [PrintAligns] のいずれか。 */
  align: string;
}

/** 横罫線（見出しの下・小計の上）。 */
export interface PrintRule {
  kind: "rule";
  x: number;
  y: number;
  width: number;
  thickness: number;
}

export type PrintItem = PrintText | PrintRule;

/** 紙1枚。 */
export interface PrintPage {
  /** 1始まりのページ番号。 */
  number: number;
  items: PrintItem[];
}

/** 刷るもの1本ぶん。 */
export interface PrintLayout {
  /** 用紙の実寸（ポイント）。 */
  paper: { width: number; height: number };
  pages: PrintPage[];
  /** 紙の題（PDF のタブに出るもの）。 */
  title: string;
}

/** 寄せを解いた左端（右寄せ・中央寄せの実際の位置）。 */
export function alignedX(text: PrintText, width: number): number {
  if (text.align === PrintAligns.right) return text.x + text.width - width;
  if (text.align === PrintAligns.center) {
    return text.x + (text.width - width) / 2;
  }
  return text.x;
}

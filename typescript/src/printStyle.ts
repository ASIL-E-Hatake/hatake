// 紙の体裁（余白・文字の大きさ・ヘッダフッタ）。
//
// 定義（DSL）に持たせていないのは、これが**業務ではなく印刷所の話**だから。
// 「A4 で 30 行」は業務の要求だが、「余白 10mm・脚注に部署名」は刷り方の設定。
//
// 既定値は Dart 版（`hatake_print` の `PrintStyle`）と同じ数でなければならない。
// ここがズレると、**AI が見た紙と刷った紙が違う**。共有フィクスチャで縛る。

/** 刷り方の設定（渡さなければ既定値だけで A4 の一覧帳票が組める）。 */
export interface PrintStyle {
  /** 四方の余白（ポイント。36pt = 0.5 inch ≒ 12.7mm）。 */
  margin: number;
  /** 表題の文字の大きさ。 */
  titleSize: number;
  /** 列見出しの文字の大きさ。 */
  headingSize: number;
  /** 明細の文字の大きさ（1枚に載る行数が多いと、これより小さくなる）。 */
  bodySize: number;
  /** 明細1行の高さ（同じく、行数が多いと縮む）。 */
  rowHeight: number;
  /** 列と列のあいだ。 */
  columnGap: number;
  /** ページ番号の書き方（`{page}` / `{pages}`。空文字で出さない）。 */
  pageNumber: string;
  /**
   * 脚注（`{page}` / `{pages}` が使える）。
   *
   * **日付は既定で入れない。** 入れると同じ帳票が刷るたび違うものになり、「前と同じ
   * ものが出ているか」を確かめられなくなる。要る人がここに渡す。
   */
  footer: string;
  /** 小計行の見出し（画面の帳票プレビューと同じ言葉）。 */
  subtotalLabel: string;
  /** 総計行の見出し。 */
  grandTotalLabel: string;
  /** 件数（`count`）の後ろに付ける語。 */
  countSuffix: string;
}

/** 既定の体裁（Dart 版の `PrintStyle()` と同じ数）。 */
export const DEFAULT_PRINT_STYLE: PrintStyle = {
  margin: 36,
  titleSize: 12,
  headingSize: 8,
  bodySize: 9,
  rowHeight: 16,
  columnGap: 6,
  pageNumber: "{page} / {pages}",
  footer: "",
  subtotalLabel: "小計",
  grandTotalLabel: "合計",
  countSuffix: "件",
};

/** 渡された分だけ差し替える（残りは既定）。 */
export const printStyle = (partial: Partial<PrintStyle> = {}): PrintStyle => ({
  ...DEFAULT_PRINT_STYLE,
  ...partial,
});

/** `{page}` / `{pages}` を埋める。 */
export const fillPageNumber = (
  template: string,
  page: number,
  pages: number,
): string =>
  template.replaceAll("{page}", String(page)).replaceAll("{pages}", String(pages));

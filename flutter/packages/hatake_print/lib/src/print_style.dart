// 紙の体裁（余白・文字の大きさ・ヘッダフッタ）。
//
// 定義（DSL）に持たせていないのは、これが**業務ではなく印刷所の話**だから。
// 「A4 で 30 行」は業務の要求だが、「余白 10mm・脚注に部署名」は刷り方の設定。
// 定義を汚さずに、アダプタを呼ぶ側が渡す。

/// 刷り方の設定。既定値だけで A4 の一覧帳票が刷れる。
class PrintStyle {
  /// 四方の余白（ポイント。36pt = 0.5 inch ≒ 12.7mm）。
  final double margin;

  /// 表題の文字の大きさ。
  final double titleSize;

  /// 列見出しの文字の大きさ。
  final double headingSize;

  /// 明細の文字の大きさ（1枚に載る行数が多いと、これより小さくなる）。
  final double bodySize;

  /// 明細1行の高さ（同じく、行数が多いと縮む）。
  final double rowHeight;

  /// 列と列のあいだ。
  final double columnGap;

  /// ページ番号の書き方。`{page}` / `{pages}` が置き換わる。空文字で出さない。
  final String pageNumber;

  /// 脚注（`{page}` / `{pages}` が使える）。既定は空。
  ///
  /// **日付は既定で入れない。** 入れると同じ帳票が刷るたび違うバイト列になり、
  /// 「前と同じものが出ているか」を確かめられなくなる。要る人がここに渡す。
  final String footer;

  /// 小計行の見出し（画面の帳票プレビューと同じ言葉を既定にしてある）。
  final String subtotalLabel;

  /// 総計行の見出し。
  final String grandTotalLabel;

  /// 件数（`count`）の後ろに付ける語。
  final String countSuffix;

  const PrintStyle({
    this.margin = 36,
    this.titleSize = 12,
    this.headingSize = 8,
    this.bodySize = 9,
    this.rowHeight = 16,
    this.columnGap = 6,
    this.pageNumber = '{page} / {pages}',
    this.footer = '',
    this.subtotalLabel = '小計',
    this.grandTotalLabel = '合計',
    this.countSuffix = '件',
  });

  /// `{page}` / `{pages}` を埋める。
  String fill(String template, int page, int pages) => template
      .replaceAll('{page}', '$page')
      .replaceAll('{pages}', '$pages');
}

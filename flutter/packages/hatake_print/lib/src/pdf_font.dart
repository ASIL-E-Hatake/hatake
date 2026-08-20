// PDF で使うフォントの指定。
//
// **埋め込まない。** 日本語のフォントは1本 5〜20MB あり、再配布の可否も書体ごとに
// 違う。PDF には「標準の日本語フォント」を名前で指定する仕組みがあり（Adobe-Japan1
// の CID フォント）、業務帳票では昔からこれが使われてきた。ビューア側が実際の書体
// （游明朝・MS ゴシックなど）を当てる。
//
// 得るもの: 1枚 数KB の PDF・依存ゼロ・毎回同じバイト列。
// 失うもの: **書体は受け取った環境が決める**。字面まで固定したい（外字がある・
// 見本と1ドットも変えたくない）場合は埋め込みが要る → README の「埋め込み」。

/// PDF に書くフォントの指定。
class PdfFont {
  /// PDF の `/BaseFont`（例 `GothicBBB-Medium`）。
  final String baseFont;

  /// CID フォントの符号化（`UniJIS-UCS2-H`）／標準14の符号化（`WinAnsiEncoding`）。
  final String encoding;

  /// true = 日本語が書ける CID フォント。false = 標準14（英数のみ）。
  final bool cid;

  /// `/CIDSystemInfo` の3つ組（[cid] のときだけ使う）。
  final String registry;
  final String ordering;
  final int supplement;

  const PdfFont({
    required this.baseFont,
    required this.encoding,
    this.cid = true,
    this.registry = 'Adobe',
    this.ordering = 'Japan1',
    this.supplement = 6,
  });

  /// ゴシック体（表の中の数字と細かい字が読みやすい。既定）。
  static const PdfFont gothic = PdfFont(
    baseFont: 'GothicBBB-Medium',
    encoding: 'UniJIS-UCS2-H',
  );

  /// 明朝体（案内文・請求書のような「読ませる」帳票）。
  static const PdfFont mincho = PdfFont(
    baseFont: 'Ryumin-Light',
    encoding: 'UniJIS-UCS2-H',
  );

  /// 英数だけの帳票（標準14フォント。日本語は `?` になる）。
  static const PdfFont helvetica = PdfFont(
    baseFont: 'Helvetica',
    encoding: 'WinAnsiEncoding',
    cid: false,
  );
}

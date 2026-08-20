// 用紙の実寸（ポイント。1pt = 1/72 inch = PDF の座標単位）。
//
// 画面のプレビューは**比率**しか要らないが、紙に刷るには実寸が要る。ここが
// 「A4」という名前を数に変える唯一の場所。

import 'package:hatake_core/hatake_core.dart';

/// 1枚の紙の大きさ（ポイント）。
class PrintPaper {
  final double width;
  final double height;

  const PrintPaper(this.width, this.height);

  /// 横長にした同じ紙。
  PrintPaper get landscape =>
      width >= height ? this : PrintPaper(height, width);

  /// 縦長にした同じ紙。
  PrintPaper get portrait => width <= height ? this : PrintPaper(height, width);

  @override
  String toString() => 'PrintPaper($width x $height)';
}

/// 組み込みの用紙（すべて縦。横は [PrintPaper.landscape]）。
///
/// mm を 72/25.4 倍した値を、そのまま書いてある（計算式にすると、言語ごとの
/// 丸めでバイト列が変わる）。
abstract final class PrintPapers {
  const PrintPapers._();

  /// A4（210 x 297 mm）。
  static const PrintPaper a4 = PrintPaper(595.28, 841.89);

  /// A3（297 x 420 mm）。
  static const PrintPaper a3 = PrintPaper(841.89, 1190.55);

  /// B5（JIS B5、182 x 257 mm）。
  static const PrintPaper b5 = PrintPaper(515.91, 728.5);

  /// Letter（8.5 x 11 inch）。
  static const PrintPaper letter = PrintPaper(612, 792);

  /// 名前 → 実寸。
  static const Map<String, PrintPaper> byName = {
    PaperSizes.a4: a4,
    PaperSizes.a3: a3,
    PaperSizes.b5: b5,
    PaperSizes.letter: letter,
  };
}

/// 定義の用紙指定を実寸にする。
///
/// `size` は開いた文字列（Renderer が独自の紙を知っていてよい）なので、知らない
/// 名前は **A4 として扱う**。刷らないより、いちばん多い紙で刷る方がまし。
PrintPaper paperOf(PaperDefinition paper) {
  final base = PrintPapers.byName[paper.size] ?? PrintPapers.a4;
  return paper.isLandscape ? base.landscape : base.portrait;
}

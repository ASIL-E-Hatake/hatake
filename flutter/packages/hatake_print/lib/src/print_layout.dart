// 紙の中立な出力形（座標まで決めた「刷る前の紙」）。
//
// `ReportDocument` が「紙の中身」なら、こちらは**紙の上のどこに何があるか**。
// PDF・プリンタ・別の書き出しは、ここから先を受け持つだけになる。
//
// 座標は **左上原点・ポイント・y は下向き**（人が紙を読む向き）。PDF は左下原点
// なので、その反転は書き出し側（[writePdf]）が1箇所でやる。
//
// この形を挟む理由は2つ:
//   ・**同じ答えを確かめられる**。座標は数なので、golden と1バイトずつ比べられる
//     （第三者のレイアウトエンジンに組み替えると、これができなくなる）
//   ・**出口を差し替えられる**。PDF でも、プリンタの制御コードでも、xlsx でも、
//     受け取るのはこの形1つ

import 'print_paper.dart';

/// 文字の寄せ方（開いた文字列）。
abstract final class PrintAligns {
  const PrintAligns._();

  static const String left = 'left';
  static const String right = 'right';
  static const String center = 'center';
}

/// 紙に置く物。
sealed class PrintItem {
  const PrintItem();
}

/// 一続きの文字。
class PrintText extends PrintItem {
  /// 置ける枠の左端。
  final double x;

  /// **ベースライン**の y（文字の下端ではない。組版の基準はベースライン）。
  final double y;

  /// 置ける枠の幅（[align] の基準。溢れた文字は組む前に切ってある）。
  final double width;

  final String text;

  final double size;

  /// 太字（標準の日本語フォントには太さが無いので、書き出し側が縁取りで太らせる）。
  final bool bold;

  /// [PrintAligns] のいずれか。
  final String align;

  const PrintText({
    required this.x,
    required this.y,
    required this.width,
    required this.text,
    required this.size,
    this.bold = false,
    this.align = PrintAligns.left,
  });

  @override
  String toString() =>
      'PrintText(${x.toStringAsFixed(2)}, ${y.toStringAsFixed(2)}, $align, "$text")';
}

/// 横罫線（見出しの下・小計の上）。
class PrintRule extends PrintItem {
  final double x;
  final double y;
  final double width;
  final double thickness;

  const PrintRule({
    required this.x,
    required this.y,
    required this.width,
    this.thickness = 0.5,
  });

  @override
  String toString() =>
      'PrintRule(${x.toStringAsFixed(2)}, ${y.toStringAsFixed(2)}, w: ${width.toStringAsFixed(2)})';
}

/// 紙1枚。
class PrintPage {
  /// 1始まりのページ番号。
  final int number;

  final List<PrintItem> items;

  const PrintPage({required this.number, required this.items});
}

/// 刷るもの1本ぶん。
class PrintLayout {
  final PrintPaper paper;

  final List<PrintPage> pages;

  /// PDF の題（ビューアのタブに出る）。
  final String title;

  const PrintLayout({
    required this.paper,
    required this.pages,
    this.title = '',
  });

  static const PrintLayout empty =
      PrintLayout(paper: PrintPapers.a4, pages: []);

  bool get isEmpty => pages.isEmpty;
}

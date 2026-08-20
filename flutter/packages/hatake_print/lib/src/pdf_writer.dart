// PrintLayout → PDF のバイト列。
//
// PDF を自分で書いているのは、この2つを同時に満たす道が他に無かったから。
//
//   ・**同じ入力なら同じバイト列**。日付も乱数も入れない（要る人は footer に渡す）。
//     だから「見本の帳票」を1バイト単位で CI に固定できる＝体裁が黙って変わらない
//   ・**依存ゼロ・UI 不要**。夜間バッチやサーバ側で刷るのに Flutter は要らない
//
// 圧縮もしない。中身が読める（`grep` できる）PDF は、差分が読める。帳票1枚は
// 数KB なので、縮める意味がない。
//
// 座標: PrintLayout は左上原点・y 下向き、PDF は左下原点・y 上向き。反転は
// [_pdfY] の1箇所だけ。

import 'dart:convert';
import 'dart:typed_data';

import 'pdf_font.dart';
import 'print_layout.dart';
import 'print_metrics.dart';

/// [layout] を PDF にする。
///
/// [font] は既定でゴシック体の**非埋め込み**日本語フォント（[PdfFont]）。
///
/// 紙が0枚の [layout]（行が1件も無かった帳票）は投げる。**0枚の PDF は PDF では
/// ない**ので、「行が無いときどうするか」（刷らない・空表を出す・報せる）は業務の
/// 判断として呼ぶ側に残す。
Uint8List writePdf(PrintLayout layout, {PdfFont font = PdfFont.gothic}) {
  if (layout.isEmpty) {
    throw ArgumentError.value(
      layout,
      'layout',
      '紙が0枚です（行が無いときに刷るかどうかは、呼ぶ側で決めてください）',
    );
  }
  final objects = <String>[];

  /// 1始まりの参照番号を返す。
  int add(String body) {
    objects.add(body);
    return objects.length;
  }

  // 1: カタログ、2: ページの親（MediaBox と Resources は継承させる）。
  add('<< /Type /Catalog /Pages 2 0 R >>');
  final pagesIndex = add('');

  final fontRef = _addFont(add, font);

  final kids = <int>[];
  for (final page in layout.pages) {
    final stream = _content(page, layout, font);
    final contentRef = add(
      '<< /Length ${stream.length} >>\nstream\n$stream\nendstream',
    );
    kids.add(add('<< /Type /Page /Parent 2 0 R /Contents $contentRef 0 R >>'));
  }

  final paper = layout.paper;
  objects[pagesIndex - 1] = '<< /Type /Pages '
      '/Kids [${kids.map((ref) => '$ref 0 R').join(' ')}] '
      '/Count ${kids.length} '
      '/MediaBox [0 0 ${_num(paper.width)} ${_num(paper.height)}] '
      '/Resources << /Font << /F1 $fontRef 0 R >> >> >>';

  final infoRef = add('<< /Producer (hatake_print)'
      '${layout.title.isEmpty ? '' : ' /Title ${_utf16Text(layout.title)}'} >>');

  return _serialize(objects, infoRef);
}

/// フォントの object を足して、`/F1` が指す番号を返す。
int _addFont(int Function(String body) add, PdfFont font) {
  if (!font.cid) {
    return add('<< /Type /Font /Subtype /Type1 /BaseFont /${font.baseFont} '
        '/Encoding /${font.encoding} >>');
  }
  // CID フォントは Type0（合成フォント）＋ 子フォント ＋ 記述子の3つ組。
  final descriptor = add('<< /Type /FontDescriptor /FontName /${font.baseFont} '
      '/Flags 4 /FontBBox [-100 -300 1100 900] /ItalicAngle 0 '
      '/Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>');
  // 字送り: 既定は全角（1000）。英数の CID だけ半角（500）にする。
  // [emWidth] が「全角1・半角0.5」で数えているのと**同じ約束**にしてある
  // （食い違うと、右寄せした金額の右端がずれる）。
  final child = add('<< /Type /Font /Subtype /CIDFontType0 '
      '/BaseFont /${font.baseFont} '
      '/CIDSystemInfo << /Registry (${font.registry}) '
      '/Ordering (${font.ordering}) /Supplement ${font.supplement} >> '
      '/FontDescriptor $descriptor 0 R /DW 1000 /W [1 94 500 231 632 500] >>');
  return add('<< /Type /Font /Subtype /Type0 /BaseFont /${font.baseFont} '
      '/Encoding /${font.encoding} /DescendantFonts [$child 0 R] >>');
}

/// 紙1枚の内容（描画命令）。
String _content(PrintPage page, PrintLayout layout, PdfFont font) {
  final out = StringBuffer();
  for (final item in page.items) {
    switch (item) {
      case final PrintRule rule:
        if (rule.width <= 0 || rule.thickness <= 0) continue;
        // 罫線は「細い長方形の塗り」。線幅の丸め（1px に足りない線が消える）を
        // 避けられるので、細い罫線はこちらの方が確実に出る。
        final y = _pdfY(layout, rule.y) - rule.thickness;
        out.writeln('${_num(rule.x)} ${_num(y)} '
            '${_num(rule.width)} ${_num(rule.thickness)} re f');
      case final PrintText text:
        if (text.text.isEmpty || text.size <= 0) continue;
        final x = _alignedX(text);
        final y = _pdfY(layout, text.y);
        out.writeln('q BT');
        if (text.bold) {
          // 標準の日本語フォントに太字は無い。文字を縁取って（描画モード2）
          // 太らせる＝どのビューアでも同じように太くなる。
          out.writeln('2 Tr ${_num(text.size * 0.035)} w');
        }
        out.writeln('/F1 ${_num(text.size)} Tf');
        // 字送りが読めない文字（円記号など）は1文字だけの塊になり、次の文字は
        // こちらが置き直す（[runsOf]）＝ビューアの都合で後ろがずれない。
        for (final run in runsOf(text.text)) {
          final body = font.cid ? _utf16(run.text) : _literal(run.text);
          out.writeln('1 0 0 1 ${_num(x + run.em * text.size)} ${_num(y)} Tm');
          out.writeln('$body Tj');
        }
        out.writeln('ET Q');
    }
  }
  return out.toString().trimRight();
}

/// 寄せを解いた左端。
double _alignedX(PrintText text) {
  final width = textWidth(text.text, text.size);
  return switch (text.align) {
    PrintAligns.right => text.x + text.width - width,
    PrintAligns.center => text.x + (text.width - width) / 2,
    _ => text.x,
  };
}

/// 左上原点（人が読む向き）→ 左下原点（PDF）。
double _pdfY(PrintLayout layout, double y) => layout.paper.height - y;

/// object を並べて、相互参照表と trailer を付ける。
Uint8List _serialize(List<String> objects, int infoRef) {
  final bytes = BytesBuilder(copy: false);
  void ascii(String text) => bytes.add(latin1.encode(text));

  ascii('%PDF-1.7\n');
  // バイナリを含む印（転送でこの4バイトが壊れないことを見張る道具もある）。
  bytes.add(const [0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]);

  final offsets = <int>[];
  for (var i = 0; i < objects.length; i++) {
    offsets.add(bytes.length);
    ascii('${i + 1} 0 obj\n${objects[i]}\nendobj\n');
  }

  final xref = bytes.length;
  ascii('xref\n0 ${objects.length + 1}\n');
  ascii('0000000000 65535 f \n');
  for (final offset in offsets) {
    ascii('${offset.toString().padLeft(10, '0')} 00000 n \n');
  }
  ascii('trailer\n<< /Size ${objects.length + 1} /Root 1 0 R '
      '/Info $infoRef 0 R >>\n');
  ascii('startxref\n$xref\n%%EOF\n');
  return bytes.takeBytes();
}

/// 数を PDF に書く形（小数2桁まで・無駄な 0 は落とす）。
String _num(double value) {
  // -0 は 0 と書く（同じ入力から同じバイト列を出すため）。
  final fixed = (value == 0 ? 0.0 : value).toStringAsFixed(2);
  if (!fixed.contains('.')) return fixed;
  return fixed.replaceFirst(RegExp(r'\.?0+$'), '');
}

/// UTF-16BE の16進文字列（CID フォントの符号化 `UniJIS-UCS2-H` はこれで読む）。
String _utf16(String text) {
  final hex = StringBuffer();
  for (final rune in text.runes) {
    // UCS-2 なので BMP の外（絵文字・第3水準以上の一部）は書けない。
    // 黙って消さず「〓」（ゲタ）にする＝紙を見た人が気づける。
    final code = rune > 0xFFFF ? 0x3013 : rune;
    hex.write(code.toRadixString(16).padLeft(4, '0').toUpperCase());
  }
  return '<$hex>';
}

/// 情報辞書（`/Title` など）に書く文字列。
///
/// 本文と違って**フォントに符号化を教えられない**ので、UTF-16BE の印（BOM）を
/// 頭に付ける決まりになっている。これが無いとビューアのタブが化ける。
String _utf16Text(String text) => '<FEFF${_utf16(text).substring(1)}';

/// 標準14フォント用の文字列（英数のみ。日本語は `?`）。
String _literal(String text) {
  final out = StringBuffer('(');
  for (final rune in text.runes) {
    if (rune > 0xFF) {
      out.write('?');
      continue;
    }
    final char = String.fromCharCode(rune);
    if (char == '(' || char == ')' || char == r'\') out.write(r'\');
    out.write(char);
  }
  out.write(')');
  return out.toString();
}

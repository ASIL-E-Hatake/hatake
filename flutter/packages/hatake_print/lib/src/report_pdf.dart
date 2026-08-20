// 定義と行から PDF まで、1呼び出しで。

import 'dart:typed_data';

import 'package:hatake_core/hatake_core.dart';

import 'pdf_font.dart';
import 'pdf_writer.dart';
import 'print_style.dart';
import 'report_layout.dart';

/// 帳票の定義と行から PDF を作る（[buildReport] → [layoutReport] → [writePdf]）。
///
/// 画面を通さないので、夜間バッチやサーバ側からもこれだけで刷れる。
Uint8List reportPdf(
  ReportPageDefinition page,
  List<Map<String, Object?>> rows, {
  FormatterRegistry? formatters,
  AggregateRegistry? aggregates,
  Set<String> roles = const {},
  PrintStyle style = const PrintStyle(),
  PdfFont font = PdfFont.gothic,
}) {
  final document = buildReport(page.report, rows, aggregates: aggregates);
  final layout = layoutReport(
    page,
    document,
    formatters: formatters,
    roles: roles,
    style: style,
  );
  return writePdf(layout, font: font);
}

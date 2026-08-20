/// hatake_print — 帳票を紙に出す opt-in アダプタ。
///
/// Framework は `ReportDocument`（紙の中身）までを作る。このパッケージはその先を
/// 2段で受け持つ:
///
///   1. [layoutReport] … `ReportDocument` → [PrintLayout]（**座標まで決めた紙**）
///   2. [writePdf] … [PrintLayout] → PDF のバイト列
///
/// 間に中立な形を挟んでいるので、出口は差し替えられる（プリンタの制御コード・
/// 別の書式）。両方いっぺんにやるなら [reportPdf]。
///
/// 純 Dart・依存は hatake_core だけ。UI が無い所（夜間バッチ・サーバ）でも刷れる。
library;

export 'src/pdf_font.dart';
export 'src/pdf_writer.dart';
export 'src/print_layout.dart';
export 'src/print_metrics.dart';
export 'src/print_paper.dart';
export 'src/print_style.dart';
export 'src/report_layout.dart';
export 'src/report_pdf.dart';

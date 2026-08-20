// 見本の帳票（test/golden/sales_report.pdf）を作り直す。
//
//   cd flutter/packages/hatake_print && dart run tool/generate_golden.dart
//
// 体裁を変えたときはこれを走らせて、**出てきた PDF を開いて見る**こと。
// golden_test.dart が「コードと見本が同じ」ことしか見張れないのに対して、
// 「見て良いか」を決めるのは人の仕事。

// ignore_for_file: avoid_print

import 'dart:io';

import '../test/golden_source.dart';

void main() {
  final bytes = goldenPdf();
  File(goldenPdfPath).writeAsBytesSync(bytes);
  print('$goldenPdfPath (${bytes.length} bytes)');
}

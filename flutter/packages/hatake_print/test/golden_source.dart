// 見本の帳票（golden）の材料。
//
// **同梱の例（spec/examples/sales_report.yaml）をそのまま読む。** 見本のために別の
// 定義を書くと、例が壊れても見本は無事、という一番まずい形になる。
//
// 行はここに固定で書いてある（日付も乱数も使わない）＝同じバイト列が毎回出る。
// tool/generate_golden.dart が書き、golden_test.dart が同じ材料で作り直して比べる。

import 'dart:io';
import 'dart:typed_data';

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_print/hatake_print.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

/// 同梱の帳票の例（パッケージの中から見た相対位置）。
const String exampleYamlPath = '../../../spec/examples/sales_report.yaml';

/// 見本の PDF の置き場所。
const String goldenPdfPath = 'test/golden/sales_report.pdf';

/// 見本の行（得意先ごとに改ページされる＝3枚になる）。
const List<Map<String, Object?>> goldenRows = [
  {
    'orderNo': 'SO-1001',
    'orderDate': '2026-04-02',
    'status': '出荷済',
    'customer': '山田商事',
    'amount': 128000,
  },
  {
    'orderNo': 'SO-1002',
    'orderDate': '2026-04-05',
    'status': '出荷済',
    'customer': '山田商事',
    'amount': 9800,
  },
  {
    'orderNo': 'SO-1013',
    'orderDate': '2026-04-18',
    'status': '未出荷',
    'customer': '山田商事',
    'amount': 1250000,
  },
  {
    'orderNo': 'SO-1021',
    'orderDate': '2026-04-21',
    'status': '出荷済',
    'customer': '佐藤物産',
    'amount': 43200,
  },
  {
    'orderNo': 'SO-1022',
    'orderDate': '2026-04-23',
    'status': '未出荷',
    'customer': '佐藤物産',
    'amount': -5000,
  },
  {
    'orderNo': 'SO-1030',
    'orderDate': '2026-04-27',
    'status': '未出荷',
    'customer': '鈴木工業',
    'amount': 76500,
  },
];

/// 例の定義を読む。
ReportPageDefinition goldenPage() {
  final page = parsePageYaml(
    File(exampleYamlPath).readAsStringSync(),
    // 例が知らないキーを持っていないことも、ここで縛る。
    strict: true,
  );
  return page as ReportPageDefinition;
}

/// 見本の PDF を作る。
Uint8List goldenPdf() => reportPdf(
      goldenPage(),
      goldenRows,
      // 脚注は「差し替えられること」を見本でも示す（日付は入れない＝毎回同じ）。
      style: const PrintStyle(footer: '売上明細表 - {page}/{pages}'),
    );

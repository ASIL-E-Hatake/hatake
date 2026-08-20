// 紙の上の座標が、刷る側（この版）と読ませる側（TypeScript 版）で1つも違わないこと。
//
// TS 版は PDF を作らない。代わりに同じ `PrintLayout` を組んで**文字にして見せる**
// （`hatake paper` / MCP の `hatake_print_preview`）。だから座標がズレると、
// **AI や人が読んだ紙と、実際に刷った紙が別物**になる。
//
// フィクスチャは strict で読む＝本当に書ける定義であることも同時に縛る。

import 'dart:convert';
import 'dart:io';

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_print/hatake_print.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

/// 小数2桁まで・末尾の 0 と小数点は落とす（フィクスチャの決めごと）。
String num2(double value) {
  final fixed = value.toStringAsFixed(2).replaceFirst(RegExp(r'\.?0+$'), '');
  return fixed.isEmpty ? '0' : fixed;
}

/// 1つの item を1行の文字列にする。
String encode(PrintItem item) {
  return switch (item) {
    final PrintText text => [
        'T',
        num2(text.x),
        num2(text.y),
        num2(text.width),
        num2(text.size),
        text.align,
        text.bold ? 'bold' : '-',
        text.text,
      ].join('|'),
    final PrintRule rule => [
        'R',
        num2(rule.x),
        num2(rule.y),
        num2(rule.width),
        num2(rule.thickness),
      ].join('|'),
  };
}

/// フィクスチャの `style` を [PrintStyle] にする（書いてある分だけ差し替える）。
PrintStyle styleOf(Map<String, Object?>? style) {
  if (style == null) return const PrintStyle();
  double? number(String key) => (style[key] as num?)?.toDouble();
  return PrintStyle(
    margin: number('margin') ?? 36,
    titleSize: number('titleSize') ?? 12,
    headingSize: number('headingSize') ?? 8,
    bodySize: number('bodySize') ?? 9,
    rowHeight: number('rowHeight') ?? 16,
    columnGap: number('columnGap') ?? 6,
    pageNumber: style['pageNumber'] as String? ?? '{page} / {pages}',
    footer: style['footer'] as String? ?? '',
    subtotalLabel: style['subtotalLabel'] as String? ?? '小計',
    grandTotalLabel: style['grandTotalLabel'] as String? ?? '合計',
    countSuffix: style['countSuffix'] as String? ?? '件',
  );
}

void main() {
  final catalog = jsonDecode(
    File('../../../spec/conformance/report_layout.json').readAsStringSync(),
  ) as Map<String, Object?>;
  final cases = (catalog['cases']! as List<Object?>)
      .cast<Map<String, Object?>>();

  test('フィクスチャに件数がある', () {
    expect(cases, isNotEmpty);
  });

  for (final one in cases) {
    test(one['name'] as String, () {
      final page = parsePageJson(
        jsonEncode({'page': one['page']}),
        strict: true,
      ) as ReportPageDefinition;
      final rows = (one['rows']! as List<Object?>)
          .cast<Map<String, Object?>>()
          .toList();
      final roles = ((one['roles'] ?? const <Object?>[]) as List<Object?>)
          .cast<String>()
          .toSet();
      final layout = layoutReport(
        page,
        buildReport(page.report, rows),
        roles: roles,
        style: styleOf(one['style'] as Map<String, Object?>?),
      );
      final actual = [
        for (final sheet in layout.pages) [for (final item in sheet.items) encode(item)],
      ];
      expect(actual, one['expected']);
    });
  }
}

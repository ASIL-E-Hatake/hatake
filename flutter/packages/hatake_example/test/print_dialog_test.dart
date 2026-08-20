import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_example/print_dialog.dart';
import 'package:hatake_material/hatake_material.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

/// The application side of `type: print`.
///
/// The framework hands over a [PrintRequest] and stops. This test is the proof
/// that the request is **enough**: with nothing but what the button gave it, the
/// app produces a real PDF. If a field ever went missing from the request, this
/// is what would fail — the framework's own tests cannot see it, because they
/// deliberately know nothing about PDFs.
ReportPageDefinition _reportPage() {
  final app = parseAppYaml(File('assets/sales_app.yaml').readAsStringSync());
  return app.pageById('sales_report') as ReportPageDefinition;
}

final _rows = <DataRecord>[
  {
    'orderNo': 'SO-1001',
    'orderDate': '2026-07-14',
    'status': '出荷済',
    'customer': '山田商事',
    'amount': 128000,
  },
  {
    'orderNo': 'SO-1002',
    'orderDate': '2026-07-28',
    'status': '未出荷',
    'customer': '佐藤物産',
    'amount': 54000,
  },
];

Widget _host(PrintRequest request) {
  return MaterialApp(
    home: Scaffold(
      body: Builder(
        builder: (context) => TextButton(
          onPressed: () => PrintDialog.show(context, request),
          child: const Text('open'),
        ),
      ),
    ),
  );
}

PrintRequest _request({Map<String, Object?> config = const {}}) {
  return PrintRequest(
    filename: '売上明細.pdf',
    page: _reportPage(),
    rows: _rows,
    formatters: FormatterRegistry(),
    config: config,
    actionId: 'printPdf',
  );
}

void main() {
  testWidgets('the request alone is enough to make a PDF', (tester) async {
    await tester.pumpWidget(_host(_request()));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(find.text('印刷 — 売上明細.pdf'), findsOneWidget);
    // 2 rows over 2 customers with a subtotal each — one A4 sheet, portrait.
    expect(find.byKey(const Key('demo.print.sheets')), findsOneWidget);
    expect(find.text('A4・縦 の紙 1 枚'), findsOneWidget);

    final bytes =
        (tester.widget(find.byKey(const Key('demo.print.bytes'))) as Text).data!;
    // A real PDF, not a placeholder: the header is in there and it has size.
    expect(bytes, contains('%PDF-1.7'));
    expect(RegExp(r'PDF (\d+) バイト').firstMatch(bytes), isNotNull);
    expect(
      int.parse(RegExp(r'PDF (\d+) バイト').firstMatch(bytes)!.group(1)!),
      greaterThan(1000),
    );
  });

  testWidgets('the action config picks the typeface, unread by the framework',
      (tester) async {
    // 明朝でもゴシックでも刷れること（config は Framework を素通りしてここに届く）。
    for (final font in ['mincho', 'gothic']) {
      await tester.pumpWidget(_host(_request(config: {'font': font})));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      final bytes = (tester.widget(find.byKey(const Key('demo.print.bytes')))
              as Text)
          .data!;
      expect(bytes, contains('%PDF-1.7'));
      await tester.tap(find.byKey(const Key('demo.print.close')));
      await tester.pumpAndSettle();
    }
  });

  test('the demo report declares a print button', () {
    final report = _reportPage();
    final action = report.actions.firstWhere((a) => a.id == 'printPdf');
    expect(action.type, ActionTypes.print);
    // 用紙は定義が決める（アダプタは読むだけ）。
    expect(report.report.paper.size, PaperSizes.a4);
  });
}

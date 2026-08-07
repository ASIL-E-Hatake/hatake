import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_example/export_dialog.dart';
import 'package:hatake_material/hatake_material.dart';

/// A real CSV as the framework builds it: BOM first (so Excel reads UTF-8) and
/// CRLF line ends. `Text` draws both as tofu, which is what made the demo look
/// like it was mojibake — so the dialog shows a display-safe form while copying
/// the genuine bytes.
const _csv = '\u{FEFF}受注番号,受注日,金額\r\n'
    'SO-1002,2026-07-28,"¥54,000"\r\n'
    'SO-1001,2026-07-14,"¥128,000"\r\n';

Widget _host() {
  return MaterialApp(
    home: Scaffold(
      body: Builder(
        builder: (context) => TextButton(
          onPressed: () => ExportDialog.show(
            context,
            const ExportRequest(
              filename: '売上明細.csv',
              mimeType: 'text/csv',
              text: _csv,
              actionId: 'csv',
            ),
          ),
          child: const Text('open'),
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('shows the CSV without BOM or CR artefacts', (tester) async {
    await tester.pumpWidget(_host());
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    final shown =
        tester.widget<Text>(find.byKey(const Key('demo.export.text'))).data!;

    expect(shown.contains('\u{FEFF}'), isFalse, reason: 'BOM は表示しない');
    expect(shown.contains('\r'), isFalse, reason: 'CR は表示しない');
    expect(shown.startsWith('受注番号,受注日,金額\n'), isTrue);
    // The values themselves are untouched — quoting and all.
    expect(shown, contains('"¥54,000"'));
  });

  testWidgets('counts the lines the file actually has', (tester) async {
    await tester.pumpWidget(_host());
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    // 1 heading + 2 rows. The trailing newline is not a fourth line.
    expect(find.textContaining('3 行'), findsOneWidget);
    // And it says what the real output carries, since the screen hides it.
    expect(find.textContaining('BOM'), findsOneWidget);
  });

  testWidgets('copying hands over the genuine bytes', (tester) async {
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'Clipboard.setData') {
          copied = (call.arguments as Map)['text'] as String;
        }
        return null;
      },
    );

    await tester.pumpWidget(_host());
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('demo.export.copy')));
    await tester.pumpAndSettle();

    // What lands on the clipboard is the file, not the prettified view.
    expect(copied, _csv);
  });
}

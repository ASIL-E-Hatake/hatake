import 'dart:convert';

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

/// Shift_JIS を要求された出力。デモは変換して「何バイトになるか」を見せる。
const _sjisRequest = ExportRequest(
  filename: '売上明細_sjis.csv',
  mimeType: 'text/csv; charset=cp932',
  text: '受注番号,顧客\r\nSO-1,山田商事\r\n',
  charset: 'cp932',
  actionId: 'csvSjis',
);

Widget _hostWith(ExportRequest request) {
  return MaterialApp(
    home: Scaffold(
      body: Builder(
        builder: (context) => TextButton(
          onPressed: () => ExportDialog.show(context, request),
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

  testWidgets('Shift_JIS を要求されたら、出力先が変換してバイト数を見せる',
      (tester) async {
    await tester.pumpWidget(_hostWith(_sjisRequest));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    // 「文字コード変換は出力先の担当」がデモで見えること。
    expect(find.textContaining('cp932 を要求しています'), findsOneWidget);
    final bytes =
        tester.widget<Text>(find.byKey(const Key('demo.export.bytes'))).data!;
    // 全角10文字×2 + 半角10バイト = 30。UTF-8 なら全角が3バイトなので 40 になる。
    expect(bytes, 'cp932 で 30 バイト');
    expect(utf8.encode(_sjisRequest.text).length, 40);
  });

  testWidgets('変換できない文字があれば、黙って化けさせず言う', (tester) async {
    await tester.pumpWidget(_hostWith(const ExportRequest(
      filename: 'x.csv',
      mimeType: 'text/csv; charset=shift_jis',
      // 髙（IBM 拡張）は JIS X 0208 の Shift_JIS には無い。
      text: '顧客\r\n髙島屋\r\n',
      charset: 'shift_jis',
      actionId: 'csv',
    )));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(find.textContaining('変換できません（髙）'), findsOneWidget);
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

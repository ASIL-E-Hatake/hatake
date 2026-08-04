import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_example/definition_dialog.dart';

const _yaml = 'type: master\nid: customer_master\ntitle: 顧客マスタ';

Widget _host() {
  return MaterialApp(
    home: Scaffold(
      body: Builder(
        builder: (context) => TextButton(
          onPressed: () =>
              DefinitionDialog.show(context, title: 'customer_master', yaml: _yaml),
          child: const Text('open'),
        ),
      ),
    ),
  );
}

void main() {
  // Guard the timeout: a stuck dialog should fail fast, not sit for 10 minutes.
  testWidgets('shows the definition and closes', (tester) async {
    await tester.pumpWidget(_host());
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    final shown = tester
        .widget<Text>(find.byKey(const Key('demo.definition.yaml')))
        .data!;
    expect(shown, _yaml);
    expect(find.textContaining('この画面の定義'), findsOneWidget);

    await tester.tap(find.byKey(const Key('demo.definition.close')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('demo.definition.yaml')), findsNothing);
  }, timeout: const Timeout(Duration(seconds: 45)));
}

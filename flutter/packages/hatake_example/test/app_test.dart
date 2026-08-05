import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_example/main.dart';
import 'package:hatake_material/hatake_material.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

Future<Widget> _demoApp() async {
  final yaml = await rootBundle.loadString('assets/sales_app.yaml');
  return HatakeExampleApp(definition: parseAppYaml(yaml), source: yaml);
}

void main() {
  testWidgets('renders the app shell and navigates between pages',
      (tester) async {
    await tester.pumpWidget(await _demoApp());
    await tester.pumpAndSettle();

    // The shell shows the app title and lands on the home page.
    expect(find.text('販売管理'), findsOneWidget);
    expect(find.text('顧客マスタ'), findsOneWidget);
    // Seeded customer data proves the page is wired to its repository.
    expect(find.text('C001'), findsOneWidget);

    // The menu offers the other pages; only the rail carries this label so far.
    expect(find.text('受注照会'), findsOneWidget);
    await tester.tap(find.text('受注照会'));
    await tester.pumpAndSettle();

    // The order search page is now shown with its seeded rows.
    expect(find.text('受注番号'), findsOneWidget);
    expect(find.text('SO-1001'), findsOneWidget);

    // Every page offers the definition viewer (declared as a plugin action).
    expect(find.byKey(const Key('hatake.action.showDef')), findsOneWidget);
  });

  // The demo's master-detail definition is checked without driving the UI:
  // rendering of subTable is covered by hatake_material's widget tests, and
  // exercising the whole demo app through several screens is slow in tests.
  test('the demo defines a master-detail entry page', () {
    // Read from disk (not rootBundle): this is a plain test with no binding.
    final app = parseAppYaml(File('assets/sales_app.yaml').readAsStringSync());

    final entry = app.pageById('order_entry') as FormPageDefinition;
    final lines = entry.form.fields.firstWhere((f) => f.field == 'lines');
    expect(lines.type, FieldTypes.subTable);
    // Grid columns and the row editor (with a row-level computed) are declared.
    expect(lines.columns.map((c) => c.field), ['item', 'qty', 'price', 'amount']);
    expect(
      lines.rowFields.firstWhere((f) => f.field == 'amount').computed,
      {'op': 'product', 'fields': ['qty', 'price']},
    );
    // Reachable from the menu and from the order list.
    expect(app.menu.any((m) => m.page == 'order_entry'), isTrue);
  });
}

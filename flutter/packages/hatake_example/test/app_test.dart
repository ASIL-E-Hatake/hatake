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

String _metric(String id) =>
    (find.byKey(Key('hatake.dashboard.$id.value')).evaluate().single.widget
            as Text)
        .data!;

void main() {
  testWidgets('renders the app shell and navigates between pages',
      (tester) async {
    await tester.pumpWidget(await _demoApp());
    await tester.pumpAndSettle();

    // The shell shows the app title and lands on the dashboard.
    expect(find.text('販売管理'), findsOneWidget);
    expect(find.text('売上ダッシュボード'), findsOneWidget);
    // Cards are aggregated from the seeded orders (4 of them, ¥598,000).
    expect(_metric('orderCount'), '4');
    expect(_metric('totalAmount'), '¥598,000');
    expect(_metric('avgAmount'), '¥149,500');

    // A card's navigate action reaches the order list (tapped by key: the
    // dashboard, the menu and the button all say 受注照会).
    await tester.tap(find.byKey(const Key('hatake.action.openOrders')));
    await tester.pumpAndSettle();
    expect(find.text('受注番号'), findsOneWidget);
    expect(find.text('SO-1001'), findsOneWidget);

    // The menu offers the other pages (by key: 顧客 is also a column header).
    await tester.tap(find.byKey(const Key('hatake.menu.customers')));
    await tester.pumpAndSettle();
    expect(find.text('顧客マスタ'), findsOneWidget);
    // Seeded customer data proves the page is wired to its repository.
    expect(find.text('C001'), findsOneWidget);

    // Every page offers the definition viewer (declared as a plugin action).
    expect(find.byKey(const Key('hatake.action.showDef')), findsOneWidget);
  });

  test('the demo defines a dashboard as its landing page', () {
    final app = parseAppYaml(File('assets/sales_app.yaml').readAsStringSync());

    final board = app.pageById('sales_dashboard') as DashboardPageDefinition;
    expect(app.home, 'dashboard');
    expect(board.layout.columns, 4);
    // Cards cover all three built-in kinds, and the board-wide period filter.
    expect(board.items.map((i) => i.type).toSet(), {
      DashboardItemTypes.metric,
      DashboardItemTypes.chart,
      DashboardItemTypes.table,
    });
    expect(board.search!.filters.single.field, 'orderDate');
    // Every card reads the seeded order repository (the page default).
    for (final item in board.items) {
      expect(board.repositoryOf(item), 'orderRepository');
    }
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

  test('the demo also defines the child-repository variant', () {
    final app = parseAppYaml(File('assets/sales_app.yaml').readAsStringSync());

    final paged = app.pageById('order_entry_paged') as FormPageDefinition;
    final lines = paged.form.fields.firstWhere((f) => f.field == 'lines');
    // Same subTable, only the rows come from their own repository.
    expect(lines.type, FieldTypes.subTable);
    expect(
      lines.source,
      const SubTableSource(
        repository: 'orderLineRepository',
        parentKey: 'orderNo',
        keyField: 'lineNo',
        pageSize: 10,
      ),
    );
    expect(app.menu.any((m) => m.page == 'order_entry_paged'), isTrue);
  });
}

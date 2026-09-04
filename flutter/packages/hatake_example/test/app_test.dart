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
    // デモは並べて開く（`app.navigation: tabs`）ので、画面の名前は見出しと**タブの札**
    // の2か所に出る。
    expect(find.text('売上ダッシュボード'), findsWidgets);
    expect(find.byType(InputChip), findsOneWidget);
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
    expect(find.text('顧客マスタ'), findsWidgets);
    // タブは2枚。ダッシュボードから受注照会へはカードの遷移（既定＝**同じタブの
    // 続き**）なので増えず、メニューで選んだ顧客マスタが2枚目になる。
    expect(find.byType(InputChip), findsNWidgets(2));
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
  test('the demo ships a 帳票 and CSV output over the same data', () {
    final app = parseAppYaml(File('assets/sales_app.yaml').readAsStringSync());

    final report = app.pageById('sales_report') as ReportPageDefinition;
    // Detail columns come from `table`, so the report matches the order list.
    expect(report.table.columns.map((c) => c.field),
        ['orderNo', 'orderDate', 'status', 'amount']);
    // Grouped by customer, in the order the report itself asks for.
    expect(report.report.groups.single.field, 'customer');
    expect(report.report.sortField, 'customer');
    expect(report.report.totals.map((t) => t.aggregate),
        [AggregateOps.sum, AggregateOps.count]);
    expect(report.actions.any((a) => a.type == ActionTypes.export), isTrue);
    // 同じ紙を CSV でも紙でも出せる（刷るのは opt-in の hatake_print）。
    expect(report.actions.any((a) => a.type == ActionTypes.print), isTrue);

    // The order list exports the same columns it shows.
    final search = app.pageById('order_search') as SearchPageDefinition;
    final csv = search.actions.firstWhere((a) => a.id == 'csv');
    expect(csv.type, ActionTypes.export);
    // 選んだ行に対して実行するボタン（表にチェックボックスが出る側）。
    final bulk = search.actions.firstWhere((a) => a.id == 'approveSelected');
    expect(bulk.scope, ActionScopes.selection);
    expect(bulk.type, ActionTypes.plugin);
    // 却下は「理由を聞いてから」。聞くことは定義に書いてある。
    final reject = search.actions.firstWhere((a) => a.id == 'rejectSelected');
    expect(reject.prompt?.fields.map((f) => f.field), ['reason', 'rejectedOn']);
    expect(reject.prompt?.fields.first.required, isTrue);
    expect(csv.config['bom'], isTrue);
    expect(app.menu.any((m) => m.page == 'sales_report'), isTrue);
  });

  test('the demo defines a master-detail entry page', () {
    // Read from disk (not rootBundle): this is a plain test with no binding.
    final app = parseAppYaml(File('assets/sales_app.yaml').readAsStringSync());

    final entry = app.pageById('order_entry') as FormPageDefinition;
    final lines = entry.form.fields.firstWhere((f) => f.field == 'lines');
    expect(lines.type, FieldTypes.subTable);
    // Grid columns and the row editor (with a row-level computed) are declared.
    // 取消印は列にも出す（合計から外れた行を画面で見分けられるように）。
    expect(
      lines.columns.map((c) => c.field),
      ['item', 'qty', 'price', 'amount', 'cancelled'],
    );
    expect(
      lines.rowFields.firstWhere((f) => f.field == 'amount').computed,
      {'op': 'product', 'fields': ['qty', 'price']},
    );
    // 小計は取消した行を外して畳む（絞らない合計は業務の合計にならない）。
    expect(entry.form.fields.firstWhere((f) => f.field == 'subtotal').computed, {
      'op': 'sum',
      'field': 'lines',
      'of': 'amount',
      'where': {'field': 'cancelled', 'operator': 'notEquals', 'value': true},
    });
    // 品名は行を並べて1行にする（数ではなく文字が出る）。伝票の欄は幅が決まって
    // いるので、金額の大きい順に3件だけ＝切ったぶんは「ほか N 件」と出る。
    expect(entry.form.fields.firstWhere((f) => f.field == 'itemNames').computed, {
      'op': 'join',
      'field': 'lines',
      'of': 'item',
      'separator': '、',
      'where': {'field': 'cancelled', 'operator': 'notEquals', 'value': true},
      'sort': {'field': 'amount', 'ascending': false},
      'limit': 3,
    });
    // 行**どうし**の規則（同じ品名を2行に書けない）は明細の項目に付く。
    expect(
      lines.validators.map((v) => [v.type, v.params['of']]),
      [['unique', 'item']],
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

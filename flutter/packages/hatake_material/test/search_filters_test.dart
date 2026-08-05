import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// Records the last query so tests can assert on the filter map the search
/// area produced.
class _RecordingRepository implements Repository {
  static const List<DataRecord> _rows = [
    {'orderNo': 'SO-1001', 'customer': '山田商事'},
  ];

  RepositoryQuery? lastQuery;

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    lastQuery = query;
    return const PageResult(items: _rows, totalCount: 1);
  }

  @override
  Future<DataRecord?> findByKey(Object key) async => null;
  @override
  Future<DataRecord> create(DataRecord data) async => data;
  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;
  @override
  Future<void> delete(Object key) async {}
}

const _definition = SearchPageDefinition(
  id: 'order_search',
  title: '受注照会',
  repository: 'orderRepository',
  keyField: 'orderNo',
  search: SearchDefinition(
    layout: LayoutDefinition(columns: 2),
    filters: [
      FilterDefinition(field: 'customer', label: '顧客名'),
      FilterDefinition(
        field: 'status',
        label: '状態',
        type: FieldTypes.select,
        operator: FilterOperators.equals,
        options: [
          OptionItem(value: 'open', label: '未出荷'),
          OptionItem(value: 'shipped', label: '出荷済'),
        ],
      ),
      FilterDefinition(
        field: 'shipped',
        label: '出荷フラグ',
        type: FieldTypes.checkbox,
        operator: FilterOperators.equals,
      ),
      FilterDefinition(
        field: 'orderDate',
        label: '受注日',
        type: FieldTypes.date,
        operator: FilterOperators.between,
      ),
      FilterDefinition(
        field: 'amount',
        label: '金額',
        type: FieldTypes.number,
        operator: FilterOperators.greaterThanOrEqual,
      ),
      FilterDefinition(
        field: 'qty',
        label: '数量',
        type: FieldTypes.number,
        operator: FilterOperators.between,
      ),
    ],
  ),
  table: TableDefinition(
    columns: [ColumnDefinition(field: 'orderNo', label: '受注番号')],
  ),
);

Widget _harness(Repository repository) => MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'orderRepository': repository}),
          renderer: const MaterialRenderer(),
          child: const HatakePageView(definition: _definition),
        ),
      ),
    );

Future<_RecordingRepository> _pump(WidgetTester tester) async {
  final repo = _RecordingRepository();
  await tester.pumpWidget(_harness(repo));
  await tester.pumpAndSettle();
  return repo;
}

/// Opens the dropdown identified by [key] and picks the item labelled [label].
Future<void> _choose(WidgetTester tester, String key, String label) async {
  await tester.tap(find.byKey(Key(key)));
  await tester.pumpAndSettle();
  await tester.tap(find.text(label).last);
  await tester.pumpAndSettle();
}

/// Taps the date input identified by [key] and accepts the initial date.
Future<void> _pickToday(WidgetTester tester, String key) async {
  await tester.tap(find.byKey(Key(key)));
  await tester.pumpAndSettle();
  await tester.tap(find.text('OK'));
  await tester.pumpAndSettle();
}

Future<void> _search(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('hatake.search')));
  await tester.pumpAndSettle();
}

String _today() {
  final now = DateTime.now();
  String two(int value) => value.toString().padLeft(2, '0');
  return '${now.year}-${two(now.month)}-${two(now.day)}';
}

void main() {
  testWidgets('a select filter sends the chosen value', (tester) async {
    final repo = await _pump(tester);

    await _choose(tester, 'hatake.filter.status', '出荷済');
    await _search(tester);

    // Only the filter that has a value is sent.
    expect(repo.lastQuery!.filters, {'status': 'shipped'});
  });

  testWidgets('a checkbox filter is tri-state', (tester) async {
    final repo = await _pump(tester);

    await _choose(tester, 'hatake.filter.shipped', 'はい');
    await _search(tester);
    expect(repo.lastQuery!.filters, {'shipped': true});

    await _choose(tester, 'hatake.filter.shipped', 'いいえ');
    await _search(tester);
    expect(repo.lastQuery!.filters, {'shipped': false});

    await _choose(tester, 'hatake.filter.shipped', '指定なし');
    await _search(tester);
    expect(repo.lastQuery!.filters, isEmpty);
  });

  testWidgets('a between date filter sends a 2-element list', (tester) async {
    final repo = await _pump(tester);
    final today = _today();

    await _pickToday(tester, 'hatake.filter.orderDate.from');
    await _search(tester);
    expect(repo.lastQuery!.filters['orderDate'], [today, null]);

    await _pickToday(tester, 'hatake.filter.orderDate.to');
    await _search(tester);
    expect(repo.lastQuery!.filters['orderDate'], [today, today]);
  });

  testWidgets('a number filter sends a num', (tester) async {
    final repo = await _pump(tester);

    await tester.enterText(
        find.byKey(const Key('hatake.filter.amount')), '50000');
    await _search(tester);

    expect(repo.lastQuery!.filters, {'amount': 50000});
    expect(repo.lastQuery!.filters['amount'], isA<num>());
  });

  testWidgets('a between number filter sends both bounds as nums',
      (tester) async {
    final repo = await _pump(tester);

    await tester.enterText(find.byKey(const Key('hatake.filter.qty.from')), '1');
    await tester.enterText(find.byKey(const Key('hatake.filter.qty.to')), '10');
    await _search(tester);

    expect(repo.lastQuery!.filters, {'qty': [1, 10]});
  });

  testWidgets('an empty search area sends no filters', (tester) async {
    final repo = await _pump(tester);

    await _search(tester);

    expect(repo.lastQuery!.filters, isEmpty);
  });

  testWidgets('layout.columns: 2 still renders every filter input',
      (tester) async {
    await _pump(tester);

    for (final key in const [
      'hatake.filter.customer',
      'hatake.filter.status',
      'hatake.filter.shipped',
      'hatake.filter.orderDate.from',
      'hatake.filter.orderDate.to',
      'hatake.filter.amount',
      'hatake.filter.qty.from',
      'hatake.filter.qty.to',
      'hatake.search',
    ]) {
      expect(find.byKey(Key(key)), findsOneWidget, reason: key);
    }
    // A `between` filter has no single-slot input.
    expect(find.byKey(const Key('hatake.filter.orderDate')), findsNothing);
  });
}

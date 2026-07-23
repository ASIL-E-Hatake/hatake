import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

class _InMemoryRepository implements Repository {
  final List<DataRecord> _rows;
  _InMemoryRepository(this._rows);

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    Iterable<DataRecord> rows = _rows;
    final name = query.filters['name'];
    if (name is String && name.isNotEmpty) {
      rows = rows.where((r) => (r['name'] as String).contains(name));
    }
    final all = rows.toList();
    return PageResult(items: all, totalCount: all.length);
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
  id: 'product_search',
  title: '商品照会',
  repository: 'productRepository',
  keyField: 'id',
  search: SearchDefinition(
    filters: [FilterDefinition(field: 'name', label: '商品名')],
  ),
  table: TableDefinition(
    rowActions: ['detail'],
    columns: [
      ColumnDefinition(field: 'code', label: 'コード', sortable: true),
      ColumnDefinition(field: 'name', label: '商品名'),
    ],
  ),
  actions: [
    ActionDefinition(id: 'detail', type: 'plugin', plugin: 'showDetail', label: '詳細'),
  ],
);

Widget _harness(Repository repository, ActionRegistry actions) {
  return MaterialApp(
    home: Scaffold(
      body: HatakeScope(
        repositories: RepositoryRegistry({'productRepository': repository}),
        renderer: const MaterialRenderer(),
        actions: actions,
        child: const HatakePageView(definition: _definition),
      ),
    ),
  );
}

void main() {
  List<DataRecord> seed() => [
        {'id': 1, 'code': 'P001', 'name': 'Apple'},
        {'id': 2, 'code': 'P002', 'name': 'Banana'},
      ];

  testWidgets('renders a read-only list (no create/edit/delete)',
      (tester) async {
    await tester.pumpWidget(
      _harness(_InMemoryRepository(seed()), ActionRegistry()),
    );
    await tester.pumpAndSettle();

    expect(find.text('商品照会'), findsOneWidget);
    expect(find.text('Apple'), findsOneWidget);
    expect(find.text('全 2 件'), findsOneWidget);
    // No CRUD controls.
    expect(find.byKey(const Key('hatake.action.create')), findsNothing);
    expect(find.byKey(const Key('hatake.delete.1')), findsNothing);
    expect(find.byKey(const Key('hatake.edit.1')), findsNothing);
  });

  testWidgets('search filters the list', (tester) async {
    await tester.pumpWidget(
      _harness(_InMemoryRepository(seed()), ActionRegistry()),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
        find.byKey(const Key('hatake.filter.name')), 'Banana');
    await tester.tap(find.byKey(const Key('hatake.search')));
    await tester.pumpAndSettle();

    expect(find.text('Apple'), findsNothing);
    expect(find.text('全 1 件'), findsOneWidget);
  });

  testWidgets('row plugin action dispatches with the row record',
      (tester) async {
    DataRecord? opened;
    final actions = ActionRegistry({
      'showDetail': (ctx) async => opened = ctx.record,
    });
    await tester.pumpWidget(_harness(_InMemoryRepository(seed()), actions));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.rowaction.detail.2')));
    await tester.pumpAndSettle();

    expect(opened, isNotNull);
    expect(opened!['name'], 'Banana');
  });
}

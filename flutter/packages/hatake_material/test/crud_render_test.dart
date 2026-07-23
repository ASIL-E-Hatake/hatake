import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// A simple in-memory repository for tests, applying `contains` on `name`.
class InMemoryRepository implements Repository {
  final List<DataRecord> _rows;

  InMemoryRepository(List<DataRecord> rows) : _rows = [...rows];

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    Iterable<DataRecord> filtered = _rows;
    final name = query.filters['name'];
    if (name is String && name.isNotEmpty) {
      filtered = filtered.where(
        (r) => (r['name'] as String).contains(name),
      );
    }
    final all = filtered.toList();
    final start = query.page * query.pageSize;
    final page = all.skip(start).take(query.pageSize).toList();
    return PageResult(items: page, totalCount: all.length);
  }

  @override
  Future<DataRecord?> findByKey(Object key) async =>
      _rows.where((r) => r['id'] == key).firstOrNull;

  @override
  Future<DataRecord> create(DataRecord data) async {
    _rows.add(data);
    return data;
  }

  @override
  Future<DataRecord> update(Object key, DataRecord data) async {
    final index = _rows.indexWhere((r) => r['id'] == key);
    if (index >= 0) _rows[index] = data;
    return data;
  }

  @override
  Future<void> delete(Object key) async {
    _rows.removeWhere((r) => r['id'] == key);
  }
}

const _definition = CrudPageDefinition(
  id: 'customer_master',
  title: '顧客マスタ',
  repository: 'customerRepository',
  keyField: 'id',
  search: SearchDefinition(
    filters: [
      FilterDefinition(field: 'name', label: '顧客名'),
    ],
  ),
  table: TableDefinition(
    rowActions: ['edit', 'delete'],
    columns: [
      ColumnDefinition(field: 'code', label: 'コード', sortable: true),
      ColumnDefinition(field: 'name', label: '顧客名'),
    ],
  ),
  form: FormDefinition(
    sections: [
      SectionDefinition(
        title: '基本情報',
        fields: [
          FieldDefinition(field: 'code', label: 'コード', required: true),
          FieldDefinition(field: 'name', label: '顧客名', required: true),
        ],
      ),
    ],
  ),
  actions: [
    ActionDefinition(id: 'create', type: 'create', label: '新規登録'),
  ],
);

Widget _harness(Repository repository) {
  return MaterialApp(
    home: Scaffold(
      body: HatakeScope(
        repositories: RepositoryRegistry({'customerRepository': repository}),
        renderer: const MaterialRenderer(),
        child: const HatakeCrudView(definition: _definition),
      ),
    ),
  );
}

void main() {
  List<DataRecord> seed() => [
        {'id': 1, 'code': 'C001', 'name': 'Alice'},
        {'id': 2, 'code': 'C002', 'name': 'Bob'},
        {'id': 3, 'code': 'C003', 'name': 'Carol'},
      ];

  testWidgets('loads and renders all records from the repository',
      (tester) async {
    await tester.pumpWidget(_harness(InMemoryRepository(seed())));
    await tester.pumpAndSettle();

    expect(find.text('顧客マスタ'), findsOneWidget);
    expect(find.text('Alice'), findsOneWidget);
    expect(find.text('Bob'), findsOneWidget);
    expect(find.text('Carol'), findsOneWidget);
    expect(find.text('全 3 件'), findsOneWidget);
  });

  testWidgets('search filters the table', (tester) async {
    await tester.pumpWidget(_harness(InMemoryRepository(seed())));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('hatake.filter.name')), 'Bob');
    await tester.tap(find.byKey(const Key('hatake.search')));
    await tester.pumpAndSettle();

    // 'Bob' appears in the filter field too, so scope this check to the table.
    expect(
      find.descendant(
        of: find.byType(DataTable),
        matching: find.text('Bob'),
      ),
      findsOneWidget,
    );
    expect(find.text('Alice'), findsNothing);
    expect(find.text('Carol'), findsNothing);
    expect(find.text('全 1 件'), findsOneWidget);
  });

  testWidgets('delete removes a row', (tester) async {
    await tester.pumpWidget(_harness(InMemoryRepository(seed())));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.delete.2')));
    await tester.pumpAndSettle();

    expect(find.text('Bob'), findsNothing);
    expect(find.text('Alice'), findsOneWidget);
    expect(find.text('全 2 件'), findsOneWidget);
  });

  testWidgets('create adds a record via the form dialog', (tester) async {
    await tester.pumpWidget(_harness(InMemoryRepository(seed())));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.action.create')));
    await tester.pumpAndSettle();

    expect(find.text('新規登録'), findsWidgets); // dialog title

    await tester.enterText(find.byKey(const Key('hatake.form.code')), 'C004');
    await tester.enterText(find.byKey(const Key('hatake.form.name')), 'Dave');
    await tester.tap(find.byKey(const Key('hatake.form.save')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('hatake.form.save')), findsNothing); // closed
    expect(find.text('Dave'), findsOneWidget);
    expect(find.text('全 4 件'), findsOneWidget);
  });

  testWidgets('validation blocks submit and shows message', (tester) async {
    await tester.pumpWidget(_harness(InMemoryRepository(seed())));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.action.create')));
    await tester.pumpAndSettle();

    // Save with required fields empty.
    await tester.tap(find.byKey(const Key('hatake.form.save')));
    await tester.pumpAndSettle();

    expect(find.text('必須項目です'), findsWidgets);
    expect(find.byKey(const Key('hatake.form.save')), findsOneWidget); // open
    expect(find.text('全 3 件'), findsOneWidget); // nothing added
  });

  testWidgets('edit updates a record', (tester) async {
    await tester.pumpWidget(_harness(InMemoryRepository(seed())));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.edit.2')));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('hatake.form.name')), 'Bobby');
    await tester.tap(find.byKey(const Key('hatake.form.save')));
    await tester.pumpAndSettle();

    expect(find.text('Bobby'), findsOneWidget);
    expect(find.text('Bob'), findsNothing);
    expect(find.text('全 3 件'), findsOneWidget);
  });
}

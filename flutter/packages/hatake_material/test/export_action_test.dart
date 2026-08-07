import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// CSV export from a list page. The point of these tests: the file holds the
/// whole result (not the page on screen) and only the columns the user may see.
class _Orders implements Repository {
  final List<DataRecord> rows;
  final List<RepositoryQuery> queries = [];

  _Orders(this.rows);

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    queries.add(query);
    final start = query.page * query.pageSize;
    return PageResult(
      items: rows.skip(start).take(query.pageSize).toList(),
      totalCount: rows.length,
    );
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

final _rows = <DataRecord>[
  {'orderNo': 'SO-1', 'customer': '山田商事', 'amount': 100, 'cost': 60},
  {'orderNo': 'SO-2', 'customer': '佐藤物産', 'amount': 200, 'cost': 120},
  {'orderNo': 'SO-3', 'customer': '鈴木工業', 'amount': 300, 'cost': 180},
];

const _search = SearchPageDefinition(
  id: 'order_search',
  title: '受注照会',
  repository: 'orderRepository',
  keyField: 'orderNo',
  table: TableDefinition(
    pagination: PaginationDefinition(pageSize: 2),
    columns: [
      ColumnDefinition(field: 'orderNo', label: '受注番号', sortable: true),
      ColumnDefinition(
        field: 'amount',
        label: '金額',
        type: ColumnTypes.number,
        format: 'currency',
        config: {'symbol': '¥'},
      ),
      // Only a manager may see the cost — and only their CSV may hold it.
      ColumnDefinition(field: 'cost', label: '原価', roles: ['manager']),
    ],
  ),
  actions: [
    ActionDefinition(
      id: 'csv',
      type: ActionTypes.export,
      label: 'CSV出力',
      config: {'filename': '受注一覧'},
    ),
  ],
);

Widget _harness(
  Repository repository, {
  ExportSink? exportSink,
  Set<String> roles = const {},
}) {
  return MaterialApp(
    home: Scaffold(
      body: HatakeScope(
        repositories: RepositoryRegistry({'orderRepository': repository}),
        renderer: const MaterialRenderer(),
        exportSink: exportSink,
        roles: roles,
        child: const HatakePageView(definition: _search),
      ),
    ),
  );
}

void main() {
  testWidgets('a list export re-queries so the CSV is not just page 1',
      (tester) async {
    ExportRequest? captured;
    final repository = _Orders(_rows);
    await tester.pumpWidget(
        _harness(repository, exportSink: (request) => captured = request));
    await tester.pumpAndSettle();

    // The page on screen holds 2 of the 3 rows.
    expect(find.text('SO-3'), findsNothing);

    await tester.tap(find.byKey(const Key('hatake.action.csv')));
    await tester.pumpAndSettle();

    expect(repository.queries.last.pageSize, 10000);
    expect(repository.queries.last.page, 0);
    expect(captured!.filename, '受注一覧.csv');
    expect(
      captured!.text,
      '受注番号,金額\r\nSO-1,¥100\r\nSO-2,¥200\r\nSO-3,¥300\r\n',
    );
  });

  testWidgets('the export keeps the search conditions and the sort',
      (tester) async {
    final repository = _Orders(_rows);
    await tester.pumpWidget(_harness(repository, exportSink: (_) {}));
    await tester.pumpAndSettle();

    await tester.tap(find.text('受注番号'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hatake.action.csv')));
    await tester.pumpAndSettle();

    expect(repository.queries.last.sortField, 'orderNo');
  });

  testWidgets('a column the role may not see stays out of the CSV',
      (tester) async {
    ExportRequest? captured;
    await tester.pumpWidget(_harness(
      _Orders(_rows),
      exportSink: (request) => captured = request,
      roles: const {'manager'},
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.action.csv')));
    await tester.pumpAndSettle();
    expect(captured!.text, contains('受注番号,金額,原価'));
    expect(captured!.text, contains('SO-1,¥100,60'));
  });

  testWidgets('a page without rows to export says so', (tester) async {
    const form = FormPageDefinition(
      id: 'order_entry',
      title: '受注入力',
      repository: 'orderRepository',
      actions: [
        ActionDefinition(
          id: 'csv',
          type: ActionTypes.export,
          label: 'CSV出力',
        ),
      ],
    );
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'orderRepository': _Orders(_rows)}),
          renderer: const MaterialRenderer(),
          exportSink: (_) {},
          child: const HatakePageView(definition: form),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.action.csv')));
    await tester.pumpAndSettle();
    expect(find.textContaining('出力できません'), findsOneWidget);
  });
}

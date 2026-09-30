import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 検索欄の既定値（`filter.defaultValue`。0.9.23）。入力欄だけ埋まって一覧は全件、に
/// しない＝**最初の読み込みから既定値の条件**で読み、欄にも同じ値が入っている。
class _Repo implements Repository {
  final List<RepositoryQuery> queries = [];

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    queries.add(query);
    return const PageResult(items: [], totalCount: 0);
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

const _page = SearchPageDefinition(
  id: 'employees',
  title: '社員',
  repository: 'repo',
  search: SearchDefinition(
    filters: [
      FilterDefinition(field: 'name', label: '氏名', defaultValue: '山'),
      FilterDefinition(
        field: 'status',
        label: '在籍',
        type: FieldTypes.select,
        operator: FilterOperators.equals,
        options: [
          OptionItem(value: 'active', label: '在籍'),
          OptionItem(value: 'retired', label: '退職'),
        ],
        defaultValue: 'active',
      ),
      FilterDefinition(
        field: 'amount',
        label: '金額',
        type: FieldTypes.number,
        operator: FilterOperators.between,
        defaultValue: [1000, null],
      ),
    ],
  ),
  table: TableDefinition(
    columns: [ColumnDefinition(field: 'name', label: '氏名')],
  ),
);

void main() {
  testWidgets('最初の一覧が既定値の条件で読まれ、欄にも同じ値が入る', (tester) async {
    final repo = _Repo();
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'repo': repo}),
          renderer: const MaterialRenderer(),
          child: const HatakePageView(definition: _page),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(repo.queries.first.filters, {
      'name': '山',
      'status': 'active',
      'amount': [1000, null],
    });
    final name =
        tester.widget<TextField>(find.byKey(const Key('hatake.filter.name')));
    expect(name.controller?.text, '山');
    final from = tester
        .widget<TextField>(find.byKey(const Key('hatake.filter.amount.from')));
    expect(from.controller?.text, '1000');

    // 検索を押しても、欄の値（＝既定値）のまま読む。
    await tester.tap(find.byKey(const Key('hatake.search')));
    await tester.pumpAndSettle();
    expect(repo.queries.last.filters['status'], 'active');
    expect(repo.queries.last.filters['name'], '山');
  });
}

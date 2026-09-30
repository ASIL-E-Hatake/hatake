import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 列に `optionsSource`（0.9.23）: キーから別マスタの名前を引いて出す。見本のマスタメンテは
/// 部署名のために DB のビューを手で作っていた。
class _Rows implements Repository {
  final List<DataRecord> rows;
  int searches = 0;
  _Rows(this.rows);

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    searches++;
    return PageResult(items: rows, totalCount: rows.length);
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
  repository: 'employeeRepository',
  table: TableDefinition(
    columns: [
      ColumnDefinition(field: 'code', label: '社員番号'),
      ColumnDefinition(
        field: 'dept',
        label: '部署',
        optionsSource: OptionsSource(repository: 'deptRepository'),
      ),
    ],
  ),
);

void main() {
  testWidgets('キーを引いた先の名前で出す（引いた表に無いキーはそのまま）', (tester) async {
    final depts = _Rows([
      {'code': 'D01', 'name': '営業部'},
    ]);
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({
            'employeeRepository': _Rows([
              {'code': 'E-1', 'dept': 'D01'},
              {'code': 'E-2', 'dept': 'D99'},
            ]),
            'deptRepository': depts,
          }),
          renderer: const MaterialRenderer(),
          child: const HatakePageView(definition: _page),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('営業部'), findsOneWidget);
    expect(find.text('D01'), findsNothing);
    expect(find.text('D99'), findsOneWidget);
    // 行の数だけ引かない（表で1回）。
    expect(depts.searches, 1);
  });
}

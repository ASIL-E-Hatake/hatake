import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

class _Repo implements Repository {
  @override
  Future<PageResult> search(RepositoryQuery query) async => const PageResult(
        items: [
          {'id': 1, 'code': 'C001', 'name': '山田商事', 'amount': 1234567},
        ],
        totalCount: 1,
      );
  @override
  Future<DataRecord?> findByKey(Object key) async =>
      key == 1 ? {'id': 1, 'code': 'C001', 'name': '山田商事', 'amount': 1234567} : null;
  @override
  Future<DataRecord> create(DataRecord data) async => data;
  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;
  @override
  Future<void> delete(Object key) async {}
}

Widget _wrap(Widget child, Repository repo) => MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'repo': repo}),
          renderer: const MaterialRenderer(),
          child: child,
        ),
      ),
    );

const _master = MasterPageDefinition(
  id: 'm',
  title: 'マスタ',
  repository: 'repo',
  keyField: 'id',
  table: TableDefinition(
    rowActions: ['edit', 'delete'],
    columns: [ColumnDefinition(field: 'code', label: 'コード')],
  ),
  form: FormDefinition(sections: [
    SectionDefinition(fields: [
      FieldDefinition(field: 'code', label: 'コード', required: true),
    ])
  ]),
  actions: [ActionDefinition(id: 'create', type: 'create', label: '新規登録')],
);

const _detail = DetailPageDefinition(
  id: 'd',
  title: '顧客詳細',
  repository: 'repo',
  keyField: 'id',
  form: FormDefinition(sections: [
    SectionDefinition(title: '基本情報', fields: [
      FieldDefinition(field: 'code', label: 'コード'),
      FieldDefinition(
        field: 'amount',
        label: '売上',
        format: 'currency',
        config: {'symbol': '¥'},
      ),
    ])
  ]),
);

void main() {
  testWidgets('MasterPage renders like a CRUD page (reuses CrudLike)',
      (tester) async {
    await tester.pumpWidget(
      _wrap(const HatakePageView(definition: _master), _Repo()),
    );
    await tester.pumpAndSettle();

    expect(find.text('マスタ'), findsOneWidget);
    expect(find.text('C001'), findsOneWidget);
    expect(find.byKey(const Key('hatake.action.create')), findsOneWidget);
  });

  testWidgets('DetailPage loads one record and formats fields', (tester) async {
    await tester.pumpWidget(
      _wrap(const HatakePageView(definition: _detail, recordKey: 1), _Repo()),
    );
    await tester.pumpAndSettle();

    expect(find.text('顧客詳細'), findsOneWidget);
    expect(find.byKey(const Key('hatake.detail.code')), findsOneWidget);
    expect(find.text('C001'), findsOneWidget);
    // amount formatted with currency + ¥ symbol
    expect(find.text('¥1,234,567'), findsOneWidget);
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

class _Repo implements Repository {
  @override
  Future<PageResult> search(RepositoryQuery query) async => const PageResult(
        items: [
          {'id': 1, 'code': 'C001', 'secret': 'xxx'},
        ],
        totalCount: 1,
      );

  @override
  Future<DataRecord?> findByKey(Object key) async => null;

  @override
  Future<DataRecord> create(DataRecord data) async => data;

  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;

  @override
  Future<void> delete(Object key) async {}
}

const _definition = CrudPageDefinition(
  id: 'p',
  title: 'T',
  repository: 'repo',
  keyField: 'id',
  table: TableDefinition(
    columns: [
      ColumnDefinition(field: 'code', label: 'コード'),
      ColumnDefinition(field: 'secret', label: '極秘', roles: ['admin']),
    ],
  ),
  form: FormDefinition(
    sections: [
      SectionDefinition(fields: [FieldDefinition(field: 'code', label: 'コード')]),
    ],
  ),
  actions: [
    ActionDefinition(id: 'create', type: 'create', label: '新規登録'),
    ActionDefinition(
      id: 'export',
      type: 'plugin',
      label: 'エクスポート',
      plugin: 'export',
      roles: ['admin'],
    ),
  ],
);

Widget _harness(Set<String> roles) {
  return MaterialApp(
    home: Scaffold(
      body: HatakeScope(
        repositories: RepositoryRegistry({'repo': _Repo()}),
        renderer: const MaterialRenderer(),
        roles: roles,
        child: const HatakeCrudView(definition: _definition),
      ),
    ),
  );
}

void main() {
  testWidgets('hides role-gated column and action when the role is missing',
      (tester) async {
    await tester.pumpWidget(_harness(const {}));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('hatake.action.create')), findsOneWidget);
    expect(find.byKey(const Key('hatake.action.export')), findsNothing);
    expect(find.text('極秘'), findsNothing);
    expect(find.text('コード'), findsOneWidget);
  });

  testWidgets('shows them for a user that has the role', (tester) async {
    await tester.pumpWidget(_harness(const {'admin'}));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('hatake.action.export')), findsOneWidget);
    expect(find.text('極秘'), findsOneWidget);
  });
}

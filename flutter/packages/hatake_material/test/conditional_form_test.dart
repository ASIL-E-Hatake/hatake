import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// Minimal repository — the conditional/computed behavior is form-side.
class _Repo implements Repository {
  @override
  Future<PageResult> search(RepositoryQuery query) async =>
      PageResult(items: const [], totalCount: 0);

  @override
  Future<DataRecord?> findByKey(Object key) async => null;

  @override
  Future<DataRecord> create(DataRecord data) async => data;

  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;

  @override
  Future<void> delete(Object key) async {}
}

final _definition = CrudPageDefinition(
  id: 'p',
  title: 'テスト',
  repository: 'repo',
  keyField: 'id',
  table: const TableDefinition(
    columns: [ColumnDefinition(field: 'last', label: '姓')],
  ),
  form: const FormDefinition(
    sections: [
      SectionDefinition(
        fields: [
          FieldDefinition(field: 'type', label: '種別'),
          FieldDefinition(
            field: 'corpName',
            label: '法人名',
            visibleWhen: {
              'field': 'type',
              'operator': 'equals',
              'value': 'corporate',
            },
          ),
          FieldDefinition(field: 'last', label: '姓'),
          FieldDefinition(field: 'first', label: '名'),
          FieldDefinition(
            field: 'fullName',
            label: '氏名',
            computed: {
              'op': 'concat',
              'fields': ['last', 'first'],
              'separator': ' ',
            },
          ),
        ],
      ),
    ],
  ),
  actions: [
    ActionDefinition(id: 'create', type: 'create', label: '新規登録'),
  ],
);

Widget _harness() {
  return MaterialApp(
    home: Scaffold(
      body: HatakeScope(
        repositories: RepositoryRegistry({'repo': _Repo()}),
        renderer: const MaterialRenderer(),
        child: HatakeCrudView(definition: _definition),
      ),
    ),
  );
}

void main() {
  testWidgets('visibleWhen hides/shows and computed derives its value',
      (tester) async {
    await tester.pumpWidget(_harness());
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.action.create')));
    await tester.pumpAndSettle();

    // corpName hidden while type != corporate.
    expect(find.byKey(const Key('hatake.form.corpName')), findsNothing);

    await tester.enterText(
        find.byKey(const Key('hatake.form.type')), 'corporate');
    await tester.pumpAndSettle();

    // Now visible.
    expect(find.byKey(const Key('hatake.form.corpName')), findsOneWidget);

    // Computed fullName reacts to its inputs.
    await tester.enterText(find.byKey(const Key('hatake.form.last')), '山田');
    await tester.enterText(find.byKey(const Key('hatake.form.first')), '太郎');
    await tester.pumpAndSettle();

    expect(find.text('山田 太郎'), findsOneWidget);
  });
}

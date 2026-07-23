import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

class _CapturingRepository implements Repository {
  final List<DataRecord> created = [];
  @override
  Future<PageResult> search(RepositoryQuery query) async => PageResult.empty;
  @override
  Future<DataRecord?> findByKey(Object key) async => null;
  @override
  Future<DataRecord> create(DataRecord data) async {
    created.add(data);
    return data;
  }

  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;
  @override
  Future<void> delete(Object key) async {}
}

const _definition = CrudPageDefinition(
  id: 'p',
  title: 'コード登録',
  repository: 'repo',
  keyField: 'id',
  table: TableDefinition(columns: [ColumnDefinition(field: 'code', label: 'コード')]),
  form: FormDefinition(sections: [
    SectionDefinition(fields: [
      FieldDefinition(
        field: 'code',
        label: 'コード',
        required: true,
        normalize: ['toHankaku', 'trim'],
      ),
    ])
  ]),
  actions: [ActionDefinition(id: 'create', type: 'create', label: '新規登録')],
);

void main() {
  testWidgets('normalize is applied on submit (full-width → half-width)',
      (tester) async {
    final repo = _CapturingRepository();
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'repo': repo}),
          renderer: const MaterialRenderer(),
          child: const HatakeCrudView(definition: _definition),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.action.create')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('hatake.form.code')), '　１２３　');
    await tester.tap(find.byKey(const Key('hatake.form.save')));
    await tester.pumpAndSettle();

    expect(repo.created.single['code'], '123');
  });
}

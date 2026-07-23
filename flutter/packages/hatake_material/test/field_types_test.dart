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
  id: 'employees',
  title: '社員',
  repository: 'repo',
  keyField: 'id',
  table: TableDefinition(columns: [ColumnDefinition(field: 'name', label: '氏名')]),
  form: FormDefinition(
    sections: [
      SectionDefinition(
        fields: [
          FieldDefinition(field: 'name', label: '氏名', required: true),
          FieldDefinition(
            field: 'role',
            label: '役割',
            type: 'radio',
            options: [
              OptionItem(value: 'admin', label: '管理者'),
              OptionItem(value: 'user', label: '一般'),
            ],
          ),
          FieldDefinition(
            field: 'tags',
            label: 'タグ',
            type: 'multiSelect',
            options: [
              OptionItem(value: 'a', label: 'A'),
              OptionItem(value: 'b', label: 'B'),
              OptionItem(value: 'c', label: 'C'),
            ],
          ),
          FieldDefinition(field: 'hireDate', label: '入社日', type: 'date'),
        ],
      ),
    ],
  ),
  actions: [ActionDefinition(id: 'create', type: 'create', label: '新規登録')],
);

Widget _harness(Repository repository) => MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'repo': repository}),
          renderer: const MaterialRenderer(),
          child: const HatakeCrudView(definition: _definition),
        ),
      ),
    );

Future<void> _openCreate(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('hatake.action.create')));
  await tester.pumpAndSettle();
  await tester.enterText(find.byKey(const Key('hatake.form.name')), '山田');
}

void main() {
  testWidgets('radio field captures the chosen value', (tester) async {
    final repo = _CapturingRepository();
    await tester.pumpWidget(_harness(repo));
    await tester.pumpAndSettle();
    await _openCreate(tester);

    await tester.tap(find.byKey(const Key('hatake.form.role.admin')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hatake.form.save')));
    await tester.pumpAndSettle();

    expect(repo.created.single['role'], 'admin');
  });

  testWidgets('multiSelect field captures multiple values', (tester) async {
    final repo = _CapturingRepository();
    await tester.pumpWidget(_harness(repo));
    await tester.pumpAndSettle();
    await _openCreate(tester);

    await tester.tap(find.byKey(const Key('hatake.form.tags.a')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hatake.form.tags.c')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hatake.form.save')));
    await tester.pumpAndSettle();

    expect(repo.created.single['tags'], containsAll(['a', 'c']));
  });

  testWidgets('date field opens a picker and captures a date', (tester) async {
    final repo = _CapturingRepository();
    await tester.pumpWidget(_harness(repo));
    await tester.pumpAndSettle();
    await _openCreate(tester);

    await tester.tap(find.byKey(const Key('hatake.form.hireDate')));
    await tester.pumpAndSettle();
    // The date picker is open; accept the initial date (2026-01-01).
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hatake.form.save')));
    await tester.pumpAndSettle();

    expect(repo.created.single['hireDate'], '2026-01-01');
  });
}

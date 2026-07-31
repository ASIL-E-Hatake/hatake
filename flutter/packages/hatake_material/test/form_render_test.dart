import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

class _Repo implements Repository {
  final List<DataRecord> created = [];
  final Map<Object, DataRecord> updated = {};
  final DataRecord? seed;
  _Repo({this.seed});

  @override
  Future<PageResult> search(RepositoryQuery query) async => PageResult.empty;
  @override
  Future<DataRecord?> findByKey(Object key) async => seed;
  @override
  Future<DataRecord> create(DataRecord data) async {
    created.add(data);
    return data;
  }

  @override
  Future<DataRecord> update(Object key, DataRecord data) async {
    updated[key] = data;
    return data;
  }

  @override
  Future<void> delete(Object key) async {}
}

const _definition = FormPageDefinition(
  id: 'customer_form',
  title: '顧客入力',
  repository: 'repo',
  keyField: 'id',
  form: FormDefinition(sections: [
    SectionDefinition(title: '基本情報', fields: [
      FieldDefinition(field: 'code', label: 'コード', required: true),
      FieldDefinition(field: 'name', label: '顧客名', required: true),
    ])
  ]),
);

Widget _wrap(Widget child, Repository repo) => MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'repo': repo}),
          renderer: const MaterialRenderer(),
          child: child,
        ),
      ),
    );

void main() {
  testWidgets('FormPage creates a record on save', (tester) async {
    final repo = _Repo();
    await tester.pumpWidget(
      _wrap(const HatakeFormView(definition: _definition), repo),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('hatake.form.code')), 'C001');
    await tester.enterText(find.byKey(const Key('hatake.form.name')), '山田商事');
    await tester.tap(find.byKey(const Key('hatake.form.save')));
    await tester.pumpAndSettle();

    expect(repo.created.single['code'], 'C001');
    expect(repo.created.single['name'], '山田商事');
    expect(find.text('保存しました'), findsOneWidget);
  });

  testWidgets('FormPage validation blocks empty required fields',
      (tester) async {
    final repo = _Repo();
    await tester.pumpWidget(
      _wrap(const HatakeFormView(definition: _definition), repo),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.form.save')));
    await tester.pumpAndSettle();

    expect(find.text('必須項目です'), findsWidgets);
    expect(repo.created, isEmpty);
  });

  testWidgets('FormPage loads a record for edit and updates it', (tester) async {
    final repo = _Repo(seed: {'id': 7, 'code': 'C007', 'name': '旧名'});
    await tester.pumpWidget(
      _wrap(const HatakeFormView(definition: _definition, recordKey: 7), repo),
    );
    await tester.pumpAndSettle();

    // Existing values are loaded into the fields.
    expect(find.widgetWithText(TextField, 'C007'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('hatake.form.name')), '新名');
    await tester.tap(find.byKey(const Key('hatake.form.save')));
    await tester.pumpAndSettle();

    expect(repo.updated[7]!['name'], '新名');
    expect(repo.updated[7]!['code'], 'C007');
  });
}

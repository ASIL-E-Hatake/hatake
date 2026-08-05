import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// Serves three child rows so their order can be moved around, and captures
/// what the form page saves.
class _Repo implements Repository {
  DataRecord? saved;

  @override
  Future<PageResult> search(RepositoryQuery query) async => PageResult.empty;

  @override
  Future<DataRecord?> findByKey(Object key) async => {
        'orderNo': key,
        'lines': [
          {'item': '鉛筆'},
          {'item': 'ノート'},
          {'item': '消しゴム'},
        ],
      };

  @override
  Future<DataRecord> create(DataRecord data) async => saved = data;

  @override
  Future<DataRecord> update(Object key, DataRecord data) async => saved = data;

  @override
  Future<void> delete(Object key) async {}
}

FormPageDefinition _definition({Map<String, Object?> config = const {}}) {
  return FormPageDefinition(
    id: 'order_entry',
    title: '受注入力',
    repository: 'repo',
    keyField: 'orderNo',
    form: FormDefinition(
      sections: [
        SectionDefinition(
          fields: [
            FieldDefinition(
              field: 'lines',
              label: '明細',
              type: FieldTypes.subTable,
              config: config,
              columns: const [
                ColumnDefinition(field: 'item', label: '品名'),
              ],
              rowFields: const [
                FieldDefinition(field: 'item', label: '品名', required: true),
              ],
            ),
          ],
        ),
      ],
    ),
  );
}

Widget _harness(_Repo repo, {Map<String, Object?> config = const {}}) {
  return MaterialApp(
    home: Scaffold(
      body: HatakeScope(
        repositories: RepositoryRegistry({'repo': repo}),
        renderer: const MaterialRenderer(),
        child: HatakeFormView(
          definition: _definition(config: config),
          recordKey: 'SO-1',
        ),
      ),
    ),
  );
}

/// The 品名 values in the order they are painted down the grid.
List<String> _visibleItems(WidgetTester tester) {
  final items = ['鉛筆', 'ノート', '消しゴム']
      .map((text) => (text, tester.getTopLeft(find.text(text)).dy))
      .toList()
    ..sort((a, b) => a.$2.compareTo(b.$2));
  return [for (final item in items) item.$1];
}

void main() {
  testWidgets('moving a row down changes the visible order', (tester) async {
    final repo = _Repo();
    await tester.pumpWidget(_harness(repo));
    await tester.pumpAndSettle();

    expect(_visibleItems(tester), ['鉛筆', 'ノート', '消しゴム']);

    await tester.tap(find.byKey(const Key('hatake.subtable.lines.down.0')));
    await tester.pumpAndSettle();

    expect(_visibleItems(tester), ['ノート', '鉛筆', '消しゴム']);

    // The new order is what gets persisted.
    await tester.tap(find.byKey(const Key('hatake.form.save')));
    await tester.pumpAndSettle();
    final lines = repo.saved!['lines'] as List;
    expect([for (final row in lines) (row as Map)['item']],
        ['ノート', '鉛筆', '消しゴム']);
  });

  testWidgets('moving a row up changes the visible order', (tester) async {
    await tester.pumpWidget(_harness(_Repo()));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.subtable.lines.up.2')));
    await tester.pumpAndSettle();

    expect(_visibleItems(tester), ['鉛筆', '消しゴム', 'ノート']);
  });

  testWidgets('first row cannot move up and last row cannot move down',
      (tester) async {
    await tester.pumpWidget(_harness(_Repo()));
    await tester.pumpAndSettle();

    IconButton button(String key) =>
        tester.widget<IconButton>(find.byKey(Key('hatake.subtable.lines.$key')));

    expect(button('up.0').onPressed, isNull);
    expect(button('down.0').onPressed, isNotNull);
    expect(button('up.2').onPressed, isNotNull);
    expect(button('down.2').onPressed, isNull);
  });

  testWidgets('config reorderable:false hides the up/down buttons',
      (tester) async {
    await tester.pumpWidget(_harness(_Repo(), config: {'reorderable': false}));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('hatake.subtable.lines.up.1')), findsNothing);
    expect(find.byKey(const Key('hatake.subtable.lines.down.1')), findsNothing);
    // Editing a row is unaffected by the opt-out.
    expect(find.byKey(const Key('hatake.subtable.lines.edit.1')), findsOneWidget);
  });
}

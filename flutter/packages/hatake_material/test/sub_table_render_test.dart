import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// Captures what the form page saves so the test can assert the child rows.
class _Repo implements Repository {
  DataRecord? saved;

  @override
  Future<PageResult> search(RepositoryQuery query) async => PageResult.empty;

  @override
  Future<DataRecord?> findByKey(Object key) async => {
        'orderNo': key,
        'customer': '山田商事',
        'lines': [
          {'item': '鉛筆', 'qty': 2, 'price': 100, 'amount': 200},
        ],
      };

  @override
  Future<DataRecord> create(DataRecord data) async => saved = data;

  @override
  Future<DataRecord> update(Object key, DataRecord data) async => saved = data;

  @override
  Future<void> delete(Object key) async {}
}

const _definition = FormPageDefinition(
  id: 'order_entry',
  title: '受注入力',
  repository: 'repo',
  keyField: 'orderNo',
  form: FormDefinition(
    sections: [
      SectionDefinition(
        fields: [
          FieldDefinition(field: 'customer', label: '顧客'),
          FieldDefinition(
            field: 'lines',
            label: '明細',
            type: FieldTypes.subTable,
            columns: [
              ColumnDefinition(field: 'item', label: '品名'),
              ColumnDefinition(field: 'qty', label: '数量', type: ColumnTypes.number),
              ColumnDefinition(
                field: 'amount',
                label: '金額',
                type: ColumnTypes.number,
                format: 'currency',
                config: {'symbol': '¥'},
              ),
            ],
            rowFields: [
              FieldDefinition(field: 'item', label: '品名', required: true),
              FieldDefinition(field: 'qty', label: '数量', type: FieldTypes.number),
              FieldDefinition(field: 'price', label: '単価', type: FieldTypes.number),
              // Row-level computed: 金額 = 数量 × 単価
              FieldDefinition(
                field: 'amount',
                label: '金額',
                computed: {'op': 'product', 'fields': ['qty', 'price']},
              ),
            ],
          ),
        ],
      ),
    ],
  ),
);

Widget _harness(_Repo repo, {Object? recordKey}) {
  return MaterialApp(
    home: Scaffold(
      body: HatakeScope(
        repositories: RepositoryRegistry({'repo': repo}),
        renderer: const MaterialRenderer(),
        child: HatakeFormView(definition: _definition, recordKey: recordKey),
      ),
    ),
  );
}

void main() {
  testWidgets('renders existing child rows through the declared columns',
      (tester) async {
    await tester.pumpWidget(_harness(_Repo(), recordKey: 'SO-1'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('hatake.subtable.lines')), findsOneWidget);
    expect(find.text('鉛筆'), findsOneWidget);
    // The child column's `format: currency` is applied.
    expect(find.text('¥200'), findsOneWidget);
  });

  testWidgets('shows an empty state when there are no rows', (tester) async {
    await tester.pumpWidget(_harness(_Repo()));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('hatake.subtable.lines.empty')), findsOneWidget);
    expect(find.byKey(const Key('hatake.subtable.lines')), findsNothing);
  });

  testWidgets('adds a row (row validators and computed apply)', (tester) async {
    final repo = _Repo();
    await tester.pumpWidget(_harness(repo));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.subtable.lines.add')));
    await tester.pumpAndSettle();

    // Saving an empty row is blocked by the row's `required`.
    await tester.tap(find.byKey(const Key('hatake.subtable.lines.row.save')));
    await tester.pumpAndSettle();
    expect(find.text('必須項目です'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('hatake.form.item')), 'ノート');
    await tester.enterText(find.byKey(const Key('hatake.form.qty')), '3');
    await tester.enterText(find.byKey(const Key('hatake.form.price')), '150');
    await tester.tap(find.byKey(const Key('hatake.subtable.lines.row.save')));
    await tester.pumpAndSettle();

    // The grid now shows the row, with 金額 = 3 × 150 computed for it.
    expect(find.text('ノート'), findsOneWidget);
    expect(find.text('¥450'), findsOneWidget);

    // Saving the page hands the child rows to the repository.
    await tester.tap(find.byKey(const Key('hatake.form.save')));
    await tester.pumpAndSettle();
    final lines = repo.saved!['lines'] as List;
    expect(lines.length, 1);
    expect((lines.single as Map)['item'], 'ノート');
    expect((lines.single as Map)['amount'], 450);
  });

  testWidgets('deletes a row', (tester) async {
    await tester.pumpWidget(_harness(_Repo(), recordKey: 'SO-1'));
    await tester.pumpAndSettle();

    expect(find.text('鉛筆'), findsOneWidget);
    await tester.tap(find.byKey(const Key('hatake.subtable.lines.delete.0')));
    await tester.pumpAndSettle();

    expect(find.text('鉛筆'), findsNothing);
    expect(find.byKey(const Key('hatake.subtable.lines.empty')), findsOneWidget);
  });
}

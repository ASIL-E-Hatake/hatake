import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// The parent (受注ヘッダ). Its record deliberately carries no `lines`: with a
/// `source`, child rows live in their own repository.
class _OrderRepo implements Repository {
  DataRecord? saved;

  @override
  Future<PageResult> search(RepositoryQuery query) async => PageResult.empty;

  @override
  Future<DataRecord?> findByKey(Object key) async =>
      {'orderNo': key, 'customer': '山田商事'};

  @override
  Future<DataRecord> create(DataRecord data) async => saved = data;

  @override
  Future<DataRecord> update(Object key, DataRecord data) async => saved = data;

  @override
  Future<void> delete(Object key) async {}
}

/// The child rows (受注明細), stored per parent key and served page by page.
class _LineRepo implements Repository {
  final List<DataRecord> rows;
  final List<RepositoryQuery> queries = [];
  int _nextNo;

  _LineRepo(this.rows) : _nextNo = rows.length + 1;

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    queries.add(query);
    final mine = rows
        .where((r) => r['orderNo'] == query.filters['orderNo'])
        .toList();
    final from = query.page * query.pageSize;
    final to = (from + query.pageSize).clamp(0, mine.length);
    return PageResult(
      items: from >= mine.length ? const [] : mine.sublist(from, to),
      totalCount: mine.length,
    );
  }

  @override
  Future<DataRecord?> findByKey(Object key) async =>
      rows.firstWhere((r) => r['lineNo'] == key);

  @override
  Future<DataRecord> create(DataRecord data) async {
    final row = {...data, 'lineNo': _nextNo++};
    rows.add(row);
    return row;
  }

  @override
  Future<DataRecord> update(Object key, DataRecord data) async {
    final index = rows.indexWhere((r) => r['lineNo'] == key);
    rows[index] = {...rows[index], ...data};
    return rows[index];
  }

  @override
  Future<void> delete(Object key) async {
    rows.removeWhere((r) => r['lineNo'] == key);
  }
}

const _definition = FormPageDefinition(
  id: 'order_entry',
  title: '受注入力',
  repository: 'orderRepo',
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
            // Rows come from their own repository, two per page.
            source: SubTableSource(
              repository: 'lineRepo',
              parentKey: 'orderNo',
              keyField: 'lineNo',
              pageSize: 2,
            ),
            columns: [
              ColumnDefinition(field: 'item', label: '品名'),
              ColumnDefinition(
                  field: 'qty', label: '数量', type: ColumnTypes.number),
            ],
            rowFields: [
              FieldDefinition(field: 'item', label: '品名', required: true),
              FieldDefinition(field: 'qty', label: '数量', type: FieldTypes.number),
            ],
          ),
        ],
      ),
    ],
  ),
);

Widget _harness(_OrderRepo orders, _LineRepo lines, {Object? recordKey}) {
  return MaterialApp(
    home: Scaffold(
      body: HatakeScope(
        repositories: RepositoryRegistry({
          'orderRepo': orders,
          'lineRepo': lines,
        }),
        renderer: const MaterialRenderer(),
        child: HatakeFormView(definition: _definition, recordKey: recordKey),
      ),
    ),
  );
}

_LineRepo _threeLines() => _LineRepo([
      {'lineNo': 1, 'orderNo': 'SO-1', 'item': '鉛筆', 'qty': 2},
      {'lineNo': 2, 'orderNo': 'SO-1', 'item': 'ノート', 'qty': 1},
      {'lineNo': 3, 'orderNo': 'SO-1', 'item': '消しゴム', 'qty': 5},
      {'lineNo': 4, 'orderNo': 'SO-9', 'item': '他受注の行', 'qty': 1},
    ]);

void main() {
  testWidgets('fetches child rows from their own repository, filtered by the '
      'parent key', (tester) async {
    final lines = _threeLines();
    await tester.pumpWidget(_harness(_OrderRepo(), lines, recordKey: 'SO-1'));
    await tester.pumpAndSettle();

    expect(lines.queries.single.filters, {'orderNo': 'SO-1'});
    expect(lines.queries.single.pageSize, 2);

    expect(find.text('鉛筆'), findsOneWidget);
    expect(find.text('ノート'), findsOneWidget);
    // Page 1 of 2 — the third row and another order's row are not shown.
    expect(find.text('消しゴム'), findsNothing);
    expect(find.text('他受注の行'), findsNothing);
    expect(find.text('全 3 件'), findsOneWidget);
    expect(find.text('1 / 2'), findsOneWidget);
  });

  testWidgets('pages through the child rows', (tester) async {
    await tester.pumpWidget(
        _harness(_OrderRepo(), _threeLines(), recordKey: 'SO-1'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.subtable.lines.next')));
    await tester.pumpAndSettle();

    expect(find.text('消しゴム'), findsOneWidget);
    expect(find.text('鉛筆'), findsNothing);
    expect(find.text('2 / 2'), findsOneWidget);
  });

  testWidgets('an unsaved parent cannot take rows yet', (tester) async {
    final lines = _threeLines();
    await tester.pumpWidget(_harness(_OrderRepo(), lines));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('hatake.subtable.lines.needsParent')),
        findsOneWidget);
    expect(find.byKey(const Key('hatake.subtable.lines.add')), findsNothing);
    // No parent key means no query at all.
    expect(lines.queries, isEmpty);
  });

  testWidgets('adding a row saves it immediately with the parent key',
      (tester) async {
    final lines = _threeLines();
    await tester.pumpWidget(_harness(_OrderRepo(), lines, recordKey: 'SO-1'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.subtable.lines.add')));
    await tester.pumpAndSettle();

    // Row rules still apply.
    await tester.tap(find.byKey(const Key('hatake.subtable.lines.row.save')));
    await tester.pumpAndSettle();
    expect(find.text('必須項目です'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('hatake.form.item')), 'クリップ');
    await tester.enterText(find.byKey(const Key('hatake.form.qty')), '10');
    await tester.tap(find.byKey(const Key('hatake.subtable.lines.row.save')));
    await tester.pumpAndSettle();

    final added = lines.rows.last;
    expect(added['item'], 'クリップ');
    expect(added['orderNo'], 'SO-1');
    expect(find.text('全 4 件'), findsOneWidget);
  });

  testWidgets('deleting a row goes straight to the child repository',
      (tester) async {
    final lines = _threeLines();
    await tester.pumpWidget(_harness(_OrderRepo(), lines, recordKey: 'SO-1'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.subtable.lines.delete.0')));
    await tester.pumpAndSettle();

    expect(lines.rows.any((r) => r['item'] == '鉛筆'), isFalse);
    expect(find.text('全 2 件'), findsOneWidget);
  });

  testWidgets('the parent save does not carry the child rows', (tester) async {
    final orders = _OrderRepo();
    await tester.pumpWidget(_harness(orders, _threeLines(), recordKey: 'SO-1'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.form.save')));
    await tester.pumpAndSettle();

    expect(orders.saved!.containsKey('lines'), isFalse);
    expect(orders.saved!['customer'], '山田商事');
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// Regressions for two bugs the deployed demo exposed:
///
/// 1. A `form` page never drew its page-level `actions`, so the demo's
///    「定義を見る」 button was missing on the entry screens.
/// 2. `FormController.recordKey` stayed null after a create, so a
///    repository-backed `subTable` never received the new parent key and its
///    rows could not be added. Saving twice also created a duplicate record.
class _Repo implements Repository {
  final List<DataRecord> rows = [];
  int creates = 0;
  int updates = 0;

  @override
  Future<PageResult> search(RepositoryQuery query) async => PageResult.empty;

  @override
  Future<DataRecord?> findByKey(Object key) async =>
      {'orderNo': key, 'customer': '山田商事'};

  @override
  Future<DataRecord> create(DataRecord data) async {
    creates++;
    rows.add({...data});
    return {...data};
  }

  @override
  Future<DataRecord> update(Object key, DataRecord data) async {
    updates++;
    return {...data, 'orderNo': key};
  }

  @override
  Future<void> delete(Object key) async {}
}

/// Child rows for the repository-backed grid.
class _LineRepo implements Repository {
  final List<DataRecord> rows = [];
  final List<RepositoryQuery> queries = [];

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    queries.add(query);
    final mine =
        rows.where((r) => r['orderNo'] == query.filters['orderNo']).toList();
    return PageResult(items: mine, totalCount: mine.length);
  }

  @override
  Future<DataRecord?> findByKey(Object key) async => null;

  @override
  Future<DataRecord> create(DataRecord data) async {
    final row = {...data, 'lineNo': rows.length + 1};
    rows.add(row);
    return row;
  }

  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;

  @override
  Future<void> delete(Object key) async {}
}

const _withAction = FormPageDefinition(
  id: 'order_entry',
  title: '受注入力',
  repository: 'repo',
  keyField: 'orderNo',
  form: FormDefinition(
    sections: [
      SectionDefinition(
        fields: [
          FieldDefinition(field: 'orderNo', label: '受注番号', required: true),
        ],
      ),
    ],
  ),
  actions: [
    ActionDefinition(
      id: 'showDef',
      type: ActionTypes.plugin,
      label: '定義を見る',
      plugin: 'showDefinition',
    ),
  ],
);

const _pagedLines = FormPageDefinition(
  id: 'order_entry_paged',
  title: '受注入力（明細別テーブル）',
  repository: 'repo',
  keyField: 'orderNo',
  form: FormDefinition(
    sections: [
      SectionDefinition(
        fields: [
          FieldDefinition(field: 'orderNo', label: '受注番号', required: true),
          FieldDefinition(
            field: 'lines',
            label: '明細',
            type: FieldTypes.subTable,
            source: SubTableSource(
              repository: 'lineRepo',
              parentKey: 'orderNo',
              keyField: 'lineNo',
            ),
            columns: [ColumnDefinition(field: 'item', label: '品名')],
            rowFields: [
              FieldDefinition(field: 'item', label: '品名', required: true),
            ],
          ),
        ],
      ),
    ],
  ),
);

Widget _harness(
  FormPageDefinition definition, {
  required Map<String, Repository> repositories,
  ActionRegistry? actions,
  Object? recordKey,
}) {
  return MaterialApp(
    home: Scaffold(
      body: HatakeScope(
        repositories: RepositoryRegistry(repositories),
        renderer: const MaterialRenderer(),
        actions: actions,
        child: HatakeFormView(definition: definition, recordKey: recordKey),
      ),
    ),
  );
}

void main() {
  testWidgets('a form page draws its page-level actions', (tester) async {
    var fired = 0;
    await tester.pumpWidget(_harness(
      _withAction,
      repositories: {'repo': _Repo()},
      actions: ActionRegistry({'showDefinition': (ctx) async => fired++}),
    ));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('hatake.action.showDef')), findsOneWidget);
    expect(find.text('定義を見る'), findsOneWidget);

    await tester.tap(find.byKey(const Key('hatake.action.showDef')));
    await tester.pumpAndSettle();
    expect(fired, 1);
  });

  testWidgets('an unregistered plugin action reports itself', (tester) async {
    await tester.pumpWidget(_harness(
      _withAction,
      repositories: {'repo': _Repo()},
      actions: ActionRegistry(const {}),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.action.showDef')));
    await tester.pumpAndSettle();
    expect(find.textContaining('ハンドラが未登録'), findsOneWidget);
  });

  testWidgets('saving a new record unlocks its repository-backed 明細',
      (tester) async {
    final orders = _Repo();
    final lines = _LineRepo();
    await tester.pumpWidget(_harness(
      _pagedLines,
      repositories: {'repo': orders, 'lineRepo': lines},
    ));
    await tester.pumpAndSettle();

    // Before saving there is no parent key, so rows cannot be added.
    expect(find.byKey(const Key('hatake.subtable.lines.needsParent')),
        findsOneWidget);
    expect(find.byKey(const Key('hatake.subtable.lines.add')), findsNothing);

    await tester.enterText(
        find.byKey(const Key('hatake.form.orderNo')), 'SO-900');
    await tester.tap(find.byKey(const Key('hatake.form.save')));
    await tester.pumpAndSettle();

    // The created record's key now drives the child grid.
    expect(orders.creates, 1);
    expect(find.byKey(const Key('hatake.subtable.lines.needsParent')),
        findsNothing);
    expect(find.byKey(const Key('hatake.subtable.lines.add')), findsOneWidget);
    expect(lines.queries.last.filters, {'orderNo': 'SO-900'});

    // And a row really lands under that parent.
    await tester.tap(find.byKey(const Key('hatake.subtable.lines.add')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('hatake.form.item')), '鉛筆');
    await tester.tap(find.byKey(const Key('hatake.subtable.lines.row.save')));
    await tester.pumpAndSettle();

    expect(lines.rows.single['item'], '鉛筆');
    expect(lines.rows.single['orderNo'], 'SO-900');
  });

  testWidgets('saving twice updates the record instead of duplicating it',
      (tester) async {
    final orders = _Repo();
    await tester.pumpWidget(_harness(
      _pagedLines,
      repositories: {'repo': orders, 'lineRepo': _LineRepo()},
    ));
    await tester.pumpAndSettle();

    await tester.enterText(
        find.byKey(const Key('hatake.form.orderNo')), 'SO-901');
    await tester.tap(find.byKey(const Key('hatake.form.save')));
    await tester.pumpAndSettle();
    // Let the 「保存しました」 snackbar expire; it sits over the save button.
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hatake.form.save')));
    await tester.pumpAndSettle();

    expect(orders.creates, 1);
    expect(orders.updates, 1);
  });
}

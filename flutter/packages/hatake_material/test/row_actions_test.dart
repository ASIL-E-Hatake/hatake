import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 行のボタンは**どの画面の種別でも同じ所に出る**、という試験。
///
/// `search` では出るのに `crud` では画面の上に出る、という食い違いがあった。同じ
/// 書き方（`table.rowActions: [detail]`）が画面の種別で違う所に出ると、書く側は
/// 覚えられないし、**押しても何も起きないボタン**が出たように見える。
class _Rows implements Repository {
  final List<DataRecord> _rows;

  _Rows(this._rows);

  @override
  Future<PageResult> search(RepositoryQuery query) async =>
      PageResult(items: _rows, totalCount: _rows.length);
  @override
  Future<DataRecord?> findByKey(Object key) async =>
      _rows.where((r) => r['id'] == key).firstOrNull;
  @override
  Future<DataRecord> create(DataRecord data) async => data;
  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;
  @override
  Future<void> delete(Object key) async {}
}

const _form = FormDefinition(
  sections: [
    SectionDefinition(
      fields: [FieldDefinition(field: 'code', label: 'コード')],
    ),
  ],
);

CrudPageDefinition _crud({
  required List<String> rowActions,
  required List<ActionDefinition> actions,
}) =>
    CrudPageDefinition(
      id: 'orders',
      title: '受注マスタ',
      repository: 'repo',
      keyField: 'id',
      table: TableDefinition(
        rowActions: rowActions,
        columns: const [
          ColumnDefinition(field: 'code', label: 'コード'),
          ColumnDefinition(field: 'status', label: '状態'),
        ],
      ),
      form: _form,
      actions: actions,
    );

Widget _harness(
  CrudPageDefinition definition,
  Repository repository, {
  ActionRegistry? actions,
}) =>
    MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'repo': repository}),
          renderer: const MaterialRenderer(),
          actions: actions,
          child: HatakeCrudView(definition: definition),
        ),
      ),
    );

List<DataRecord> _seed() => [
      {'id': 1, 'code': 'SO-1', 'status': '下書き'},
      {'id': 2, 'code': 'SO-2', 'status': '確定'},
    ];

void main() {
  const detail = ActionDefinition(
    id: 'detail',
    type: 'plugin',
    plugin: 'openDetail',
    label: '明細',
  );

  testWidgets('crud: 定義した行アクションが、行に出る（画面の上には出ない）',
      (tester) async {
    await tester.pumpWidget(_harness(
      _crud(rowActions: ['detail'], actions: const [detail]),
      _Rows(_seed()),
    ));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('hatake.rowaction.detail.1')), findsOneWidget);
    expect(find.byKey(const Key('hatake.rowaction.detail.2')), findsOneWidget);
    // 同じボタンを2か所に出さない（どちらを押すのが正しいか分からなくなる）。
    expect(find.byKey(const Key('hatake.action.detail')), findsNothing);
  });

  testWidgets('crud: 行のボタンを押すと、その行が渡る', (tester) async {
    final pressed = <Object?>[];
    final registry = ActionRegistry({
      'openDetail': (ctx) async => pressed.add(ctx.record?['code']),
    });

    await tester.pumpWidget(_harness(
      _crud(rowActions: ['detail'], actions: const [detail]),
      _Rows(_seed()),
      actions: registry,
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.rowaction.detail.2')));
    await tester.pumpAndSettle();

    expect(pressed, equals(['SO-2']));
  });

  testWidgets('crud: 行のボタンは、その行の状態で押せるかが決まる', (tester) async {
    await tester.pumpWidget(_harness(
      _crud(
        rowActions: ['detail'],
        actions: const [
          ActionDefinition(
            id: 'detail',
            type: 'plugin',
            plugin: 'openDetail',
            label: '明細',
            enabledWhen: {
              'field': 'status',
              'operator': 'equals',
              'value': '下書き',
            },
          ),
        ],
      ),
      _Rows(_seed()),
    ));
    await tester.pumpAndSettle();

    final draft = tester.widget<TextButton>(
      find.byKey(const Key('hatake.rowaction.detail.1')),
    );
    final fixed = tester.widget<TextButton>(
      find.byKey(const Key('hatake.rowaction.detail.2')),
    );
    expect(draft.onPressed, isNotNull);
    expect(fixed.onPressed, isNull);
    // 理由の無い灰色を出さない（何の状態で決まるのかを業務名で言う）。
    expect(
      find.ancestor(
        of: find.byKey(const Key('hatake.rowaction.detail.2')),
        matching: find.byWidgetPredicate(
          (w) => w is Tooltip && w.message!.contains('状態'),
        ),
      ),
      findsOneWidget,
    );
  });

  testWidgets('crud: 出る順は定義のまま（組み込みと混ざっても）', (tester) async {
    await tester.pumpWidget(_harness(
      _crud(rowActions: ['detail', 'edit'], actions: const [detail]),
      _Rows(_seed()),
    ));
    await tester.pumpAndSettle();

    final custom = tester.getTopLeft(
      find.byKey(const Key('hatake.rowaction.detail.1')),
    );
    final builtin = tester.getTopLeft(find.byKey(const Key('hatake.edit.1')));
    expect(custom.dx, lessThan(builtin.dx));
  });

  testWidgets('crud: 宣言の無い id は行に出ない（列そのものが出ない）',
      (tester) async {
    await tester.pumpWidget(_harness(
      _crud(rowActions: ['approve'], actions: const []),
      _Rows(_seed()),
    ));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('hatake.rowaction.approve.1')), findsNothing);
    // 列は「コード」「状態」の2つだけ（空の列を足さない）。
    expect(
      tester.widget<DataTable>(find.byType(DataTable)).columns.length,
      2,
    );
  });

  testWidgets('crud: 選んだ行に実行するボタンは行に出ず、上の一括ボタンになる',
      (tester) async {
    await tester.pumpWidget(_harness(
      _crud(
        rowActions: ['approve'],
        actions: const [
          ActionDefinition(
            id: 'approve',
            type: 'plugin',
            plugin: 'approveOrders',
            label: '一括承認',
            scope: 'selection',
          ),
        ],
      ),
      _Rows(_seed()),
    ));
    await tester.pumpAndSettle();

    // 行に出すと「押した行」ではなく「チェックした行」に実行することになる。
    expect(find.byKey(const Key('hatake.rowaction.approve.1')), findsNothing);
    // 消してしまうと、どこからも押せないボタンになる＝上に残す。
    expect(find.byKey(const Key('hatake.action.approve')), findsOneWidget);
  });

  testWidgets('一括ボタン: 行が在って未選択なら「行を選んでください」',
      (tester) async {
    await tester.pumpWidget(_harness(
      _crud(
        rowActions: const [],
        actions: const [
          ActionDefinition(
            id: 'approve',
            type: 'plugin',
            plugin: 'approveOrders',
            label: '一括承認',
            scope: 'selection',
          ),
        ],
      ),
      _Rows(_seed()),
    ));
    await tester.pumpAndSettle();

    expect(find.text('一括承認（行を選んでください）'), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('hatake.action.approve')))
          .onPressed,
      isNull,
    );
  });

  testWidgets('一括ボタン: 選べる行が1つも無ければ「行がありません」',
      (tester) async {
    await tester.pumpWidget(_harness(
      _crud(
        rowActions: const [],
        actions: const [
          ActionDefinition(
            id: 'approve',
            type: 'plugin',
            plugin: 'approveOrders',
            label: '一括承認',
            scope: 'selection',
          ),
        ],
      ),
      _Rows([]),
    ));
    await tester.pumpAndSettle();

    // 「まだ選んでいない」のと「選べる行が無い」のは、直し方が違う（絞り込みを変える）。
    expect(find.text('一括承認（行がありません）'), findsOneWidget);
    expect(find.byKey(const Key('hatake.empty')), findsOneWidget);
  });

  testWidgets('一括ボタン: 選んだら件数に戻る', (tester) async {
    await tester.pumpWidget(_harness(
      _crud(
        rowActions: const [],
        actions: const [
          ActionDefinition(
            id: 'approve',
            type: 'plugin',
            plugin: 'approveOrders',
            label: '一括承認',
            scope: 'selection',
          ),
        ],
      ),
      _Rows(_seed()),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(Checkbox).last);
    await tester.pumpAndSettle();

    expect(find.text('一括承認（1 件）'), findsOneWidget);
  });
}

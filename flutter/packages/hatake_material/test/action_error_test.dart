import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 失敗したときに何が起きるか（`onError`）と、一括の結果（`ActionOutcome`）。
///
/// ここで守るのは3つ。**押しても何も起きない、を作らない**（例外を外に投げると
/// Flutter のログにだけ出る）。**失敗の文言は定義側で言える**（生の例外は業務の
/// 言葉ではない）。**一部失敗で onSuccess は動かない**（1件失敗したまま画面を移すと、
/// 直すべき行が視界から消える）。
class _Orders implements Repository {
  final List<DataRecord> rows;

  _Orders(this.rows);

  @override
  Future<PageResult> search(RepositoryQuery query) async =>
      PageResult(items: rows, totalCount: rows.length);
  @override
  Future<DataRecord?> findByKey(Object key) async => null;
  @override
  Future<DataRecord> create(DataRecord data) async => data;
  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;
  @override
  Future<void> delete(Object key) async {}
}

final _rows = <DataRecord>[
  {'orderNo': 'SO-1', 'status': '未出荷'},
  {'orderNo': 'SO-2', 'status': '未出荷'},
  {'orderNo': 'SO-3', 'status': '出荷済'},
];

const _table = TableDefinition(
  columns: [
    ColumnDefinition(field: 'orderNo', label: '受注番号'),
    ColumnDefinition(field: 'status', label: '状態'),
  ],
);

/// 1件ぶんのボタン（scope なし）。
SearchPageDefinition _page({
  ActionErrorDefinition? onError,
  ActionSuccessDefinition? onSuccess,
  String scope = ActionScopes.page,
}) {
  return SearchPageDefinition(
    id: 'order_search',
    title: '受注照会',
    repository: 'orderRepository',
    keyField: 'orderNo',
    table: _table,
    actions: [
      ActionDefinition(
        id: 'approve',
        type: ActionTypes.plugin,
        plugin: 'approveOrders',
        label: '承認',
        scope: scope,
        onError: onError,
        onSuccess: onSuccess,
      ),
    ],
  );
}

Widget _harness(SearchPageDefinition definition, ActionHandler handler) {
  return MaterialApp(
    home: Scaffold(
      body: HatakeScope(
        repositories: RepositoryRegistry({'orderRepository': _Orders(_rows)}),
        renderer: const MaterialRenderer(),
        actions: ActionRegistry({'approveOrders': handler}),
        child: HatakePageView(definition: definition),
      ),
    ),
  );
}

Future<void> _press(WidgetTester tester, {int select = 0}) async {
  for (var i = 1; i <= select; i++) {
    await tester.tap(find.byType(Checkbox).at(i));
    await tester.pumpAndSettle();
  }
  await tester.tap(find.byKey(const Key('hatake.action.approve')));
  await tester.pumpAndSettle();
}

void main() {
  _deleteTests();

  testWidgets('ハンドラが投げたら、そう言う（黙って何も起きない、にしない）',
      (tester) async {
    await tester.pumpWidget(_harness(
      _page(onSuccess: const ActionSuccessDefinition(message: '承認しました')),
      (_) async => throw StateError('在庫がありません'),
    ));
    await tester.pumpAndSettle();
    await _press(tester);

    expect(find.textContaining('が失敗しました'), findsOneWidget);
    expect(find.textContaining('在庫がありません'), findsOneWidget);
    // 失敗したのだから onSuccess は動かない。
    expect(find.text('承認しました'), findsNothing);
  });

  testWidgets('onError.message が既定の文言を置き換える（{error} を埋める）',
      (tester) async {
    await tester.pumpWidget(_harness(
      _page(
        onError: const ActionErrorDefinition(
          message: '承認できませんでした。担当者に確認してください（{error}）',
        ),
      ),
      (_) async => throw StateError('締め済み'),
    ));
    await tester.pumpAndSettle();
    await _press(tester);

    expect(
      find.text('承認できませんでした。担当者に確認してください（Bad state: 締め済み）'),
      findsOneWidget,
    );
    expect(find.textContaining('が失敗しました'), findsNothing);
  });

  testWidgets('一部だけ失敗したら、件数で言う（onSuccess は動かさない）',
      (tester) async {
    await tester.pumpWidget(_harness(
      _page(
        scope: ActionScopes.selection,
        onSuccess: const ActionSuccessDefinition(message: '承認しました'),
      ),
      (ctx) async => ctx.report(const ActionOutcome(succeeded: 1, failed: 1)),
    ));
    await tester.pumpAndSettle();
    await _press(tester, select: 2);

    expect(find.text('1 件を実行しました（1 件失敗）'), findsOneWidget);
    // 1件でも失敗が残っているなら、画面はそのまま（移ると直す行が見えなくなる）。
    expect(find.text('承認しました'), findsNothing);
  });

  testWidgets('全部失敗したら、そう言う', (tester) async {
    await tester.pumpWidget(_harness(
      _page(scope: ActionScopes.selection),
      (ctx) async => ctx.report(ActionOutcome(failed: ctx.records.length)),
    ));
    await tester.pumpAndSettle();
    await _press(tester, select: 2);

    expect(find.text('2 件すべて失敗しました'), findsOneWidget);
  });

  testWidgets('onError.message で件数を言える（{count} / {failed}）',
      (tester) async {
    await tester.pumpWidget(_harness(
      _page(
        scope: ActionScopes.selection,
        onError: const ActionErrorDefinition(
          message: '{total} 件のうち {count} 件を承認、{failed} 件は締め済みでした',
        ),
      ),
      (ctx) async => ctx.report(const ActionOutcome(succeeded: 1, failed: 1)),
    ));
    await tester.pumpAndSettle();
    await _press(tester, select: 2);

    expect(find.text('2 件のうち 1 件を承認、1 件は締め済みでした'), findsOneWidget);
  });

  testWidgets('何も言わずに戻ったら成功。一括なら渡した行数が {count} に入る',
      (tester) async {
    await tester.pumpWidget(_harness(
      _page(
        scope: ActionScopes.selection,
        onSuccess: const ActionSuccessDefinition(message: '{count} 件を承認しました'),
      ),
      (_) async {},
    ));
    await tester.pumpAndSettle();
    await _press(tester, select: 2);

    expect(find.text('2 件を承認しました'), findsOneWidget);
  });

  testWidgets('一括でないボタンでは件数を埋めない（0 件と言うのは嘘になる）',
      (tester) async {
    await tester.pumpWidget(_harness(
      _page(
        onSuccess: const ActionSuccessDefinition(message: '{count} 件を承認しました'),
      ),
      (_) async {},
    ));
    await tester.pumpAndSettle();
    await _press(tester);

    // 埋めずにそのまま出す＝「その差し込みは効いていない」と目で分かる。
    // 同じことは `hatake validate` が実行する前に言う。
    expect(find.text('{count} 件を承認しました'), findsOneWidget);
  });

  testWidgets('報告が成功なら onSuccess は動く（失敗0件）', (tester) async {
    await tester.pumpWidget(_harness(
      _page(
        scope: ActionScopes.selection,
        onSuccess: const ActionSuccessDefinition(message: '{count} 件を承認しました'),
      ),
      (ctx) async => ctx.report(const ActionOutcome(succeeded: 2)),
    ));
    await tester.pumpAndSettle();
    await _press(tester, select: 2);

    expect(find.text('2 件を承認しました'), findsOneWidget);
  });
}

/// 消せなかったときも、定義の言葉で言える（行の delete は別の道を通る）。
class _RefusingOrders implements Repository {
  @override
  Future<PageResult> search(RepositoryQuery query) async =>
      PageResult(items: _rows, totalCount: _rows.length);
  @override
  Future<DataRecord?> findByKey(Object key) async => null;
  @override
  Future<DataRecord> create(DataRecord data) async => data;
  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;
  @override
  Future<void> delete(Object key) async => throw StateError('受注が残っています');
}

void _deleteTests() {
  testWidgets('行を消せなかったら、定義の文言で言う', (tester) async {
    const page = CrudPageDefinition(
      id: 'order_list',
      title: '受注一覧',
      repository: 'orderRepository',
      keyField: 'orderNo',
      table: TableDefinition(
        rowActions: ['delete'],
        columns: [ColumnDefinition(field: 'orderNo', label: '受注番号')],
      ),
      form: FormDefinition(
        sections: [
          SectionDefinition(
            fields: [FieldDefinition(field: 'orderNo', label: '受注番号')],
          ),
        ],
      ),
      actions: [
        ActionDefinition(
          id: 'delete',
          type: ActionTypes.delete,
          label: '削除',
          onError: ActionErrorDefinition(
            message: '受注が残っているので削除できません（{error}）',
          ),
        ),
      ],
    );
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'orderRepository': _RefusingOrders()}),
          renderer: const MaterialRenderer(),
          child: const HatakePageView(definition: page),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.delete.SO-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hatake.confirm.ok')));
    await tester.pumpAndSettle();

    expect(
      find.text('受注が残っているので削除できません（Bad state: 受注が残っています）'),
      findsOneWidget,
    );
  });
}

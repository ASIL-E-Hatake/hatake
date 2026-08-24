import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 選んだ行に対して実行する（`scope: selection`）。
///
/// ここで見るのは「選べること」ではなく、**選べる状態と押せる状態が食い違わない**
/// こと: チェックボックスは一括ボタンが在るときだけ出て、ボタンは選ぶまで押せず、
/// 実行したら選択は解ける。行が入れ替わったら選択は消える（画面に無い行に実行
/// できてしまうのが一番危ない）。
///
/// 確認の文の `{count}` も見る。**最後に読むのはボタンではなく確認の文**なので、
/// そこに数が出ないと「3件のつもりで30件」に気づけない（`hatake advise` が言う）。
class _Orders implements Repository {
  final List<DataRecord> rows;
  int searches = 0;

  _Orders(this.rows);

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    searches++;
    final status = query.filters['status'];
    final matched = status == null || '$status'.isEmpty
        ? rows
        : rows.where((r) => r['status'] == status).toList();
    final start = query.page * query.pageSize;
    return PageResult(
      items: matched.skip(start).take(query.pageSize).toList(),
      totalCount: matched.length,
    );
  }

  @override
  Future<DataRecord?> findByKey(Object key) async => null;
  @override
  Future<DataRecord> create(DataRecord data) async => data;
  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;
  @override
  Future<void> delete(Object key) async {}
}

List<DataRecord> _rows() => [
      {'orderNo': 'SO-1', 'status': '未出荷', 'amount': 100},
      {'orderNo': 'SO-2', 'status': '未出荷', 'amount': 200},
      {'orderNo': 'SO-3', 'status': '出荷済', 'amount': 300},
    ];

const _table = TableDefinition(
  pagination: PaginationDefinition(pageSize: 2),
  columns: [
    ColumnDefinition(field: 'orderNo', label: '受注番号'),
    ColumnDefinition(field: 'status', label: '状態'),
  ],
);

const _approve = ActionDefinition(
  id: 'approve',
  type: ActionTypes.plugin,
  plugin: 'approveOrders',
  label: '一括承認',
  scope: ActionScopes.selection,
);

/// 1回で動かせる件数に上限がある一括（業務の決めごと）。
const _approveUpTo1 = ActionDefinition(
  id: 'approve',
  type: ActionTypes.plugin,
  plugin: 'approveOrders',
  label: '一括承認',
  scope: ActionScopes.selection,
  maxRows: RowLimit.of(1),
);

/// 役割で上限が変わる一括（担当は1件・管理者は上限なし）。
const _approveByRole = ActionDefinition(
  id: 'approve',
  type: ActionTypes.plugin,
  plugin: 'approveOrders',
  label: '一括承認',
  scope: ActionScopes.selection,
  maxRows: RowLimit(rows: 1, byRole: {'admin': null}),
);

/// 確認を出す一括（文言に件数の差し込みを持つ）。
const _approveAsking = ActionDefinition(
  id: 'approve',
  type: ActionTypes.plugin,
  plugin: 'approveOrders',
  label: '一括承認',
  scope: ActionScopes.selection,
  confirm: ConfirmDefinition(message: '{count} 件を承認します。よろしいですか？'),
);

const _page = SearchPageDefinition(
  id: 'order_search',
  title: '受注照会',
  repository: 'orderRepository',
  keyField: 'orderNo',
  search: SearchDefinition(
    filters: [FilterDefinition(field: 'status', label: '状態')],
  ),
  table: _table,
  actions: [_approve],
);

Widget _harness(
  Repository repository, {
  ActionHandler? approve,
  SearchPageDefinition definition = _page,
  Set<String> roles = const {},
}) {
  return MaterialApp(
    home: Scaffold(
      body: HatakeScope(
        repositories: RepositoryRegistry({'orderRepository': repository}),
        renderer: const MaterialRenderer(),
        roles: roles,
        actions: ActionRegistry({
          'approveOrders': approve ?? (ctx) async {},
        }),
        child: HatakePageView(definition: definition),
      ),
    ),
  );
}

Finder _button() => find.byKey(const Key('hatake.action.approve'));
bool _enabled(WidgetTester tester) =>
    (tester.widget(_button()) as FilledButton).onPressed != null;

void main() {
  testWidgets('一括ボタンが在るときだけ、行が選べるようになる', (tester) async {
    await tester.pumpWidget(_harness(_Orders(_rows())));
    await tester.pumpAndSettle();
    // 2行 ＋ 全選択で3つ。
    expect(find.byType(Checkbox), findsNWidgets(3));

    // 一括ボタンの無い画面には出さない（選べても何もできない表を作らない）。
    await tester.pumpWidget(_harness(
      _Orders(_rows()),
      definition: const SearchPageDefinition(
        id: 'order_search',
        title: '受注照会',
        repository: 'orderRepository',
        keyField: 'orderNo',
        table: _table,
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.byType(Checkbox), findsNothing);
  });

  testWidgets('選ぶまで押せない。選ぶと件数が出る', (tester) async {
    await tester.pumpWidget(_harness(_Orders(_rows())));
    await tester.pumpAndSettle();

    expect(_enabled(tester), isFalse);
    expect(find.text('一括承認'), findsOneWidget);

    await tester.tap(find.byType(Checkbox).at(1)); // 1行目
    await tester.pumpAndSettle();
    expect(_enabled(tester), isTrue);
    expect(find.text('一括承認（1 件）'), findsOneWidget);

    await tester.tap(find.byType(Checkbox).at(2)); // 2行目
    await tester.pumpAndSettle();
    expect(find.text('一括承認（2 件）'), findsOneWidget);
  });

  testWidgets('ハンドラは選んだ行そのものを受け取る（キーだけではない）',
      (tester) async {
    List<DataRecord>? got;
    await tester.pumpWidget(_harness(
      _Orders(_rows()),
      approve: (ctx) async => got = ctx.records,
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(Checkbox).at(2)); // 2行目だけ
    await tester.pumpAndSettle();
    await tester.tap(_button());
    await tester.pumpAndSettle();

    expect(got, [
      {'orderNo': 'SO-2', 'status': '未出荷', 'amount': 200},
    ]);
  });

  testWidgets('実行できたら選択は解ける', (tester) async {
    await tester.pumpWidget(_harness(_Orders(_rows())));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(Checkbox).at(1));
    await tester.pumpAndSettle();
    await tester.tap(_button());
    await tester.pumpAndSettle();

    expect(_enabled(tester), isFalse);
    expect(find.text('一括承認'), findsOneWidget);
  });

  testWidgets('行が入れ替わったら選択は消える（画面に無い行に実行させない）',
      (tester) async {
    await tester.pumpWidget(_harness(_Orders(_rows())));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(Checkbox).at(1));
    await tester.pumpAndSettle();
    expect(_enabled(tester), isTrue);

    // 次のページへ（同じキーの行はもう画面に無い）。
    await tester.tap(find.byKey(const Key('hatake.next')));
    await tester.pumpAndSettle();
    expect(_enabled(tester), isFalse);
  });

  testWidgets('検索し直しても選択は消える', (tester) async {
    await tester.pumpWidget(_harness(_Orders(_rows())));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(Checkbox).at(1));
    await tester.pumpAndSettle();
    expect(_enabled(tester), isTrue);

    await tester.enterText(
      find.byKey(const Key('hatake.filter.status')),
      '出荷済',
    );
    await tester.tap(find.byKey(const Key('hatake.search')));
    await tester.pumpAndSettle();
    expect(_enabled(tester), isFalse);
  });

  testWidgets('その役割に見えない一括ボタンなら、チェックボックスも出ない',
      (tester) async {
    await tester.pumpWidget(_harness(
      _Orders(_rows()),
      definition: const SearchPageDefinition(
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
            label: '一括承認',
            scope: ActionScopes.selection,
            roles: ['manager'],
          ),
        ],
      ),
      roles: const {'staff'},
    ));
    await tester.pumpAndSettle();

    expect(_button(), findsNothing);
    expect(find.byType(Checkbox), findsNothing);
  });

  testWidgets('plugin 以外の型に scope: selection を書いたら、そう言う',
      (tester) async {
    await tester.pumpWidget(_harness(
      _Orders(_rows()),
      definition: const SearchPageDefinition(
        id: 'order_search',
        title: '受注照会',
        repository: 'orderRepository',
        keyField: 'orderNo',
        table: _table,
        actions: [
          ActionDefinition(
            id: 'approve',
            type: ActionTypes.export,
            label: '一括出力',
            scope: ActionScopes.selection,
          ),
        ],
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(Checkbox).at(1));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hatake.action.approve')));
    await tester.pumpAndSettle();

    expect(find.textContaining('選んだ行に対しては'), findsOneWidget);
  });

  testWidgets('確認の文の {count} は、押す前に選んだ件数で埋まる', (tester) async {
    var ran = 0;
    await tester.pumpWidget(_harness(
      _Orders(_rows()),
      approve: (ctx) async => ran = ctx.records.length,
      definition: const SearchPageDefinition(
        id: 'order_search',
        title: '受注照会',
        repository: 'orderRepository',
        keyField: 'orderNo',
        table: _table,
        actions: [_approveAsking],
      ),
    ));
    await tester.pumpAndSettle();

    // 2行を選ぶ（1ページ2件なので、これが全部）。
    await tester.tap(find.byType(Checkbox).at(1));
    await tester.tap(find.byType(Checkbox).at(2));
    await tester.pumpAndSettle();
    await tester.tap(_button());
    await tester.pumpAndSettle();

    // 走る前なのに数が出る（選んだ行の数は分かっている）。
    expect(find.text('2 件を承認します。よろしいですか？'), findsOneWidget);
    expect(ran, 0); // まだ実行していない

    await tester.tap(find.byKey(const Key('hatake.confirm.ok')));
    await tester.pumpAndSettle();
    expect(ran, 2);
  });

  testWidgets('選び直せば、確認の文の件数も変わる', (tester) async {
    await tester.pumpWidget(_harness(
      _Orders(_rows()),
      definition: const SearchPageDefinition(
        id: 'order_search',
        title: '受注照会',
        repository: 'orderRepository',
        keyField: 'orderNo',
        table: _table,
        actions: [_approveAsking],
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(Checkbox).at(1));
    await tester.pumpAndSettle();
    await tester.tap(_button());
    await tester.pumpAndSettle();
    expect(find.text('1 件を承認します。よろしいですか？'), findsOneWidget);

    // やめて、もう1行足してから押す。
    await tester.tap(find.byKey(const Key('hatake.confirm.cancel')));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Checkbox).at(2));
    await tester.pumpAndSettle();
    await tester.tap(_button());
    await tester.pumpAndSettle();
    expect(find.text('2 件を承認します。よろしいですか？'), findsOneWidget);
  });

  testWidgets('上限を超えて選んでいる間は押せない（何件までかもラベルに出す）', (tester) async {
    var ran = 0;
    await tester.pumpWidget(_harness(
      _Orders(_rows()),
      approve: (ctx) async => ran = ctx.records.length,
      definition: const SearchPageDefinition(
        id: 'order_search',
        title: '受注照会',
        repository: 'orderRepository',
        keyField: 'orderNo',
        table: _table,
        actions: [_approveUpTo1],
      ),
    ));
    await tester.pumpAndSettle();

    // 上限ちょうど（1件）なら押せる。
    await tester.tap(find.byType(Checkbox).at(1));
    await tester.pumpAndSettle();
    expect(_enabled(tester), isTrue);
    expect(find.text('一括承認（1 件）'), findsOneWidget);

    // 1件足すと上限を超える＝押せない。**切り詰めて実行はしない。**
    await tester.tap(find.byType(Checkbox).at(2));
    await tester.pumpAndSettle();
    expect(_enabled(tester), isFalse);
    expect(find.text('一括承認（2 件：1 件まで）'), findsOneWidget);

    // 選び直して上限内に戻せば、また押せる（行き止まりにしない）。
    await tester.tap(find.byType(Checkbox).at(2));
    await tester.pumpAndSettle();
    expect(_enabled(tester), isTrue);
    await tester.tap(_button());
    await tester.pumpAndSettle();
    expect(ran, 1);
  });

  // 上限は役割で変わる（）。同じ定義・同じ選び方で、役割だけを変えて見る。
  const byRolePage = SearchPageDefinition(
    id: 'order_search',
    title: '受注照会',
    repository: 'orderRepository',
    keyField: 'orderNo',
    table: _table,
    actions: [_approveByRole],
  );

  testWidgets('役割が無ければ既定の上限が効く（1件まで）', (tester) async {
    await tester.pumpWidget(_harness(_Orders(_rows()), definition: byRolePage));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Checkbox).at(1));
    await tester.tap(find.byType(Checkbox).at(2));
    await tester.pumpAndSettle();

    expect(_enabled(tester), isFalse);
    expect(find.text('一括承認（2 件：1 件まで）'), findsOneWidget);
  });

  testWidgets('その役割が上限なしなら、同じ件数でも押せる', (tester) async {
    await tester.pumpWidget(_harness(
      _Orders(_rows()),
      definition: byRolePage,
      roles: const {'admin'},
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Checkbox).at(1));
    await tester.tap(find.byType(Checkbox).at(2));
    await tester.pumpAndSettle();

    expect(_enabled(tester), isTrue);
    expect(find.text('一括承認（2 件）'), findsOneWidget);
  });
}

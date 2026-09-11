import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 繋がっていないボタン（`type: plugin` なのにハンドラが未登録）を、**押す前に**言う。
///
/// ここで守るのは2つ。**押すまで気づけない、を作らない**（押してから「未登録です」と
/// 言うのは最後の砦で、登録は実行時に引けるのだから押す前に言える）。**灰色にするだけで
/// 終わらせない**（理由を出す＝どのプラグインが無いのかまで言う。黙って隠すと、開発中の
/// 抜けが見えなくなる）。
class _Orders implements Repository {
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
  Future<void> delete(Object key) async {}
}

final _rows = <DataRecord>[
  {'orderNo': 'SO-1', 'status': '未出荷'},
  {'orderNo': 'SO-2', 'status': '未出荷'},
];

const _table = TableDefinition(
  columns: [
    ColumnDefinition(field: 'orderNo', label: '受注番号'),
    ColumnDefinition(field: 'status', label: '状態'),
  ],
);

/// `scope` を変えられる1枚（画面のボタン／選んだ行にまとめて）。
SearchPageDefinition _page({String scope = ActionScopes.page}) =>
    SearchPageDefinition(
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
        ),
      ],
    );

Widget _harness(SearchPageDefinition definition, {bool registered = true}) =>
    MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'orderRepository': _Orders()}),
          renderer: const MaterialRenderer(),
          actions: ActionRegistry(
            registered ? {'approveOrders': (_) async {}} : const {},
          ),
          child: HatakePageView(definition: definition),
        ),
      ),
    );

FilledButton _button(WidgetTester tester) =>
    tester.widget<FilledButton>(find.byKey(const Key('hatake.action.approve')));

void main() {
  testWidgets('登録が無ければ、押す前に押せなくして理由を出す', (tester) async {
    await tester.pumpWidget(_harness(_page(), registered: false));
    await tester.pumpAndSettle();

    // 押せない（押しても最後の砦が出るだけなので、押す前に止める）。
    expect(_button(tester).onPressed, isNull);
    // 理由はどのプラグインが無いのかまで言う（灰色だけにしない）。
    final tip = tester.widget<Tooltip>(find.ancestor(
      of: find.byKey(const Key('hatake.action.approve')),
      matching: find.byType(Tooltip),
    ));
    expect(tip.message, contains('まだ繋がっていません'));
    expect(tip.message, contains('approveOrders'));
  });

  testWidgets('登録があれば、今までどおり押せる', (tester) async {
    await tester.pumpWidget(_harness(_page()));
    await tester.pumpAndSettle();
    expect(_button(tester).onPressed, isNotNull);
    expect(
      find.ancestor(
        of: find.byKey(const Key('hatake.action.approve')),
        matching: find.byType(Tooltip),
      ),
      findsNothing,
    );
  });

  testWidgets('選んだ行にまとめて実行するボタンでも、押す前に言う', (tester) async {
    await tester.pumpWidget(_harness(
      _page(scope: ActionScopes.selection),
      registered: false,
    ));
    await tester.pumpAndSettle();
    // 行を選んでも押せない（繋がっていないのは選び方の話ではない）。
    await tester.tap(find.byType(Checkbox).at(1));
    await tester.pumpAndSettle();
    expect(_button(tester).onPressed, isNull);
    final tip = tester.widget<Tooltip>(find.ancestor(
      of: find.byKey(const Key('hatake.action.approve')),
      matching: find.byType(Tooltip),
    ));
    expect(tip.message, contains('approveOrders'));
  });

  testWidgets('プラグインでないボタンは、この話の対象にしない', (tester) async {
    const page = SearchPageDefinition(
      id: 'order_search',
      title: '受注照会',
      repository: 'orderRepository',
      keyField: 'orderNo',
      table: _table,
      actions: [
        ActionDefinition(id: 'csv', type: ActionTypes.export, label: 'CSV出力'),
      ],
    );
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'orderRepository': _Orders()}),
          renderer: const MaterialRenderer(),
          actions: ActionRegistry(const <String, ActionHandler>{}),
          child: const HatakePageView(definition: page),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('hatake.action.csv')))
          .onPressed,
      isNotNull,
    );
  });
}

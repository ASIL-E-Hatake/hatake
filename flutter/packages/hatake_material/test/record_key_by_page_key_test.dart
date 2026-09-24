import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 1件の画面は、**その画面に書いてある `key` の名前**で鍵を受け取る。
///
/// 前は `params['id']` だけを見ていたので、`key: itemCode` と書いて
/// `params: { itemCode: … }` で渡すと、URL は変わるのに**開いた画面が空**になった。
/// しかも取りに行きもしない（API を1本も投げない）ので、エラーも出なかった。
/// 見本の機能網羅アプリで実際に踏んで見つけた。
class _Repo implements Repository {
  /// 鍵として何を渡されたか（`id` ではなく `itemCode` の値が来るはず）。
  Object? askedFor;

  @override
  Future<PageResult> search(RepositoryQuery query) async => const PageResult(
        items: [
          {'itemCode': 'ITEM-001', 'itemName': '網羅の1件目'},
        ],
        totalCount: 1,
      );

  @override
  Future<DataRecord?> findByKey(Object key) async {
    askedFor = key;
    return {'itemCode': key, 'itemName': '網羅の1件目'};
  }

  @override
  Future<DataRecord> create(DataRecord data) async => data;

  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;

  @override
  Future<void> delete(Object key) async {}
}

AppDefinition _app({required String paramName}) => AppDefinition(
      id: 'sink',
      title: '機能網羅',
      home: 'items',
      menu: const [MenuItem(id: 'items', label: '一覧', page: 'items')],
      pages: [
        SearchPageDefinition(
          id: 'items',
          title: '一覧',
          repository: 'repo',
          keyFields: ['itemCode'],
          table: const TableDefinition(
            rowActions: ['open'],
            columns: [ColumnDefinition(field: 'itemCode', label: 'コード')],
          ),
          actions: [
            ActionDefinition(
              id: 'open',
              type: 'navigate',
              label: '詳細',
              config: {
                'page': 'item_detail',
                'params': {paramName: r'$row.itemCode'},
              },
            ),
          ],
        ),
        const DetailPageDefinition(
          id: 'item_detail',
          title: '詳細',
          repository: 'repo',
          keyFields: ['itemCode'],
          form: FormDefinition(
            sections: [
              SectionDefinition(
                fields: [FieldDefinition(field: 'itemName', label: '名前')],
              ),
            ],
          ),
        ),
      ],
    );

Widget _harness(_Repo repo, {required String paramName}) => MaterialApp(
      home: HatakeScope(
        repositories: RepositoryRegistry({'repo': repo}),
        renderer: const MaterialRenderer(),
        child: HatakeApp(app: _app(paramName: paramName)),
      ),
    );

void main() {
  testWidgets('画面の key の名前で渡した鍵で、ちゃんと1件を読みに行く', (tester) async {
    final repo = _Repo();
    await tester.pumpWidget(_harness(repo, paramName: 'itemCode'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.rowaction.open.ITEM-001')));
    await tester.pumpAndSettle();

    // **取りに行っている**（前はここが null のままで、一度も呼ばれなかった）。
    expect(repo.askedFor, 'ITEM-001');
    expect(find.byKey(const Key('hatake.detail.itemName')), findsOneWidget);
    expect(find.text('網羅の1件目'), findsWidgets);
    expect(find.byKey(const Key('hatake.empty')), findsNothing);
  });

  testWidgets('`id` で渡しても今までどおり読める（壊さない）', (tester) async {
    final repo = _Repo();
    await tester.pumpWidget(_harness(repo, paramName: 'id'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.rowaction.open.ITEM-001')));
    await tester.pumpAndSettle();

    expect(repo.askedFor, 'ITEM-001');
    expect(find.byKey(const Key('hatake.empty')), findsNothing);
  });

  testWidgets('どちらの名前でもないときは空のまま（助言がそれを言う）', (tester) async {
    final repo = _Repo();
    await tester.pumpWidget(_harness(repo, paramName: 'code'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.rowaction.open.ITEM-001')));
    await tester.pumpAndSettle();

    // 鍵が無いので読みに行かない。**黙って空になる**ので、
    // 定義の側で `navigate-without-key-param` が言う。
    expect(repo.askedFor, isNull);
    expect(find.byKey(const Key('hatake.empty')), findsOneWidget);
  });
}

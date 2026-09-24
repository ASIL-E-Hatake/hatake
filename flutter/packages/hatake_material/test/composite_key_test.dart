import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// **複合キーの1件が、一覧から詳細まで通しで開けること。**
///
/// 0.9.3 で「1件の画面は自分の `key` の名前で鍵を受け取る」を直したとき、
/// 画面が空になるのは**取りに行きもしない**から、と分かった。複合キーでも
/// 同じ道を通るので、同じ形で縛る。
class _Repo implements Repository {
  /// 鍵として何を渡されたか。
  Object? askedFor;

  @override
  Future<PageResult> search(RepositoryQuery query) async => const PageResult(
        items: [
          {'orderNo': 'SO-1', 'lineNo': 1, 'item': '鉛筆'},
          {'orderNo': 'SO-1', 'lineNo': 2, 'item': 'ノート'},
        ],
        totalCount: 2,
      );

  @override
  Future<DataRecord?> findByKey(Object key) async {
    askedFor = key;
    final parts = key is RecordKey ? key.parts : const <String, Object?>{};
    return {...parts, 'item': 'ノート'};
  }

  @override
  Future<DataRecord> create(DataRecord data) async => data;

  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;

  @override
  Future<void> delete(Object key) async {}
}

AppDefinition _app() => const AppDefinition(
      id: 'sales',
      title: '受注',
      home: 'lines',
      menu: [MenuItem(id: 'lines', label: '明細一覧', page: 'lines')],
      pages: [
        SearchPageDefinition(
          id: 'lines',
          title: '明細一覧',
          repository: 'repo',
          keyFields: ['orderNo', 'lineNo'],
          table: TableDefinition(
            rowActions: ['open'],
            columns: [
              ColumnDefinition(field: 'orderNo', label: '受注番号'),
              ColumnDefinition(field: 'lineNo', label: '行番号'),
            ],
          ),
          actions: [
            ActionDefinition(
              id: 'open',
              type: 'navigate',
              label: '詳細',
              config: {
                'page': 'line_detail',
                'params': {
                  'orderNo': r'$row.orderNo',
                  'lineNo': r'$row.lineNo',
                },
              },
            ),
          ],
        ),
        DetailPageDefinition(
          id: 'line_detail',
          title: '明細詳細',
          repository: 'repo',
          keyFields: ['orderNo', 'lineNo'],
          form: FormDefinition(
            sections: [
              SectionDefinition(
                fields: [FieldDefinition(field: 'item', label: '品名')],
              ),
            ],
          ),
        ),
      ],
    );

Widget _harness(_Repo repo) => MaterialApp(
      home: HatakeScope(
        repositories: RepositoryRegistry({'repo': repo}),
        renderer: const MaterialRenderer(),
        child: HatakeApp(app: _app()),
      ),
    );

void main() {
  testWidgets('一覧の行から、2つの値で1件を取りに行く', (tester) async {
    final repo = _Repo();
    await tester.pumpWidget(_harness(repo));
    await tester.pumpAndSettle();

    // 行のボタンのキーは鍵の字で作られる（複合なら両方が入る）。
    await tester.tap(find.byKey(const Key('hatake.rowaction.open.orderNo=SO-1, lineNo=2')));
    await tester.pumpAndSettle();

    // **取りに行っている**（0.9.3 の不具合はここが null のままだった）。
    expect(repo.askedFor, isA<RecordKey>());
    final key = repo.askedFor! as RecordKey;
    expect(key.fields, ['orderNo', 'lineNo']);
    // 値は**素の型のまま**渡る（数は数のまま）。文字にして渡すと、サーバ側で
    // 型が変わったことに気づけない。
    expect(key.values, ['SO-1', 2]);

    expect(find.byKey(const Key('hatake.empty')), findsNothing);
    expect(find.text('ノート'), findsWidgets);
  });

  testWidgets('定義に書いた並びが、そのまま鍵の並びになる', (tester) async {
    // 並べ替えると別の1件を指すので、行の中の並びではなく定義の並びで決まること。
    final repo = _Repo();
    await tester.pumpWidget(_harness(repo));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hatake.rowaction.open.orderNo=SO-1, lineNo=1')));
    await tester.pumpAndSettle();

    expect((repo.askedFor! as RecordKey).fields, ['orderNo', 'lineNo']);
  });
}

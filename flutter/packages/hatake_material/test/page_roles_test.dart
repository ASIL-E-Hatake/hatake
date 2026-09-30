import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 画面自身の `roles`（0.9.22）。メニューは行き先の画面の `roles` も見て隠し、画面は
/// 持たない人には中身を出さない（URL で直に来ても）。
class _Repo implements Repository {
  int searches = 0;

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    searches++;
    return const PageResult(
      items: [
        {'id': 1, 'code': 'C001'},
      ],
      totalCount: 1,
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

const _table = TableDefinition(
  columns: [ColumnDefinition(field: 'code', label: 'コード')],
);

const _prices = SearchPageDefinition(
  id: 'prices',
  title: '単価マスタ',
  repository: 'repo',
  roles: ['admin'],
  table: _table,
);

const _app = AppDefinition(
  id: 'shop',
  title: 'ショップ',
  home: 'customers',
  menu: [
    MenuItem(id: 'customers', label: '顧客', page: 'customers'),
    MenuItem(id: 'orders', label: '受注', page: 'orders'),
    // 項目には roles が無い。行き先の画面が admin だけ。
    MenuItem(id: 'prices', label: '単価', page: 'prices'),
  ],
  pages: [
    SearchPageDefinition(
        id: 'customers', title: '顧客一覧', repository: 'repo', table: _table),
    SearchPageDefinition(
        id: 'orders', title: '受注一覧', repository: 'repo', table: _table),
    _prices,
  ],
);

Widget _app0(Set<String> roles) => MaterialApp(
      home: HatakeScope(
        repositories: RepositoryRegistry({'repo': _Repo()}),
        renderer: const MaterialRenderer(),
        roles: roles,
        child: const HatakeApp(app: _app),
      ),
    );

void main() {
  testWidgets('メニューは行き先の画面の roles も見る', (tester) async {
    tester.view.physicalSize = const Size(1200, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_app0(const {'viewer'}));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('hatake.menu.customers')), findsOneWidget);
    expect(find.byKey(const Key('hatake.menu.prices')), findsNothing);

    await tester.pumpWidget(_app0(const {'admin'}));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('hatake.menu.prices')), findsOneWidget);
  });

  testWidgets('持たない人には中身を出さず、読み込みも始めない', (tester) async {
    final repo = _Repo();
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'repo': repo}),
          renderer: const MaterialRenderer(),
          roles: const {'viewer'},
          child: const HatakePageView(definition: _prices),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key(HatakeKeys.pageForbidden)), findsOneWidget);
    expect(find.text('単価マスタ'), findsNothing);
    expect(repo.searches, 0);
  });

  testWidgets('持っている人には普通に出る', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'repo': _Repo()}),
          renderer: const MaterialRenderer(),
          roles: const {'admin'},
          child: const HatakePageView(definition: _prices),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key(HatakeKeys.pageForbidden)), findsNothing);
    expect(find.text('C001'), findsOneWidget);
  });
}

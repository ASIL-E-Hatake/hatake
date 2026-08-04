import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

class _Repo implements Repository {
  @override
  Future<PageResult> search(RepositoryQuery query) async => const PageResult(
        items: [
          {'id': 1, 'code': 'C001'},
        ],
        totalCount: 1,
      );

  @override
  Future<DataRecord?> findByKey(Object key) async => {'id': key, 'code': 'C001'};

  @override
  Future<DataRecord> create(DataRecord data) async => data;

  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;

  @override
  Future<void> delete(Object key) async {}
}

const _app = AppDefinition(
  id: 'shop',
  title: 'ショップ',
  home: 'customers',
  menu: [
    MenuItem(id: 'customers', label: '顧客', icon: 'people', page: 'customers'),
    // Group heading with one leaf inside.
    MenuItem(
      label: 'マスタ',
      children: [
        MenuItem(id: 'products', label: '商品', icon: 'inventory', page: 'products'),
      ],
    ),
  ],
  pages: [
    SearchPageDefinition(
      id: 'customers',
      title: '顧客一覧',
      repository: 'repo',
      table: TableDefinition(
        rowActions: ['open'],
        columns: [ColumnDefinition(field: 'code', label: 'コード')],
      ),
      actions: [
        ActionDefinition(
          id: 'open',
          type: 'navigate',
          label: '詳細',
          config: {
            'page': 'customer_detail',
            'params': {'id': r'$row.id'},
          },
        ),
      ],
    ),
    DetailPageDefinition(
      id: 'customer_detail',
      title: '顧客詳細',
      repository: 'repo',
      form: FormDefinition(
        sections: [
          SectionDefinition(fields: [FieldDefinition(field: 'code', label: 'コード')]),
        ],
      ),
    ),
    CrudPageDefinition(
      id: 'products',
      title: '商品マスタ',
      repository: 'repo',
      table: TableDefinition(columns: [ColumnDefinition(field: 'code', label: 'コード')]),
      form: FormDefinition(),
    ),
  ],
);

Widget _harness() {
  return MaterialApp(
    home: HatakeScope(
      repositories: RepositoryRegistry({'repo': _Repo()}),
      renderer: const MaterialRenderer(),
      child: const HatakeApp(app: _app),
    ),
  );
}

void main() {
  testWidgets('menu selection switches the current page', (tester) async {
    await tester.pumpWidget(_harness());
    await tester.pumpAndSettle();

    // Home route = customers (search page).
    expect(find.text('顧客一覧'), findsOneWidget);
    expect(find.text('商品マスタ'), findsNothing);

    // Tap the "商品" menu entry → products page.
    await tester.tap(find.byKey(const Key('hatake.menu.products')));
    await tester.pumpAndSettle();

    expect(find.text('商品マスタ'), findsOneWidget);
    expect(find.text('顧客一覧'), findsNothing);
  });

  testWidgets('group headings from the definition are rendered', (tester) async {
    await tester.pumpWidget(_harness());
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('hatake.menu.group.マスタ')), findsOneWidget);
    // Its child leaf is shown under the heading.
    expect(find.byKey(const Key('hatake.menu.products')), findsOneWidget);
  });

  testWidgets('narrow layout collapses the menu into a Drawer', (tester) async {
    tester.view.physicalSize = const Size(500, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_harness());
    await tester.pumpAndSettle();

    // Sidebar is gone; the menu lives behind the drawer handle.
    expect(find.byKey(const Key('hatake.menu.products')), findsNothing);

    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('hatake.menu.products')), findsOneWidget);

    // Selecting closes the drawer and navigates.
    await tester.tap(find.byKey(const Key('hatake.menu.products')));
    await tester.pumpAndSettle();
    expect(find.text('商品マスタ'), findsOneWidget);
    expect(find.byKey(const Key('hatake.menu.products')), findsNothing);
  });

  testWidgets('navigate action opens the detail route with resolved params',
      (tester) async {
    await tester.pumpWidget(_harness());
    await tester.pumpAndSettle();

    // Row navigate action on the customers list → detail of record id 1.
    await tester.tap(find.byKey(const Key('hatake.rowaction.open.1')));
    await tester.pumpAndSettle();

    // Twice: the breadcrumb's current crumb and the page's own heading.
    expect(find.text('顧客詳細'), findsWidgets);
    expect(find.byKey(const Key('hatake.detail.code')), findsOneWidget);
    expect(find.text('C001'), findsWidgets); // detail shows the loaded record

    // Back returns to the list.
    await tester.tap(find.byKey(const Key('hatake.app.back')));
    await tester.pumpAndSettle();
    expect(find.text('顧客一覧'), findsOneWidget);
  });

  testWidgets('breadcrumb shows the trail and jumps back to an ancestor',
      (tester) async {
    await tester.pumpWidget(_harness());
    await tester.pumpAndSettle();

    // No trail at the root.
    expect(find.byKey(const Key('hatake.breadcrumb.customers')), findsNothing);

    await tester.tap(find.byKey(const Key('hatake.rowaction.open.1')));
    await tester.pumpAndSettle();

    // Ancestor is a tappable crumb; tapping it returns to the list.
    final crumb = find.byKey(const Key('hatake.breadcrumb.customers'));
    expect(crumb, findsOneWidget);
    await tester.tap(crumb);
    await tester.pumpAndSettle();

    expect(find.text('顧客一覧'), findsOneWidget);
    expect(find.text('顧客詳細'), findsNothing);
  });
}

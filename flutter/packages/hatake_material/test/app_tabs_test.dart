import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 画面を**並べて開く**（`app.navigation: tabs`）。
///
/// 業務システムによって作法が違うので、どちらかに決め打ちしない。定義が既定を言い、
/// アプリ側（`HatakeApp(navigation:)`）が上書きする。
///
/// ここで守るのは5つ。**既定は遷移**（書かなければいままでの動き）・**タブの中身は
/// 残る**（行き来しても検索条件が消えない＝それがタブの値打ち）・**同じ画面は2枚
/// 開かない**・**入力する画面を閉じるときは聞く**・**アプリの上書きが定義より強い**。
class _Repo implements Repository {
  @override
  Future<PageResult> search(RepositoryQuery query) async => PageResult(
        items: [
          {'id': 1, 'code': 'C001', 'note': '${query.filters['code'] ?? ''}'},
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

/// 顧客一覧（行から詳細へ2通りの遷移）＋商品マスタ（入力できる画面）。
AppDefinition _app({String navigation = AppNavigation.single}) => AppDefinition(
      id: 'shop',
      title: 'ショップ',
      home: 'customers',
      navigation: navigation,
      menu: const [
        MenuItem(id: 'customers', label: '顧客', page: 'customers'),
        MenuItem(id: 'products', label: '商品', page: 'products'),
      ],
      pages: const [
        SearchPageDefinition(
          id: 'customers',
          title: '顧客一覧',
          repository: 'repo',
          search: SearchDefinition(
            filters: [FilterDefinition(field: 'code', label: 'コード')],
          ),
          table: TableDefinition(
            rowActions: ['open', 'openTab'],
            columns: [ColumnDefinition(field: 'code', label: 'コード')],
          ),
          actions: [
            // 既定（same）＝同じタブの中で進む。
            ActionDefinition(
              id: 'open',
              type: 'navigate',
              label: '詳細',
              config: {
                'page': 'customer_detail',
                'params': {'id': r'$row.id'},
              },
            ),
            // `open: tab` ＝一覧を残したまま別のタブで開く。
            ActionDefinition(
              id: 'openTab',
              type: 'navigate',
              label: '別タブ',
              open: ActionOpen.tab,
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
              SectionDefinition(
                fields: [FieldDefinition(field: 'code', label: 'コード')],
              ),
            ],
          ),
        ),
        CrudPageDefinition(
          id: 'products',
          title: '商品マスタ',
          repository: 'repo',
          table: TableDefinition(
            columns: [ColumnDefinition(field: 'code', label: 'コード')],
          ),
          form: FormDefinition(),
        ),
      ],
    );

Widget _harness(AppDefinition app, {String? navigation}) => MaterialApp(
      home: HatakeScope(
        repositories: RepositoryRegistry({'repo': _Repo()}),
        renderer: const MaterialRenderer(),
        child: HatakeApp(app: app, syncUrl: false, navigation: navigation),
      ),
    );

/// メニューから選ぶ（幅の広い画面なので、左の一覧をそのまま押せる）。
Future<void> _pickMenu(WidgetTester tester, String label) async {
  await tester.tap(find.text(label).last);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('既定は遷移（タブの列は出ない・メニューで入れ替わる）', (tester) async {
    await tester.pumpWidget(_harness(_app()));
    await tester.pumpAndSettle();

    expect(find.byType(InputChip), findsNothing);
    await _pickMenu(tester, '商品');
    expect(find.text('商品マスタ'), findsWidgets);
    expect(find.text('顧客一覧'), findsNothing); // 入れ替わった
  });

  testWidgets('tabs ならメニューで選ぶと並ぶ（中身は残る）', (tester) async {
    await tester.pumpWidget(_harness(_app(navigation: AppNavigation.tabs)));
    await tester.pumpAndSettle();

    // 1枚目に検索条件を入れる（タブを行き来しても消えないこと）。
    await tester.enterText(
      find.byKey(const Key('hatake.filter.code')),
      'C001',
    );
    await tester.pumpAndSettle();

    await _pickMenu(tester, '商品');
    expect(find.byType(InputChip), findsNWidgets(2));

    // 1枚目に戻ると、入れた条件がそのまま在る（画面を作り直していない）。
    await tester.tap(find.byType(InputChip).first);
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<TextField>(find.byKey(const Key('hatake.filter.code')))
          .controller
          ?.text,
      'C001',
    );
  });

  testWidgets('同じ画面をもう一度選んでも増えない（前に出るだけ）', (tester) async {
    await tester.pumpWidget(_harness(_app(navigation: AppNavigation.tabs)));
    await tester.pumpAndSettle();
    await _pickMenu(tester, '商品');
    expect(find.byType(InputChip), findsNWidgets(2));

    await _pickMenu(tester, '顧客');
    await _pickMenu(tester, '商品');
    expect(find.byType(InputChip), findsNWidgets(2));
  });

  testWidgets('open: tab の遷移は別のタブ、既定は同じタブの中で進む', (tester) async {
    await tester.pumpWidget(_harness(_app(navigation: AppNavigation.tabs)));
    await tester.pumpAndSettle();

    // 既定（same）＝タブは増えず、戻る口が出る。
    await tester.tap(find.byKey(const Key('hatake.rowaction.open.1')));
    await tester.pumpAndSettle();
    expect(find.byType(InputChip), findsNWidgets(1));
    expect(find.byKey(const Key('hatake.app.back')), findsOneWidget);

    await tester.tap(find.byKey(const Key('hatake.app.back')));
    await tester.pumpAndSettle();

    // `open: tab` ＝一覧を残したまま2枚目が開く。
    await tester.tap(find.byKey(const Key('hatake.rowaction.openTab.1')));
    await tester.pumpAndSettle();
    expect(find.byType(InputChip), findsNWidgets(2));
    expect(find.text('顧客詳細'), findsWidgets);
  });

  testWidgets('入力する画面を閉じるときは聞く（照会は聞かない）', (tester) async {
    await tester.pumpWidget(_harness(_app(navigation: AppNavigation.tabs)));
    await tester.pumpAndSettle();
    await _pickMenu(tester, '商品'); // CRUD＝入力できる画面

    // 閉じる口を押すと確認が出る。やめれば閉じない。
    await tester.tap(find.byKey(const Key('hatake.app.tab.1.close')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('hatake.app.tab.confirmClose')), findsOneWidget);
    await tester.tap(find.text('やめる'));
    await tester.pumpAndSettle();
    expect(find.byType(InputChip), findsNWidgets(2));

    // もう一度押して、閉じる。
    await tester.tap(find.byKey(const Key('hatake.app.tab.1.close')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hatake.app.tab.confirmClose.ok')));
    await tester.pumpAndSettle();
    expect(find.byType(InputChip), findsNWidgets(1));
  });

  testWidgets('最後の1枚には閉じる口を出さない（画面が無くなる）', (tester) async {
    await tester.pumpWidget(_harness(_app(navigation: AppNavigation.tabs)));
    await tester.pumpAndSettle();

    expect(find.byType(InputChip), findsNWidgets(1));
    expect(find.byKey(const Key('hatake.app.tab.0.close')), findsNothing);
  });

  testWidgets('アプリの上書きが定義より強い（タブと書いてあっても遷移で使える）',
      (tester) async {
    await tester.pumpWidget(_harness(
      _app(navigation: AppNavigation.tabs),
      navigation: AppNavigation.single,
    ));
    await tester.pumpAndSettle();
    expect(find.byType(InputChip), findsNothing);
  });

  testWidgets('逆向きも効く（定義は既定のまま、アプリがタブにする）', (tester) async {
    await tester.pumpWidget(_harness(_app(), navigation: AppNavigation.tabs));
    await tester.pumpAndSettle();
    expect(find.byType(InputChip), findsNWidgets(1));
  });
}

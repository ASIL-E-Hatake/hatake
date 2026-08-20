import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake/hatake.dart';

/// The address bar and the current screen, kept in step.
///
/// A browser is not available in a widget test, so the URL sits behind [RouteUrl]
/// and this fake stands in for it — recording what the app wrote and handing back
/// what the app was "opened with".
class _FakeUrl implements RouteUrl {
  @override
  final Uri? initial;

  /// Every write, in order, with whether it replaced the current entry.
  final List<(Uri, bool)> written = [];

  _FakeUrl({this.initial});

  @override
  void write(Uri uri, {bool replace = false}) => written.add((uri, replace));

  Uri get last => written.last.$1;
}

/// Draws the current route's page id as text, so a test can read where it is.
class _TextRenderer implements Renderer {
  @override
  Widget buildApp(
    BuildContext context,
    AppDefinition definition,
    HatakeRouter router,
  ) {
    return ListenableBuilder(
      listenable: router,
      builder: (_, __) => Text(
        '${router.current.pageId}'
        '${router.current.params.isEmpty ? '' : ' ${router.current.params}'}'
        ' depth=${router.depth}',
        textDirection: TextDirection.ltr,
      ),
    );
  }

  @override
  Widget buildCrudPage(BuildContext c, CrudLike d, CrudController n) =>
      const SizedBox.shrink();
  @override
  Widget buildSearchPage(
          BuildContext c, SearchPageDefinition d, ListController n) =>
      const SizedBox.shrink();
  @override
  Widget buildDetailPage(
          BuildContext c, DetailPageDefinition d, DetailController n) =>
      const SizedBox.shrink();
  @override
  Widget buildFormPage(BuildContext c, FormPageDefinition d, FormController n) =>
      const SizedBox.shrink();
  @override
  Widget buildWizardPage(
          BuildContext c, WizardPageDefinition d, WizardController n) =>
      const SizedBox.shrink();
  @override
  Widget buildDashboardPage(
          BuildContext c, DashboardPageDefinition d, DashboardController n) =>
      const SizedBox.shrink();
  @override
  Widget buildReportPage(
          BuildContext c, ReportPageDefinition d, ReportController n) =>
      const SizedBox.shrink();
}

const _app = AppDefinition(
  id: 'sales',
  title: '販売管理',
  home: 'dashboard',
  menu: [
    MenuItem(id: 'dashboard', label: 'ダッシュボード', page: 'dashboard'),
    MenuItem(id: 'orders', label: '受注', page: 'order_search'),
  ],
  pages: [
    DashboardPageDefinition(id: 'dashboard', title: 'ダッシュボード'),
    SearchPageDefinition(
      id: 'order_search',
      title: '受注照会',
      repository: 'orderRepository',
      keyField: 'orderNo',
      table: TableDefinition(
        columns: [ColumnDefinition(field: 'orderNo', label: '受注番号')],
      ),
    ),
  ],
);

Widget _host(RouteUrl url, {bool syncUrl = true}) {
  return HatakeScope(
    repositories: const RepositoryRegistry({}),
    renderer: _TextRenderer(),
    child: HatakeApp(app: _app, syncUrl: syncUrl, url: url),
  );
}

/// Simulates the browser moving (back / forward / a pasted URL).
///
/// This is the message the engine itself sends on `flutter/navigation`, and the
/// reply carries whether anything took the route — the same answer the browser
/// gets, which is what decides if the address bar stays put.
Future<bool> _browserGoes(WidgetTester tester, String path) async {
  const codec = JSONMethodCodec();
  var handled = false;
  await tester.binding.defaultBinaryMessenger.handlePlatformMessage(
    'flutter/navigation',
    codec.encodeMethodCall(
      MethodCall('pushRouteInformation', <String, Object?>{'location': path}),
    ),
    (data) {
      if (data != null) handled = codec.decodeEnvelope(data) as bool;
    },
  );
  return handled;
}

void main() {
  testWidgets('開いた URL の画面から始まる（リンクを踏める）', (tester) async {
    final url = _FakeUrl(initial: Uri.parse('/order_search?status=未出荷'));
    await tester.pumpWidget(_host(url));
    await tester.pump();

    expect(find.textContaining('order_search'), findsOneWidget);
    expect(find.textContaining('{status: 未出荷}'), findsOneWidget);
  });

  testWidgets('URL が無ければ home。最初の画面の URL は書き足さず置き換える',
      (tester) async {
    final url = _FakeUrl();
    await tester.pumpWidget(_host(url));
    await tester.pump();

    expect(find.textContaining('dashboard'), findsOneWidget);
    // `/` のままにすると、戻るでここへ戻ってまた飛ばされる。
    expect(url.written.single, (Uri.parse('/dashboard'), true));
  });

  testWidgets('別のビルドの画面 id で開かれても、空白にはならない（home へ）',
      (tester) async {
    final url = _FakeUrl(initial: Uri.parse('/gone_away'));
    await tester.pumpWidget(_host(url));
    await tester.pump();
    expect(find.textContaining('dashboard'), findsOneWidget);
  });

  testWidgets('画面が変わると URL が追う（履歴に積む）', (tester) async {
    final url = _FakeUrl();
    await tester.pumpWidget(_host(url));
    await tester.pump();

    final router = HatakeRouterScope.maybeOf(
      tester.element(find.textContaining('dashboard')),
    )!;
    router.push('order_search', params: const {'orderNo': 'SO-1001'});
    await tester.pump();

    expect(url.last, Uri.parse('/order_search?orderNo=SO-1001'));
    expect(url.written.last.$2, isFalse); // 置き換えではなく1件積む
  });

  testWidgets('ブラウザの戻るで画面が動く（そのとき履歴は積み直さない）',
      (tester) async {
    final url = _FakeUrl();
    await tester.pumpWidget(_host(url));
    await tester.pump();

    final before = url.written.length;
    expect(await _browserGoes(tester, '/order_search'), isTrue);
    await tester.pump();

    expect(find.textContaining('order_search'), findsOneWidget);
    // 戻ってきた先を、また新しい履歴として書かない（戻るが効かなくなる）。
    expect(url.written.length, before);
    // 履歴はブラウザが持っているので、こちら側の積み重ねは1段のまま。
    expect(find.textContaining('depth=1'), findsOneWidget);
  });

  testWidgets('この app に無い画面 id は引き受けない（URL は動かさない）',
      (tester) async {
    final url = _FakeUrl();
    await tester.pumpWidget(_host(url));
    await tester.pump();

    expect(await _browserGoes(tester, '/someone_elses_page'), isFalse);
    await tester.pump();
    expect(find.textContaining('dashboard'), findsOneWidget);
  });

  testWidgets('syncUrl: false なら address bar には触らない（外側が持つアプリ）',
      (tester) async {
    final url = _FakeUrl(initial: Uri.parse('/order_search'));
    await tester.pumpWidget(_host(url, syncUrl: false));
    await tester.pump();

    // 開いた URL も見ない＝ルーティングは外側の責任。
    expect(find.textContaining('dashboard'), findsOneWidget);
    expect(url.written, isEmpty);
    expect(await _browserGoes(tester, '/order_search'), isFalse);
  });
}

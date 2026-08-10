import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 「会社の色にしたい」を定義だけで済ませられること。ここが `app.theme` の全て。
/// YAML から読めることは hatake_yaml のテストが見るので、ここは定義から先を見る。
const _page = SearchPageDefinition(
  id: 'customer_master',
  title: '顧客マスタ',
  repository: 'customerRepository',
  table: TableDefinition(
    columns: [ColumnDefinition(field: 'code', label: 'コード')],
  ),
);

AppDefinition _app({ThemeDefinition? theme}) => AppDefinition(
      id: 'sales_admin',
      title: '販売管理',
      theme: theme,
      menu: const [
        MenuItem(id: 'customers', label: '顧客', page: 'customer_master'),
      ],
      pages: const [_page],
    );

class _Empty implements Repository {
  @override
  Future<PageResult> search(RepositoryQuery query) async =>
      const PageResult(items: [], totalCount: 0);
  @override
  Future<DataRecord?> findByKey(Object key) async => null;
  @override
  Future<DataRecord> create(DataRecord data) async => data;
  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;
  @override
  Future<void> delete(Object key) async {}
}

Widget _host(AppDefinition app) => MaterialApp(
      home: HatakeScope(
        repositories: RepositoryRegistry({'customerRepository': _Empty()}),
        renderer: const MaterialRenderer(),
        child: HatakeApp(app: app),
      ),
    );

void main() {
  group('materialThemeOf', () {
    test('brand colour seeds the scheme and密度が行の高さに出る', () {
      const definition = ThemeDefinition(
        primaryColor: '#1B5E20',
        density: Densities.compact,
        radius: 12,
      );
      final theme = materialThemeOf(definition);

      expect(theme.colorScheme.primary, isNot(const ColorScheme.light().primary));
      expect(theme.colorScheme.brightness, Brightness.light);
      expect(theme.visualDensity, VisualDensity.compact);
      expect(theme.dataTableTheme.dataRowMinHeight, 40);
      expect(theme.inputDecorationTheme.isDense, isTrue);
      expect(
        (theme.cardTheme.shape as RoundedRectangleBorder).borderRadius,
        BorderRadius.circular(12),
      );
    });

    test('宣言した accent が seed 由来より優先される', () {
      final theme = materialThemeOf(const ThemeDefinition(
        primaryColor: '#1B5E20',
        secondaryColor: '#FF6F00',
      ));
      expect(theme.colorScheme.secondary, const Color(0xFFFF6F00));
    });

    test('brightness: system は端末の設定に従う', () {
      const definition = ThemeDefinition(brightness: Brightnesses.system);
      expect(
        materialThemeOf(definition, platformBrightness: Brightness.dark)
            .colorScheme
            .brightness,
        Brightness.dark,
      );
      expect(
        materialThemeOf(definition, platformBrightness: Brightness.light)
            .colorScheme
            .brightness,
        Brightness.light,
      );
    });

    test('既定は「何も変えない」に近い（宣言していない所は触らない）', () {
      final theme = materialThemeOf(const ThemeDefinition());
      expect(theme.visualDensity, VisualDensity.standard);
      expect(theme.cardTheme.shape, isNull);
      expect(theme.inputDecorationTheme.isDense, isFalse);
    });

    test('自分の ThemeData から始められる（from）', () {
      final base = ThemeData(useMaterial3: true, brightness: Brightness.dark);
      final theme = materialThemeOf(
        const ThemeDefinition(density: Densities.comfortable),
        from: base,
      );
      expect(theme.brightness, Brightness.dark);
      expect(theme.dataTableTheme.dataRowMinHeight, 56);
    });
  });

  group('app.theme', () {
    testWidgets('定義を書くだけで画面に効く（Dart は1行も要らない）', (tester) async {
      final app = _app(
        theme: const ThemeDefinition(
          primaryColor: '#1B5E20',
          density: Densities.compact,
          radius: 12,
        ),
      );

      await tester.pumpWidget(_host(app));
      await tester.pumpAndSettle();

      // シェルの中で使われているテーマが、定義から作ったものと一致する。
      final inner = Theme.of(tester.element(find.byType(Scaffold).first));
      expect(inner.visualDensity, VisualDensity.compact);
      expect(inner.colorScheme.primary,
          materialThemeOf(app.theme!).colorScheme.primary);
      // ページの中身も同じテーマを見る（Theme はシェルの外側に置いてある）。
      final page = Theme.of(tester.element(find.byType(HatakePageView)));
      expect(page.visualDensity, VisualDensity.compact);
    });

    testWidgets('theme を書かなければ何も変えない', (tester) async {
      final app = _app();
      expect(app.theme, isNull);

      await tester.pumpWidget(_host(app));
      await tester.pumpAndSettle();

      final inner = Theme.of(tester.element(find.byType(Scaffold).first));
      expect(inner.visualDensity, ThemeData().visualDensity);
    });
  });
}

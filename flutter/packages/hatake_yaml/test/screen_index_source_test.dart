import 'dart:io';

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

/// Building the index from definition text — the case for tooling and for an app
/// that ships its definitions as assets.
void main() {
  const page = '''
page:
  type: master
  id: dept_master
  title: 部門マスタ
  repository: deptRepository
  table:
    columns:
      - { field: code, label: コード, sortable: true }
  form:
    sections:
      - fields:
          - { field: code, label: コード, required: true }
''';

  group('buildScreenIndex', () {
    test('one entry per screen, app documents included', () {
      final app = File('../../../spec/examples/sales_app.yaml').readAsStringSync();
      final index = buildScreenIndex([
        IndexInput('sales_app.yaml', app),
        const IndexInput('dept_master.yaml', page),
      ]);
      expect(index.unreadable, isEmpty);
      // 8 screens in the app plus the standalone one.
      expect(index.screens.length, 9);
      expect(
        index.screens.where((one) => one.file == 'sales_app.yaml').length,
        8,
      );
    });

    // The strongest check that the three editions agree: the same pile of
    // definitions must come out the same number of screens. The TypeScript CLI
    // asserts 「画面 22 枚」 over this folder in CI, and Java asserts it too.
    // (12 files; sales_app has 8 pages and roles_app has 4, so 10 + 12 = 22.)
    test('the shipped examples come out as 22 screens, same as every edition', () {
      final dir = Directory('../../../spec/examples');
      final inputs = <IndexInput>[
        for (final file in dir.listSync().whereType<File>())
          if (const ['.yaml', '.yml', '.json'].any(file.path.endsWith))
            IndexInput(file.uri.pathSegments.last, file.readAsStringSync()),
      ];
      final index = buildScreenIndex(inputs);
      expect(index.unreadable, isEmpty);
      expect(index.screens.length, 22);
      // index.json（例のカタログ）は定義ではないので飛ばされる。
      expect(index.ignored, greaterThan(0));
    });

    test('finds a screen the way the shop floor would ask for it', () {
      final app = File('../../../spec/examples/sales_app.yaml').readAsStringSync();
      final index = buildScreenIndex([IndexInput('sales_app.yaml', app)]);
      expect(index.search('顧客 検索').map((one) => one.id), contains('customer_master'));
      expect(index.search('受注 帳票').map((one) => one.id), ['sales_report']);
    });

    test('skips files that are not definitions', () {
      final index = buildScreenIndex([
        const IndexInput('readme.md', '# これは定義ではない'),
        const IndexInput('dept_master.yaml', page),
      ]);
      expect(index.ignored, 1);
      expect(index.screens.length, 1);
    });

    // A typo'd definition is still a screen that exists. Dropping it from the
    // index makes it harder to find, so it goes in — read loosely.
    test('a definition with an unknown key still gets indexed', () {
      final typo = page.replaceFirst('sortable: true', 'sortble: true');
      final index = buildScreenIndex([IndexInput('dept_master.yaml', typo)]);
      expect(index.screens.length, 1);
      expect(index.unreadable, isEmpty);
    });

    // What is not allowed is quiet loss.
    test('a broken definition is reported, not dropped in silence', () {
      final index = buildScreenIndex([
        const IndexInput('broken.yaml', 'page:\n  id: x\n'),
        const IndexInput('dept_master.yaml', page),
      ]);
      expect(index.screens.length, 1);
      expect(index.unreadable.length, 1);
      expect(index.unreadable.first.file, 'broken.yaml');
      expect(index.unreadable.first.reason, isNotEmpty);
    });

    test('JSON definitions read the same way', () {
      const json = '''
{ "page": { "type": "detail", "id": "order_detail", "title": "受注詳細",
  "repository": "orderRepository", "key": "orderNo",
  "form": { "sections": [ { "fields": [ { "field": "orderNo", "label": "受注番号" } ] } ] } } }
''';
      final index = buildScreenIndex([const IndexInput('order_detail.json', json)]);
      expect(index.screens.single.id, 'order_detail');
      expect(index.screens.single.what, '1件の照会');
    });

    test('the rendered table names the file each screen came from', () {
      final index = buildScreenIndex([const IndexInput('dept_master.yaml', page)]);
      expect(renderScreenIndex(index.screens), contains('dept_master.yaml'));
      expect(
        renderScreenIndex(index.screens, showFile: false),
        isNot(contains('dept_master.yaml')),
      );
    });
  });
}

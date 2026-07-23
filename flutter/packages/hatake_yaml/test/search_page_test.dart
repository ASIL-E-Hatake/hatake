import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

const _yaml = '''
dsl_version: "1.0"
page:
  type: search
  id: product_search
  title: 商品照会
  repository: productRepository
  key: id
  search:
    filters:
      - { field: name, label: 商品名, type: text, operator: contains }
  table:
    rowActions: [detail]
    columns:
      - { field: code, label: コード, sortable: true }
      - { field: name, label: 商品名 }
  actions:
    - { id: detail, type: plugin, plugin: showDetail, label: 詳細 }
''';

void main() {
  test('parses a search page into SearchPageDefinition', () {
    final page = parsePageYaml(_yaml);
    expect(page, isA<SearchPageDefinition>());
    final search = page as SearchPageDefinition;
    expect(search.id, 'product_search');
    expect(search.repository, 'productRepository');
    expect(search.search!.filters.single.field, 'name');
    expect(search.table.columns.map((c) => c.field), ['code', 'name']);
    expect(search.table.rowActions, ['detail']);
    expect(search.actions.single.plugin, 'showDetail');
  });

  test('search and crud share the same PageDefinition base', () {
    expect(parsePageYaml(_yaml), isA<PageDefinition>());
  });
}

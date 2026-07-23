import 'package:hatake_dsl/hatake_dsl.dart';
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

SearchPageDefinition buildViaDsl() {
  return searchPage(
    id: 'product_search',
    title: '商品照会',
    repository: 'productRepository',
    search: search([
      filter('name', label: '商品名', operator: FilterOperators.contains),
    ]),
    table: table(
      rowActions: ['detail'],
      [
        column('code', label: 'コード', sortable: true),
        column('name', label: '商品名'),
      ],
    ),
    actions: [
      action('detail',
          type: ActionTypes.plugin, plugin: 'showDetail', label: '詳細'),
    ],
  );
}

void main() {
  test('searchPage builder converges with YAML parse', () {
    expect(buildViaDsl(), equals(parsePageYaml(_yaml)));
  });

  test('searchPage applies sensible defaults', () {
    final page = searchPage(id: 'p', title: 't', repository: 'r');
    expect(page.keyField, 'id');
    expect(page.search, isNull);
    expect(page.table.columns, isEmpty);
    expect(page.actions, isEmpty);
    expect(page.dslVersion, kDslVersion);
  });
}

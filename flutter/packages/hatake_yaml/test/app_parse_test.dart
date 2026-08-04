import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

const _yaml = '''
dsl_version: "1.0"
app:
  id: sales
  title: 販売管理
  home: customers
  menu:
    - { id: customers, label: 顧客, icon: people, page: customer_master }
    - group: マスタ
      roles: [admin]
      items:
        - { label: 商品, page: product_master }
  pages:
    - type: crud
      id: customer_master
      title: 顧客マスタ
      repository: customerRepo
      table:
        columns:
          - { field: code, label: コード }
      actions:
        - { id: detail, type: navigate, label: 詳細, page: customer_detail, params: { id: "\$row.id" } }
    - type: detail
      id: customer_detail
      title: 顧客詳細
      repository: customerRepo
      form:
        sections:
          - fields:
              - { field: code, label: コード }
''';

const _json = '''
{
  "dsl_version": "1.0",
  "app": {
    "id": "sales",
    "title": "販売管理",
    "home": "customers",
    "menu": [
      { "id": "customers", "label": "顧客", "icon": "people", "page": "customer_master" },
      { "group": "マスタ", "roles": ["admin"], "items": [
        { "label": "商品", "page": "product_master" }
      ] }
    ],
    "pages": [
      { "type": "crud", "id": "customer_master", "title": "顧客マスタ", "repository": "customerRepo",
        "table": { "columns": [ { "field": "code", "label": "コード" } ] },
        "actions": [
          { "id": "detail", "type": "navigate", "label": "詳細", "page": "customer_detail", "params": { "id": "\$row.id" } }
        ] },
      { "type": "detail", "id": "customer_detail", "title": "顧客詳細", "repository": "customerRepo",
        "form": { "sections": [ { "fields": [ { "field": "code", "label": "コード" } ] } ] } }
    ]
  }
}
''';

void main() {
  test('parses an app document (menu tree + pages)', () {
    final app = parseAppYaml(_yaml);

    expect(app.id, 'sales');
    expect(app.title, '販売管理');
    expect(app.home, 'customers');
    expect(app.dslVersion, '1.0');

    // Menu: a leaf and a role-gated group.
    expect(app.menu.length, 2);
    final leaf = app.menu[0];
    expect(leaf.isGroup, isFalse);
    expect(leaf.page, 'customer_master');
    expect(leaf.icon, 'people');
    final group = app.menu[1];
    expect(group.isGroup, isTrue);
    expect(group.label, 'マスタ');
    expect(group.roles, ['admin']);
    expect(group.children.single.page, 'product_master');
    expect(group.children.single.id, 'product_master'); // defaults to page id

    // Pages resolvable by id, with the right concrete types.
    expect(app.pageById('customer_master'), isA<CrudPageDefinition>());
    expect(app.pageById('customer_detail'), isA<DetailPageDefinition>());
    expect(app.pageById('nope'), isNull);
  });

  test('navigate action carries page/params in config', () {
    final app = parseAppYaml(_yaml);
    final crud = app.pageById('customer_master') as CrudPageDefinition;
    final action = crud.actions.single;
    expect(action.type, ActionTypes.navigate);
    expect(action.config['page'], 'customer_detail');
    expect(action.config['params'], {'id': r'$row.id'});
  });

  test('YAML and JSON converge on an identical AppDefinition', () {
    expect(parseAppYaml(_yaml), parseAppJson(_json));
  });
}

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

const _yaml = '''
dsl_version: "1.0"
page:
  type: crud
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  key: id
  search:
    layout: { columns: 2 }
    filters:
      - { field: name,   label: 顧客名,     type: text,   operator: contains }
      - field: status
        label: ステータス
        type: select
        operator: equals
        options:
          - { value: active,   label: 有効 }
          - { value: inactive, label: 無効 }
  table:
    pagination: { pageSize: 50 }
    rowActions: [edit, delete]
    columns:
      - { field: code,   label: コード,     width: 120, sortable: true }
      - { field: name,   label: 顧客名,     sortable: true }
      - { field: status, label: ステータス, type: badge }
  form:
    sections:
      - title: 基本情報
        layout: { columns: 2 }
        fields:
          - field: code
            label: コード
            required: true
            validators:
              - { type: maxLength, value: 20 }
          - { field: name, label: 顧客名, required: true }
  actions:
    - { id: create, type: create, label: 新規登録 }
    - { id: export, type: plugin, plugin: csvExport, label: CSV出力 }
''';

const _json = '''
{
  "dsl_version": "1.0",
  "page": {
    "type": "crud",
    "id": "customer_master",
    "title": "顧客マスタ",
    "repository": "customerRepository",
    "key": "id",
    "search": {
      "layout": { "columns": 2 },
      "filters": [
        { "field": "name", "label": "顧客名", "type": "text", "operator": "contains" },
        { "field": "status", "label": "ステータス", "type": "select", "operator": "equals",
          "options": [
            { "value": "active", "label": "有効" },
            { "value": "inactive", "label": "無効" }
          ] }
      ]
    },
    "table": {
      "pagination": { "pageSize": 50 },
      "rowActions": ["edit", "delete"],
      "columns": [
        { "field": "code", "label": "コード", "width": 120, "sortable": true },
        { "field": "name", "label": "顧客名", "sortable": true },
        { "field": "status", "label": "ステータス", "type": "badge" }
      ]
    },
    "form": {
      "sections": [
        { "title": "基本情報", "layout": { "columns": 2 },
          "fields": [
            { "field": "code", "label": "コード", "required": true,
              "validators": [ { "type": "maxLength", "value": 20 } ] },
            { "field": "name", "label": "顧客名", "required": true }
          ] }
      ]
    },
    "actions": [
      { "id": "create", "type": "create", "label": "新規登録" },
      { "id": "export", "type": "plugin", "plugin": "csvExport", "label": "CSV出力" }
    ]
  }
}
''';

const _expected = CrudPageDefinition(
  id: 'customer_master',
  title: '顧客マスタ',
  repository: 'customerRepository',
  keyField: 'id',
  search: SearchDefinition(
    layout: LayoutDefinition(columns: 2),
    filters: [
      FilterDefinition(
        field: 'name',
        label: '顧客名',
        operator: FilterOperators.contains,
      ),
      FilterDefinition(
        field: 'status',
        label: 'ステータス',
        type: FieldTypes.select,
        operator: FilterOperators.equals,
        options: [
          OptionItem(value: 'active', label: '有効'),
          OptionItem(value: 'inactive', label: '無効'),
        ],
      ),
    ],
  ),
  table: TableDefinition(
    pagination: PaginationDefinition(pageSize: 50),
    rowActions: ['edit', 'delete'],
    columns: [
      ColumnDefinition(field: 'code', label: 'コード', width: 120, sortable: true),
      ColumnDefinition(field: 'name', label: '顧客名', sortable: true),
      ColumnDefinition(field: 'status', label: 'ステータス', type: ColumnTypes.badge),
    ],
  ),
  form: FormDefinition(
    sections: [
      SectionDefinition(
        title: '基本情報',
        layout: LayoutDefinition(columns: 2),
        fields: [
          FieldDefinition(
            field: 'code',
            label: 'コード',
            required: true,
            validators: [
              ValidatorDefinition(
                type: ValidatorTypes.maxLength,
                params: {'value': 20},
              ),
            ],
          ),
          FieldDefinition(field: 'name', label: '顧客名', required: true),
        ],
      ),
    ],
  ),
  actions: [
    ActionDefinition(id: 'create', type: ActionTypes.create, label: '新規登録'),
    ActionDefinition(
      id: 'export',
      type: ActionTypes.plugin,
      plugin: 'csvExport',
      label: 'CSV出力',
    ),
  ],
);

void main() {
  group('parsePageYaml', () {
    test('produces the expected CrudPageDefinition', () {
      expect(parsePageYaml(_yaml), equals(_expected));
    });
  });

  group('convergence', () {
    test('YAML and JSON yield an identical PageDefinition', () {
      expect(parsePageJson(_json), equals(parsePageYaml(_yaml)));
    });
  });

  group('errors', () {
    test('missing required field throws with a path', () {
      const bad = '''
page:
  type: crud
  title: x
  repository: r
''';
      expect(
        () => parsePageYaml(bad),
        throwsA(
          isA<DefinitionParseException>()
              .having((e) => e.path, 'path', 'page.id'),
        ),
      );
    });

    test('unsupported page type throws', () {
      const bad = '''
page:
  type: wizard
  id: p
  title: t
  repository: r
''';
      expect(
        () => parsePageYaml(bad),
        throwsA(isA<DefinitionParseException>()),
      );
    });

    test('invalid YAML throws DefinitionParseException', () {
      expect(
        () => parsePageYaml('  : : : not valid : :'),
        throwsA(isA<DefinitionParseException>()),
      );
    });
  });

  group('decodeDefinition*', () {
    // 素の document を取り出す口。findUnknownKeys はこの Map を取るので、これが
    // 無いと「未知キーを自分で報告するツール」を外から書けない（プレイグラウンド）。
    const yaml = '''
page:
  type: crud
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  table:
    columns:
      - { field: code, label: コード, sortble: true }
''';

    test('書かれたとおりの Map を返す（既定値で埋めない）', () {
      final document = decodeDefinitionYaml(yaml);
      final page = document['page'] as Map<String, Object?>;
      expect(page['id'], 'customer_master');
      // 綴り間違いも「書かれたまま」残っている。
      final columns = (page['table'] as Map<String, Object?>)['columns'] as List;
      expect((columns.first as Map)['sortble'], isTrue);
      expect((columns.first as Map).containsKey('sortable'), isFalse);
    });

    test('その Map をそのまま findUnknownKeys に渡せる', () {
      final unknown = findUnknownKeys(decodeDefinitionYaml(yaml));
      expect(unknown.single.key, 'sortble');
      expect(unknown.single.suggestion, 'sortable');
      expect(unknown.single.path, 'page.table.columns[0]');
    });

    test('YAML と JSON は同じ Map になる', () {
      expect(
        decodeDefinitionJson(
          '{"page":{"type":"crud","id":"x","title":"X","repository":"r"}}',
        ),
        decodeDefinitionYaml('page: { type: crud, id: x, title: X, repository: r }'),
      );
    });

    test('scope を読む（既定は page、選んだ行に対しては selection）', () {
      final page = parsePageYaml('''
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    columns: [{ field: orderNo, label: 受注番号 }]
  actions:
    - { id: csv, type: export, label: CSV出力 }
    - id: approve
      type: plugin
      plugin: approveOrders
      label: 一括承認
      scope: selection
''', strict: true) as SearchPageDefinition;
      expect(page.actions[0].scope, ActionScopes.page);
      expect(page.actions[1].scope, ActionScopes.selection);
    });

    test('読めないものは理由つきで落ちる', () {
      // 閉じていない引用符は YAML として壊れている。
      expect(() => decodeDefinitionYaml('page: "unterminated'),
          throwsA(isA<DefinitionParseException>()));
      // 読めても「一番外が map でない」なら定義ではない。
      expect(() => decodeDefinitionJson('[1, 2]'),
          throwsA(isA<DefinitionParseException>()));
      expect(() => decodeDefinitionYaml('- a\n- b'),
          throwsA(isA<DefinitionParseException>()));
    });
  });
}

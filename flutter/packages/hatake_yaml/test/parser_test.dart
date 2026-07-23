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
}

import 'package:hatake_dsl/hatake_dsl.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

/// The same 顧客マスタ definition expressed in YAML, so we can prove the Dart
/// builder converges on the exact same PageDefinition.
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

CrudPageDefinition buildViaDsl() {
  return crudPage(
    id: 'customer_master',
    title: '顧客マスタ',
    repository: 'customerRepository',
    search: search(
      columns: 2,
      [
        filter('name', label: '顧客名', operator: FilterOperators.contains),
        filter(
          'status',
          label: 'ステータス',
          type: FieldTypes.select,
          operator: FilterOperators.equals,
          options: [
            option('active', '有効'),
            option('inactive', '無効'),
          ],
        ),
      ],
    ),
    table: table(
      pageSize: 50,
      rowActions: ['edit', 'delete'],
      [
        column('code', label: 'コード', width: 120, sortable: true),
        column('name', label: '顧客名', sortable: true),
        column('status', label: 'ステータス', type: ColumnTypes.badge),
      ],
    ),
    form: form([
      section(
        '基本情報',
        columns: 2,
        [
          field(
            'code',
            label: 'コード',
            required: true,
            validators: [maxLength(20)],
          ),
          field('name', label: '顧客名', required: true),
        ],
      ),
    ]),
    actions: [
      action('create', type: ActionTypes.create, label: '新規登録'),
      action(
        'export',
        type: ActionTypes.plugin,
        plugin: 'csvExport',
        label: 'CSV出力',
      ),
    ],
  );
}

void main() {
  test('DSL builder converges with YAML parse (identical PageDefinition)', () {
    expect(buildViaDsl(), equals(parsePageYaml(_yaml)));
  });

  test('crudPage applies sensible defaults', () {
    final page = crudPage(id: 'p', title: 't', repository: 'r');
    expect(page.keyField, 'id');
    expect(page.search, isNull);
    expect(page.table.columns, isEmpty);
    expect(page.form.sections, isEmpty);
    expect(page.dslVersion, kDslVersion);
  });

  test('maxLength validator matches the YAML form', () {
    expect(
      maxLength(20),
      equals(const ValidatorDefinition(
        type: ValidatorTypes.maxLength,
        params: {'value': 20},
      )),
    );
  });

  test('compareWith writes a cross-field rule (項目間の検証)', () {
    // 「開始日 ≤ 終了日」は1つの項目では書けない。ビルダーからも同じ形で書ける。
    final rule = compareWith('startDate');
    expect(rule.type, ValidatorTypes.compare);
    expect(rule.params, {'operator': 'gte', 'field': 'startDate'});

    final total = compareWith(
      'lines',
      operator: 'equals',
      aggregate: 'sum',
      of: 'amount',
    );
    expect(total.params, {
      'operator': 'equals',
      'field': 'lines',
      'aggregate': 'sum',
      'of': 'amount',
    });
  });
}

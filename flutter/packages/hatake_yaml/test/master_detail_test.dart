import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

void main() {
  test('parses a master page (CrudLike)', () {
    const yaml = '''
page:
  type: master
  id: dept_master
  title: 部門マスタ
  repository: deptRepository
  table:
    columns:
      - { field: code, label: コード }
  form:
    sections:
      - fields:
          - { field: code, label: コード, required: true }
''';
    final page = parsePageYaml(yaml);
    expect(page, isA<MasterPageDefinition>());
    expect(page, isA<CrudLike>());
    final master = page as MasterPageDefinition;
    expect(master.repository, 'deptRepository');
    expect(master.table.columns.single.field, 'code');
    expect(master.form.fields.single.field, 'code');
  });

  test('parses a detail page', () {
    const yaml = '''
page:
  type: detail
  id: customer_detail
  title: 顧客詳細
  repository: customerRepository
  key: id
  form:
    sections:
      - title: 基本情報
        fields:
          - { field: code, label: コード }
          - { field: amount, label: 売上, format: currency, config: { symbol: "¥" } }
''';
    final page = parsePageYaml(yaml);
    expect(page, isA<DetailPageDefinition>());
    final detail = page as DetailPageDefinition;
    expect(detail.repository, 'customerRepository');
    expect(detail.form.fields.map((f) => f.field), ['code', 'amount']);
    expect(detail.form.fields[1].format, 'currency');
  });
}

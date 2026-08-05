import 'dart:io';

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

const _yaml = '''
page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true }
          - field: lines
            label: 明細
            type: subTable
            columns:
              - { field: item, label: 品名, width: 220 }
              - { field: amount, label: 金額, type: number, format: currency }
            fields:
              - { field: item, label: 品名, required: true }
              - { field: qty, label: 数量, type: number,
                  validators: [ { type: min, value: 1 } ] }
              - { field: amount, label: 金額,
                  computed: { op: product, fields: [qty, price] } }
''';

const _json = '''
{
  "page": {
    "type": "form", "id": "order_entry", "title": "受注入力",
    "repository": "orderRepository", "key": "orderNo",
    "form": { "sections": [ { "fields": [
      { "field": "orderNo", "label": "受注番号", "required": true },
      { "field": "lines", "label": "明細", "type": "subTable",
        "columns": [
          { "field": "item", "label": "品名", "width": 220 },
          { "field": "amount", "label": "金額", "type": "number", "format": "currency" }
        ],
        "fields": [
          { "field": "item", "label": "品名", "required": true },
          { "field": "qty", "label": "数量", "type": "number",
            "validators": [ { "type": "min", "value": 1 } ] },
          { "field": "amount", "label": "金額",
            "computed": { "op": "product", "fields": ["qty", "price"] } }
        ] }
    ] } ] }
  }
}
''';

FieldDefinition _linesOf(PageDefinition page) =>
    (page as FormPageDefinition)
        .form
        .fields
        .firstWhere((f) => f.field == 'lines');

void main() {
  test('parses a subTable field (grid columns + row editor fields)', () {
    final lines = _linesOf(parsePageYaml(_yaml));

    expect(lines.type, FieldTypes.subTable);

    // Grid columns reuse the column shape (format / width included).
    expect(lines.columns.map((c) => c.field), ['item', 'amount']);
    expect(lines.columns.first.width, 220);
    expect(lines.columns.last.format, 'currency');

    // Row editor fields reuse the field shape, recursively parsed.
    expect(lines.rowFields.map((f) => f.field), ['item', 'qty', 'amount']);
    expect(lines.rowFields[0].required, isTrue);
    expect(lines.rowFields[1].validators.single.type, ValidatorTypes.min);
    expect(lines.rowFields[2].computed, {
      'op': 'product',
      'fields': ['qty', 'price'],
    });
  });

  test('plain fields keep empty subTable slots', () {
    final page = parsePageYaml(_yaml) as FormPageDefinition;
    final header = page.form.fields.firstWhere((f) => f.field == 'orderNo');
    expect(header.columns, isEmpty);
    expect(header.rowFields, isEmpty);
  });

  test('YAML and JSON converge on an identical definition', () {
    expect(parsePageYaml(_yaml), parsePageJson(_json));
  });

  test('the shipped example (spec/examples/order_entry.yaml) parses', () {
    final source =
        File('../../../spec/examples/order_entry.yaml').readAsStringSync();
    final lines = _linesOf(parsePageYaml(source));
    expect(lines.type, FieldTypes.subTable);
    expect(lines.columns.length, 4);
    expect(lines.rowFields.length, 4);
  });
}

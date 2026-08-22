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

  test('no source means embedded rows (the default)', () {
    expect(_linesOf(parsePageYaml(_yaml)).source, isNull);
  });

  test('parses a subTable source (child repository, paged)', () {
    final lines = _linesOf(parsePageYaml('''
page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - field: lines
            label: 明細
            type: subTable
            source:
              repository: orderLineRepository
              parentKey: orderNo
              key: lineNo
              pageSize: 25
            columns:
              - { field: item, label: 品名 }
'''));

    expect(
      lines.source,
      const SubTableSource(
        repository: 'orderLineRepository',
        parentKey: 'orderNo',
        keyField: 'lineNo',
        pageSize: 25,
      ),
    );
  });

  test('source key and pageSize fall back to id / 20', () {
    final lines = _linesOf(parsePageYaml('''
page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  form:
    sections:
      - fields:
          - field: lines
            label: 明細
            type: subTable
            source: { repository: lineRepository, parentKey: orderNo }
'''));

    expect(lines.source!.keyField, 'id');
    expect(lines.source!.pageSize, 20);
  });

  test('a source without parentKey is rejected', () {
    expect(
      () => parsePageYaml('''
page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  form:
    sections:
      - fields:
          - field: lines
            label: 明細
            type: subTable
            source: { repository: lineRepository }
'''),
      throwsA(isA<DefinitionParseException>()),
    );
  });

  test('YAML and JSON converge on an identical definition', () {
    expect(parsePageYaml(_yaml), parsePageJson(_json));
  });

  test('the shipped example (spec/examples/order_entry.yaml) parses', () {
    final source =
        File('../../../spec/examples/order_entry.yaml').readAsStringSync();
    final lines = _linesOf(parsePageYaml(source));
    expect(lines.type, FieldTypes.subTable);
    // 数だけを見ると、違う形になっても通ってしまう。名前で見る。
    expect(
      lines.columns.map((c) => c.field),
      ['item', 'qty', 'price', 'amount', 'cancelled'],
    );
    expect(
      lines.rowFields.map((f) => f.field),
      ['item', 'qty', 'price', 'amount', 'cancelled'],
    );
    expect(lines.source, isNull);
  });

  test('the paged example (spec/examples/order_entry_paged.yaml) parses', () {
    final source =
        File('../../../spec/examples/order_entry_paged.yaml').readAsStringSync();
    final lines = _linesOf(parsePageYaml(source));
    expect(
      lines.source,
      const SubTableSource(
        repository: 'orderLineRepository',
        parentKey: 'orderNo',
        keyField: 'lineNo',
        pageSize: 20,
      ),
    );
    // ページ送りの例は取消印を持たない（行がここに無いので畳めない＝絞る話が無い）。
    expect(lines.columns.map((c) => c.field), ['item', 'qty', 'price', 'amount']);
    expect(lines.rowFields.map((f) => f.field), ['item', 'qty', 'price', 'amount']);
  });
}

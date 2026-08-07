import 'dart:io';

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

/// A report page reuses `search` (conditions) and `table` (detail columns) and
/// adds `report` for the printing structure.
const _yaml = '''
dsl_version: "1.0"
page:
  type: report
  id: sales_report
  title: 売上明細表
  repository: orderRepository
  search:
    layout: { columns: 2 }
    filters:
      - { field: orderDate, label: 受注日, type: date, operator: between }
  table:
    columns:
      - { field: orderNo, label: 受注番号, width: 140 }
      - { field: amount, label: 金額, type: number, format: currency, config: { symbol: "¥" } }
  report:
    paper: { size: A4, orientation: landscape }
    rowsPerPage: 25
    limit: 500
    sort: { field: customer, ascending: false }
    groupBy:
      - { field: customer, label: 顧客, pageBreak: true }
      - { field: status, label: 状態 }
    totals:
      - { field: amount, aggregate: sum }
      - { field: amount, aggregate: count }
  actions:
    - { id: csv, type: export, label: CSV出力, config: { filename: 売上明細, bom: true } }
''';

void main() {
  final page = parsePageYaml(_yaml) as ReportPageDefinition;

  test('parses the page, its conditions and its detail columns', () {
    expect(page.id, 'sales_report');
    expect(page.repository, 'orderRepository');
    expect(page.search!.layout.columns, 2);
    expect(page.table.columns.map((c) => c.field), ['orderNo', 'amount']);
    expect(page.actions.single.type, ActionTypes.export);
    expect(page.actions.single.config['bom'], isTrue);
  });

  test('parses the printing structure', () {
    final report = page.report;
    expect(report.paper,
        const PaperDefinition(size: PaperSizes.a4, orientation: Orientations.landscape));
    expect(report.paper.isLandscape, isTrue);
    expect(report.rowsPerPage, 25);
    expect(report.limit, 500);
    // 帳票は列見出しを押せないので、並び順は定義が持つ。
    expect(report.sortField, 'customer');
    expect(report.sortAscending, isFalse);
    expect(report.groups, [
      const ReportGroup(field: 'customer', label: '顧客', pageBreak: true),
      const ReportGroup(field: 'status', label: '状態'),
    ]);
    // Two totals may share a field (sum and count of 金額).
    expect(report.totals, [
      const ReportTotal(field: 'amount', aggregate: AggregateOps.sum),
      const ReportTotal(field: 'amount', aggregate: AggregateOps.count),
    ]);
  });

  test('report defaults are the ones a plain 帳票 wants', () {
    final plain = parsePageYaml('''
page:
  type: report
  id: order_list
  title: 受注一覧表
  repository: orderRepository
''') as ReportPageDefinition;

    expect(plain.report.paper.size, PaperSizes.a4);
    expect(plain.report.paper.orientation, Orientations.portrait);
    expect(plain.report.rowsPerPage, 40);
    expect(plain.report.limit, 1000);
    expect(plain.report.sortField, isNull);
    expect(plain.report.sortAscending, isTrue);
    expect(plain.report.groups, isEmpty);
    expect(plain.report.totals, isEmpty);
    expect(plain.search, isNull);
  });

  test('a total defaults to sum', () {
    final page = parsePageYaml('''
page:
  type: report
  id: r
  title: R
  repository: orderRepository
  report:
    totals: [ { field: amount } ]
''') as ReportPageDefinition;

    expect(page.report.totals.single.aggregate, AggregateOps.sum);
  });

  test('a group without a label is rejected', () {
    expect(
      () => parsePageYaml('''
page:
  type: report
  id: r
  title: R
  repository: orderRepository
  report:
    groupBy: [ { field: customer } ]
'''),
      throwsA(isA<DefinitionParseException>()),
    );
  });

  test('the shipped example (spec/examples/sales_report.yaml) parses', () {
    final source =
        File('../../../spec/examples/sales_report.yaml').readAsStringSync();
    final report = parsePageYaml(source) as ReportPageDefinition;

    expect(report.report.groups.map((g) => g.field), ['customer']);
    expect(report.report.totals, isNotEmpty);
    expect(
      report.actions.any((a) => a.type == ActionTypes.export),
      isTrue,
    );
  });
}

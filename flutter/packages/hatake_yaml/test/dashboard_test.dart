import 'dart:convert';
import 'dart:io';

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

/// A dashboard page: `items` instead of a form, no record key, and a
/// `repository` that is only the default for cards that omit one.
const _yaml = '''
dsl_version: "1.0"
page:
  type: dashboard
  id: sales_dashboard
  title: 売上ダッシュボード
  repository: orderRepository
  layout: { columns: 4 }
  search:
    filters:
      - { field: orderDate, label: 受注日, type: date, operator: between }
  items:
    - id: total
      title: 受注金額
      span: 2
      value: { aggregate: sum, field: amount }
      format: currency
      config: { symbol: "¥" }
      filters: { status: 未出荷 }
      limit: 500
      action: openOrders
    - id: recent
      type: table
      title: 直近の受注
      sort: { field: orderDate, ascending: false }
      limit: 5
      columns:
        - { field: orderNo, label: 受注番号, width: 120 }
    - id: byStatus
      type: chart
      title: 状態別
      repository: orderSummaryRepository
      roles: [admin]
      chart: { kind: pie, labelField: status, valueField: amount, aggregate: sum }
  actions:
    - { id: openOrders, type: navigate, label: 受注照会, page: order_search }
''';

void main() {
  final page = parsePageYaml(_yaml) as DashboardPageDefinition;

  test('parses the board and its cards', () {
    expect(page.id, 'sales_dashboard');
    expect(page.repository, 'orderRepository');
    expect(page.layout.columns, 4);
    expect(page.items.map((i) => i.id), ['total', 'recent', 'byStatus']);
    expect(page.search!.filters.single.operator, FilterOperators.between);
    expect(page.actions.single.id, 'openOrders');
  });

  test('a card defaults to a metric and keeps its query settings', () {
    final metric = page.items[0];
    expect(metric.type, DashboardItemTypes.metric);
    expect(metric.value,
        const DashboardValueDefinition(aggregate: AggregateOps.sum, field: 'amount'));
    expect(metric.span, 2);
    expect(metric.limit, 500);
    expect(metric.filters, {'status': '未出荷'});
    expect(metric.format, 'currency');
    expect(metric.config['symbol'], '¥');
    expect(metric.action, 'openOrders');
    // No repository of its own: the page's default applies.
    expect(metric.repository, isNull);
    expect(page.repositoryOf(metric), 'orderRepository');
  });

  test('reads sort, columns, chart and roles per card', () {
    final table = page.items[1];
    expect(table.sortField, 'orderDate');
    expect(table.sortAscending, isFalse);
    expect(table.columns.single.field, 'orderNo');
    expect(table.columns.single.width, 120);

    final chart = page.items[2];
    expect(
      chart.chart,
      const ChartDefinition(
        kind: ChartKinds.pie,
        labelField: 'status',
        valueField: 'amount',
        aggregate: AggregateOps.sum,
      ),
    );
    expect(chart.roles, ['admin']);
    expect(page.repositoryOf(chart), 'orderSummaryRepository');
  });

  test('YAML and JSON converge on an identical definition', () {
    // Re-encode the same document as JSON: both paths must land on one model.
    final json = jsonEncode({
      'dsl_version': '1.0',
      'page': {
        'type': 'dashboard',
        'id': 'ops',
        'title': '稼働状況',
        'items': [
          {'id': 'open', 'title': '未処理', 'repository': 'taskRepository'},
        ],
      },
    });
    final fromJson = parsePageJson(json);
    final fromYaml = parsePageYaml('''
page:
  type: dashboard
  id: ops
  title: 稼働状況
  items:
    - { id: open, title: 未処理, repository: taskRepository }
''');
    expect(fromJson, fromYaml);
  });

  test('a board needs no page repository when every card has one', () {
    final board = parsePageYaml('''
page:
  type: dashboard
  id: ops
  title: 稼働状況
  items:
    - { id: open, title: 未処理, repository: taskRepository }
''') as DashboardPageDefinition;

    expect(board.repository, isNull);
    expect(board.repositoryOf(board.items.single), 'taskRepository');
    expect(board.layout.columns, 2);
  });

  test('rejects a board with no cards', () {
    expect(
      () => parsePageYaml('''
page:
  type: dashboard
  id: empty
  title: 空
'''),
      throwsA(isA<DefinitionParseException>()),
    );
  });

  test('the shipped example (spec/examples/sales_dashboard.yaml) parses', () {
    final source =
        File('../../../spec/examples/sales_dashboard.yaml').readAsStringSync();
    final board = parsePageYaml(source) as DashboardPageDefinition;

    expect(board.items.length, 7);
    // A pre-aggregated card plots its rows as they are (no aggregate).
    final trend = board.items.firstWhere((i) => i.id == 'monthlyTrend');
    expect(trend.chart!.kind, ChartKinds.line);
    expect(trend.chart!.aggregate, isNull);
    expect(board.repositoryOf(trend), 'monthlySalesRepository');
  });

  test('rejects a chart without a labelField', () {
    expect(
      () => parsePageYaml('''
page:
  type: dashboard
  id: broken
  title: 壊れた
  repository: orderRepository
  items:
    - { id: c, title: チャート, type: chart, chart: { kind: bar } }
'''),
      throwsA(isA<DefinitionParseException>()),
    );
  });
}

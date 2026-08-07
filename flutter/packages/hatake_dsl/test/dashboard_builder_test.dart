import 'package:hatake_dsl/hatake_dsl.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

/// The same dashboard in YAML, so the Dart builder can be proven to converge on
/// the exact same PageDefinition.
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
    - { id: orderCount, title: 受注件数, action: openOrders }
    - id: totalAmount
      title: 受注金額
      value: { aggregate: sum, field: amount }
      format: currency
      config: { symbol: "¥" }
    - id: byCustomer
      type: chart
      title: 顧客別の受注金額
      span: 2
      chart: { kind: bar, labelField: customer, valueField: amount, aggregate: sum }
    - id: recent
      type: table
      title: 直近の受注
      span: 2
      limit: 5
      sort: { field: orderDate, ascending: false }
      columns:
        - { field: orderNo, label: 受注番号, width: 140 }
  actions:
    - { id: openOrders, type: navigate, label: 受注照会, config: { page: order_search } }
''';

void main() {
  test('the builder produces the same dashboard as the YAML', () {
    final built = dashboardPage(
      id: 'sales_dashboard',
      title: '売上ダッシュボード',
      repository: 'orderRepository',
      columns: 4,
      search: search([
        filter('orderDate',
            label: '受注日',
            type: FieldTypes.date,
            operator: FilterOperators.between),
      ]),
      items: [
        item('orderCount', title: '受注件数', action: 'openOrders'),
        item(
          'totalAmount',
          title: '受注金額',
          value: metric(aggregate: AggregateOps.sum, field: 'amount'),
          format: 'currency',
          config: const {'symbol': '¥'},
        ),
        item(
          'byCustomer',
          type: DashboardItemTypes.chart,
          title: '顧客別の受注金額',
          span: 2,
          chart: chart(
            labelField: 'customer',
            valueField: 'amount',
            aggregate: AggregateOps.sum,
          ),
        ),
        item(
          'recent',
          type: DashboardItemTypes.table,
          title: '直近の受注',
          span: 2,
          limit: 5,
          sortField: 'orderDate',
          sortAscending: false,
          columns: [column('orderNo', label: '受注番号', width: 140)],
        ),
      ],
      actions: [
        action('openOrders',
            type: ActionTypes.navigate,
            label: '受注照会',
            config: const {'page': 'order_search'}),
      ],
    );

    expect(built, parsePageYaml(_yaml));
  });
}

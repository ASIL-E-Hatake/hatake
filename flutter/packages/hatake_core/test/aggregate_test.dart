import 'package:hatake_core/hatake_core.dart';
import 'package:test/test.dart';

/// Behaviour the shared fixtures do not pin: extensibility and the definition
/// defaults a dashboard relies on.
void main() {
  const rows = [
    {'status': '未出荷', 'amount': 100},
    {'status': '出荷済', 'amount': 200},
  ];

  test('an unknown op yields null rather than throwing', () {
    expect(AggregateRegistry().aggregate('median', rows, field: 'amount'),
        isNull);
    expect(AggregateRegistry().has('median'), isFalse);
  });

  test('a plugin op is registered like any other', () {
    final registry = AggregateRegistry({
      'range': (rows, field) {
        final values = [
          for (final row in rows)
            if (aggregateValue(row[field!]) case final n?) n,
        ];
        if (values.isEmpty) return null;
        values.sort();
        return values.last - values.first;
      },
    });

    expect(registry.has('range'), isTrue);
    expect(registry.aggregate('range', rows, field: 'amount'), 100);
    // Built-ins still resolve.
    expect(registry.aggregate(AggregateOps.sum, rows, field: 'amount'), 300);
  });

  test('a registered op can override a built-in', () {
    final registry = AggregateRegistry()..register(AggregateOps.count, (r, f) => 42);
    expect(registry.aggregate(AggregateOps.count, rows), 42);
  });

  test('aggregateValue reads the same values the ops do', () {
    expect(aggregateValue('1500'), 1500);
    expect(aggregateValue(' 12.5 '), 12.5);
    expect(aggregateValue(true), isNull);
    expect(aggregateValue('abc'), isNull);
    expect(aggregateValue(null), isNull);
  });

  test('a metric defaults to counting rows', () {
    const value = DashboardValueDefinition();
    expect(value.aggregate, AggregateOps.count);
    expect(value.field, isNull);
  });

  test('a card defaults to a metric that fills one grid cell', () {
    const item = DashboardItemDefinition(id: 'total', title: '受注金額');
    expect(item.type, DashboardItemTypes.metric);
    expect(item.span, 1);
    expect(item.limit, 100);
    expect(item.sortAscending, isTrue);
    expect(item.value, isNull);
  });

  test('a board falls back to its own repository for cards without one', () {
    const board = DashboardPageDefinition(
      id: 'sales',
      title: '売上',
      repository: 'orderRepository',
      items: [
        DashboardItemDefinition(id: 'a', title: 'A'),
        DashboardItemDefinition(id: 'b', title: 'B', repository: 'summaryRepo'),
      ],
    );

    expect(board.repositoryOf(board.items[0]), 'orderRepository');
    expect(board.repositoryOf(board.items[1]), 'summaryRepo');
    // Two columns unless the definition says otherwise.
    expect(board.layout.columns, 2);
  });

  test('a chart plots rows as they are when it declares no aggregate', () {
    const chart = ChartDefinition(labelField: 'status', valueField: 'amount');
    expect(chart.kind, ChartKinds.bar);
    expect(chart.aggregate, isNull);
  });
}

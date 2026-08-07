import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// A dashboard is a set of small read-only queries laid out on a grid: each card
/// records the query it ran so these tests can pin what the definition promises.
class _Orders implements Repository {
  final List<DataRecord> rows;
  final List<RepositoryQuery> queries = [];
  int failures = 0;

  _Orders(this.rows);

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    queries.add(query);
    if (failures > 0) {
      failures--;
      throw StateError('接続できません');
    }
    var matched = rows;
    final status = query.filters['status'];
    if (status != null) {
      matched = rows.where((r) => r['status'] == status).toList();
    }
    return PageResult(items: matched, totalCount: matched.length);
  }

  @override
  Future<DataRecord?> findByKey(Object key) async => null;
  @override
  Future<DataRecord> create(DataRecord data) async => data;
  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;
  @override
  Future<void> delete(Object key) async {}
}

final _rows = <DataRecord>[
  {'orderNo': 'SO-1', 'status': '未出荷', 'amount': 100},
  {'orderNo': 'SO-2', 'status': '出荷済', 'amount': 200},
  {'orderNo': 'SO-3', 'status': '未出荷', 'amount': 50},
];

const _board = DashboardPageDefinition(
  id: 'sales_dashboard',
  title: '売上ダッシュボード',
  repository: 'orderRepository',
  layout: LayoutDefinition(columns: 4),
  items: [
    DashboardItemDefinition(id: 'count', title: '受注件数'),
    DashboardItemDefinition(
      id: 'total',
      title: '受注金額',
      value: DashboardValueDefinition(
        aggregate: AggregateOps.sum,
        field: 'amount',
      ),
      format: 'currency',
      config: {'symbol': '¥'},
    ),
    DashboardItemDefinition(
      id: 'pending',
      title: '未出荷',
      filters: {'status': '未出荷'},
      action: 'openOrders',
    ),
    DashboardItemDefinition(
      id: 'recent',
      type: DashboardItemTypes.table,
      title: '直近の受注',
      span: 2,
      limit: 5,
      sortField: 'orderNo',
      sortAscending: false,
      columns: [
        ColumnDefinition(field: 'orderNo', label: '受注番号'),
        ColumnDefinition(field: 'amount', label: '金額', format: 'currency'),
      ],
    ),
    DashboardItemDefinition(
      id: 'byStatus',
      type: DashboardItemTypes.chart,
      title: '状態別',
      span: 2,
      chart: ChartDefinition(
        labelField: 'status',
        valueField: 'amount',
        aggregate: AggregateOps.sum,
      ),
    ),
  ],
  actions: [
    ActionDefinition(
      id: 'openOrders',
      type: ActionTypes.plugin,
      plugin: 'openOrders',
      label: '受注照会',
    ),
  ],
);

Widget _harness(
  Repository repository, {
  DashboardPageDefinition definition = _board,
  ActionRegistry? actions,
  Set<String> roles = const {},
  Map<String, MaterialDashboardItemBuilder> itemBuilders = const {},
}) {
  return MaterialApp(
    home: Scaffold(
      body: HatakeScope(
        repositories: RepositoryRegistry({'orderRepository': repository}),
        renderer: MaterialRenderer(dashboardItemBuilders: itemBuilders),
        actions: actions,
        roles: roles,
        child: HatakePageView(definition: definition),
      ),
    ),
  );
}

String _text(Key key) =>
    (find.byKey(key).evaluate().single.widget as Text).data!;

void main() {
  testWidgets('every card runs its own query and shows its own result',
      (tester) async {
    final repository = _Orders(_rows);
    await tester.pumpWidget(_harness(repository));
    await tester.pumpAndSettle();

    // One query per card, each with the card's own filters / limit / sort.
    expect(repository.queries.length, 5);
    expect(_text(const Key('hatake.dashboard.count.value')), '3');
    expect(_text(const Key('hatake.dashboard.total.value')), '¥350');
    expect(_text(const Key('hatake.dashboard.pending.value')), '2');
    expect(find.byKey(const Key('hatake.dashboard.recent.table')),
        findsOneWidget);
    expect(find.byKey(const Key('hatake.dashboard.byStatus.chart')),
        findsOneWidget);
  });

  testWidgets('a card query carries its filters, limit and sort',
      (tester) async {
    final repository = _Orders(_rows);
    await tester.pumpWidget(_harness(repository));
    await tester.pumpAndSettle();

    final pending =
        repository.queries.firstWhere((q) => q.filters.isNotEmpty);
    expect(pending.filters, {'status': '未出荷'});

    final recent = repository.queries.firstWhere((q) => q.pageSize == 5);
    expect(recent.sortField, 'orderNo');
    expect(recent.sortAscending, isFalse);
  });

  testWidgets('one failing card does not take the board down', (tester) async {
    final repository = _Orders(_rows)..failures = 1;
    await tester.pumpWidget(_harness(repository));
    await tester.pumpAndSettle();

    // The first card errored; the rest still rendered.
    expect(find.textContaining('エラー:'), findsOneWidget);
    expect(_text(const Key('hatake.dashboard.total.value')), '¥350');
  });

  testWidgets('reloading re-runs every query', (tester) async {
    final repository = _Orders(_rows);
    await tester.pumpWidget(_harness(repository));
    await tester.pumpAndSettle();
    expect(repository.queries.length, 5);

    await tester.tap(find.byKey(const Key('hatake.dashboard.reload')));
    await tester.pumpAndSettle();
    expect(repository.queries.length, 10);
  });

  testWidgets('the search area filters every card at once', (tester) async {
    const withSearch = DashboardPageDefinition(
      id: 'sales_dashboard',
      title: '売上ダッシュボード',
      repository: 'orderRepository',
      search: SearchDefinition(
        filters: [FilterDefinition(field: 'status', label: '状態')],
      ),
      items: [
        DashboardItemDefinition(id: 'count', title: '受注件数'),
        DashboardItemDefinition(id: 'count2', title: '受注件数（再）'),
      ],
    );
    final repository = _Orders(_rows);
    await tester.pumpWidget(_harness(repository, definition: withSearch));
    await tester.pumpAndSettle();
    expect(_text(const Key('hatake.dashboard.count.value')), '3');

    await tester.enterText(
        find.byKey(const Key('hatake.filter.status')), '未出荷');
    await tester.tap(find.byKey(const Key('hatake.search')));
    await tester.pumpAndSettle();

    expect(_text(const Key('hatake.dashboard.count.value')), '2');
    expect(repository.queries.last.filters, {'status': '未出荷'});
  });

  testWidgets('tapping a card runs the action it names', (tester) async {
    var fired = 0;
    await tester.pumpWidget(_harness(
      _Orders(_rows),
      actions: ActionRegistry({'openOrders': (ctx) async => fired++}),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.dashboard.pending')));
    await tester.pumpAndSettle();
    expect(fired, 1);
  });

  testWidgets('a card the current role may not see is not drawn',
      (tester) async {
    const gated = DashboardPageDefinition(
      id: 'sales_dashboard',
      title: '売上ダッシュボード',
      repository: 'orderRepository',
      items: [
        DashboardItemDefinition(id: 'open', title: '公開'),
        DashboardItemDefinition(id: 'secret', title: '管理者のみ', roles: ['admin']),
      ],
    );
    await tester.pumpWidget(_harness(_Orders(_rows), definition: gated));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('hatake.dashboard.open')), findsOneWidget);
    expect(find.byKey(const Key('hatake.dashboard.secret')), findsNothing);
  });

  testWidgets('a chart card with no chart says so instead of crashing',
      (tester) async {
    const broken = DashboardPageDefinition(
      id: 'sales_dashboard',
      title: '売上ダッシュボード',
      repository: 'orderRepository',
      items: [
        DashboardItemDefinition(
          id: 'nochart',
          type: DashboardItemTypes.chart,
          title: 'チャート',
        ),
      ],
    );
    await tester.pumpWidget(_harness(_Orders(_rows), definition: broken));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('hatake.dashboard.nochart.unsupported')),
        findsOneWidget);
  });

  testWidgets('an unknown card type is reported, or handled by a plugin',
      (tester) async {
    const gauge = DashboardPageDefinition(
      id: 'sales_dashboard',
      title: '売上ダッシュボード',
      repository: 'orderRepository',
      items: [DashboardItemDefinition(id: 'load', type: 'gauge', title: '負荷')],
    );
    await tester.pumpWidget(_harness(_Orders(_rows), definition: gauge));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('hatake.dashboard.load.unsupported')),
        findsOneWidget);

    await tester.pumpWidget(_harness(
      _Orders(_rows),
      definition: gauge,
      itemBuilders: {
        'gauge': (ctx) => Text('${ctx.state.totalCount} 件',
            key: Key('hatake.gauge.${ctx.item.id}')),
      },
    ));
    await tester.pumpAndSettle();
    expect(_text(const Key('hatake.gauge.load')), '3 件');
  });
}

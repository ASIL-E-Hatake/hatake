import 'package:flutter/foundation.dart';
import 'package:hatake_core/hatake_core.dart';

import 'dashboard_item_state.dart';
import 'repository_registry.dart';

/// Renderer-independent runtime for a [DashboardPageDefinition]: runs one small
/// query per card and reduces each result for display.
///
/// Cards load concurrently and keep their own state, so one failing repository
/// shows one failing card. The page's search values (if any) are merged into
/// every card's query — they win over an item's fixed `filters`.
class DashboardController extends ChangeNotifier {
  final DashboardPageDefinition definition;
  final RepositoryRegistry repositories;
  final AggregateRegistry aggregates;

  DashboardController({
    required this.definition,
    required this.repositories,
    AggregateRegistry? aggregates,
  }) : aggregates = aggregates ?? AggregateRegistry();

  final Map<String, DashboardItemState> _states = {};

  Map<String, Object?> _filters = const {};

  /// Filter values currently applied to every card.
  Map<String, Object?> get filters => _filters;

  /// State of [item]; loading until its first result arrives.
  DashboardItemState stateOf(DashboardItemDefinition item) =>
      _states[item.id] ?? DashboardItemState.initial;

  /// True while any card is still loading.
  bool get loading => definition.items.any((i) => stateOf(i).loading);

  /// Loads every card. Call once after construction.
  Future<void> init() => load();

  /// (Re)loads every card with the current filters.
  Future<void> load() async {
    for (final item in definition.items) {
      _states[item.id] = DashboardItemState.initial;
    }
    notifyListeners();
    await Future.wait(definition.items.map(_loadItem));
  }

  /// Applies new filter values to every card and reloads.
  Future<void> search(Map<String, Object?> filters) {
    _filters = filters;
    return load();
  }

  Future<void> _loadItem(DashboardItemDefinition item) async {
    try {
      final key = definition.repositoryOf(item);
      if (key == null) {
        throw StateError(
          'Dashboard item "${item.id}" has no repository. Declare one on the '
          'item or a default on the page.',
        );
      }
      final result = await repositories.resolve(key).search(RepositoryQuery(
            // The page's search area wins over the item's fixed filters.
            filters: {...item.filters, ..._filters},
            pageSize: item.limit,
            sortField: item.sortField,
            sortAscending: item.sortAscending,
          ));
      _states[item.id] = DashboardItemState(
        rows: result.items,
        totalCount: result.totalCount,
        value: _metricValue(item, result),
        buckets: _chartBuckets(item, result.items),
      );
    } catch (error) {
      _states[item.id] = DashboardItemState(error: error);
    }
    notifyListeners();
  }

  /// Reduces a `metric` card's rows to one number. A missing `value` means the
  /// row count, which is also the only reduction a paged query can trust.
  num? _metricValue(DashboardItemDefinition item, PageResult result) {
    if (item.type != DashboardItemTypes.metric) return null;
    final value = item.value ?? const DashboardValueDefinition();
    if (value.aggregate == AggregateOps.count) return result.totalCount;
    return aggregates.aggregate(
      value.aggregate,
      result.items,
      field: value.field,
    );
  }

  /// Turns a `chart` card's rows into points: folded per label when the chart
  /// declares an `aggregate`, one point per row otherwise (pre-aggregated data).
  List<AggregateBucket> _chartBuckets(
    DashboardItemDefinition item,
    List<DataRecord> rows,
  ) {
    final chart = item.chart;
    if (chart == null) return const [];
    final op = chart.aggregate;
    if (op != null) {
      return aggregates.aggregateBy(
        op,
        rows,
        labelField: chart.labelField,
        valueField: chart.valueField,
      );
    }
    return [
      for (final row in rows)
        AggregateBucket(
          row[chart.labelField]?.toString() ?? '',
          chart.valueField == null
              ? null
              : aggregateValue(row[chart.valueField]),
        ),
    ];
  }
}

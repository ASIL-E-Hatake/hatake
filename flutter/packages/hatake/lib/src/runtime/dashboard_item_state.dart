import 'package:hatake_core/hatake_core.dart';

/// What one dashboard card knows right now. Each card loads independently, so a
/// slow query never blocks the rest of the board.
class DashboardItemState {
  final bool loading;
  final Object? error;

  /// Rows returned for this card (`table` items draw these directly).
  final List<DataRecord> rows;

  /// Total row count reported by the repository.
  final int totalCount;

  /// Aggregated value for a `metric` item.
  final num? value;

  /// Points for a `chart` item.
  final List<AggregateBucket> buckets;

  const DashboardItemState({
    this.loading = false,
    this.error,
    this.rows = const [],
    this.totalCount = 0,
    this.value,
    this.buckets = const [],
  });

  static const DashboardItemState initial = DashboardItemState(loading: true);
}

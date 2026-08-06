/// Built-in aggregate operations for dashboards. Open strings — extensible via
/// plugins (see `AggregateRegistry`).
abstract final class AggregateOps {
  const AggregateOps._();

  /// Number of rows. Ignores the field.
  static const String count = 'count';

  /// Sum of the numeric values of the field (non-numeric counts as 0).
  static const String sum = 'sum';

  /// Mean of the numeric values of the field (non-numeric rows are not counted).
  static const String avg = 'avg';

  static const String min = 'min';
  static const String max = 'max';
}

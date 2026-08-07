import 'package:equatable/equatable.dart';

import 'aggregate_ops.dart';

/// How a `metric` item turns the rows it fetched into one number.
///
/// The framework never queries an aggregate: the [Repository] returns rows and
/// this describes the reduction over them (see `AggregateRegistry`). When the
/// backend already aggregates, use `count`, or point [field] at the column the
/// endpoint returns and fetch a single row.
class DashboardValueDefinition extends Equatable {
  /// Aggregate operation name ([AggregateOps] or a plugin's).
  final String aggregate;

  /// Field to reduce. Not needed by `count`; required by the others.
  final String? field;

  const DashboardValueDefinition({
    this.aggregate = AggregateOps.count,
    this.field,
  });

  @override
  List<Object?> get props => [aggregate, field];
}

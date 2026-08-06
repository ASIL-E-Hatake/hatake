import 'package:equatable/equatable.dart';

import 'chart_kinds.dart';

/// How a `chart` item plots the rows it fetched.
///
/// Each point takes its label from [labelField] and its value from
/// [valueField]. With [aggregate] set, rows sharing a label are folded into one
/// point (see `AggregateRegistry.aggregateBy`); without it every row is a point,
/// which is what a pre-aggregated endpoint wants.
class ChartDefinition extends Equatable {
  /// Chart kind ([ChartKinds] or a plugin's).
  final String kind;

  /// Field holding each point's label (the category axis).
  final String labelField;

  /// Field holding each point's value. Not needed when [aggregate] is `count`.
  final String? valueField;

  /// Aggregate operation applied per label, or null to plot rows as they are.
  final String? aggregate;

  const ChartDefinition({
    this.kind = ChartKinds.bar,
    required this.labelField,
    this.valueField,
    this.aggregate,
  });

  @override
  List<Object?> get props => [kind, labelField, valueField, aggregate];
}

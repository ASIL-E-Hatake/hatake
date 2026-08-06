import 'package:equatable/equatable.dart';

import 'chart_definition.dart';
import 'column_definition.dart';
import 'dashboard_item_types.dart';
import 'dashboard_value_definition.dart';

/// One card on a dashboard: a query plus how to display its result.
///
/// Every item reads from a [Repository] — a dashboard is not a chart library
/// bolted onto the framework, it is a set of small read-only queries laid out on
/// a grid. What varies is only the presentation ([type]).
class DashboardItemDefinition extends Equatable {
  /// Stable item identifier (also the widget key).
  final String id;

  /// Item kind ([DashboardItemTypes] or a plugin's).
  final String type;

  /// Card heading.
  final String title;

  /// Repository key, or null to use the page's default.
  final String? repository;

  /// Grid columns this card occupies.
  final int span;

  /// Fixed filters merged into the query (the page's search values win).
  final Map<String, Object?> filters;

  /// Rows to fetch. Also the sample size a client-side aggregate sees, so keep
  /// pre-aggregated endpoints for anything that must be exact over big tables.
  final int limit;

  /// Sort field passed to the repository, or null for its default order.
  final String? sortField;

  final bool sortAscending;

  /// Reduction for a `metric` item. Null means `count`.
  final DashboardValueDefinition? value;

  /// Display formatter for a `metric` value (see `FormatterRegistry`).
  final String? format;

  /// Extra settings (formatter options, renderer-specific knobs).
  final Map<String, Object?> config;

  /// Columns for a `table` item.
  final List<ColumnDefinition> columns;

  /// Plot for a `chart` item.
  final ChartDefinition? chart;

  /// Id of a page action to run when the card is tapped, or null.
  final String? action;

  /// Roles allowed to see this card. Empty = everyone.
  final List<String> roles;

  const DashboardItemDefinition({
    required this.id,
    required this.title,
    this.type = DashboardItemTypes.metric,
    this.repository,
    this.span = 1,
    this.filters = const {},
    this.limit = 100,
    this.sortField,
    this.sortAscending = true,
    this.value,
    this.format,
    this.config = const {},
    this.columns = const [],
    this.chart,
    this.action,
    this.roles = const [],
  });

  @override
  List<Object?> get props => [
        id,
        type,
        title,
        repository,
        span,
        filters,
        limit,
        sortField,
        sortAscending,
        value,
        format,
        config,
        columns,
        chart,
        action,
        roles,
      ];
}

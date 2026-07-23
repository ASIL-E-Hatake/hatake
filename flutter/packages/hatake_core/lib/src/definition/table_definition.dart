import 'package:equatable/equatable.dart';

import 'column_definition.dart';
import 'pagination_definition.dart';

/// The data-table portion of a page.
class TableDefinition extends Equatable {
  final List<ColumnDefinition> columns;

  final PaginationDefinition pagination;

  /// Ids of actions available per row (e.g. `['edit', 'delete']`). These refer
  /// to actions declared on the page, or built-in [ActionTypes] shorthands.
  final List<String> rowActions;

  const TableDefinition({
    this.columns = const [],
    this.pagination = const PaginationDefinition(),
    this.rowActions = const [],
  });

  @override
  List<Object?> get props => [columns, pagination, rowActions];
}

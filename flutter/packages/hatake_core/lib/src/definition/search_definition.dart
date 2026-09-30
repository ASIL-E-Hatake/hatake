import 'package:equatable/equatable.dart';

import 'filter_definition.dart';
import 'layout_definition.dart';

/// The search area of a page: a set of filters plus their layout.
class SearchDefinition extends Equatable {
  final List<FilterDefinition> filters;

  final LayoutDefinition layout;

  /// いつも掛ける条件（`search.fixed`）。画面には出さず、サーバの `buildQuery`
  /// （TS / Java）が必ず足す。Repository を直接実装するアプリは自分で当てる。
  final List<FixedCondition> fixed;

  const SearchDefinition({
    this.filters = const [],
    this.layout = LayoutDefinition.single,
    this.fixed = const [],
  });

  @override
  List<Object?> get props => [filters, layout, fixed];
}

/// いつも掛ける条件1つ（`search.fixed`）。
class FixedCondition extends Equatable {
  final String field;

  /// 絞り込みの `operator` と同じ開いた語彙。既定は `equals`。
  final String operator;

  final Object? value;

  const FixedCondition({
    required this.field,
    this.operator = 'equals',
    this.value,
  });

  @override
  List<Object?> get props => [field, operator, value];
}

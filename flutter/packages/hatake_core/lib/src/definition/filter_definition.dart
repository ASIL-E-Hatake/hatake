import 'package:equatable/equatable.dart';

import 'field_types.dart';
import 'filter_operators.dart';
import 'option_item.dart';

/// A single search filter (one input in the search area of a page).
class FilterDefinition extends Equatable {
  /// The backing data key the filter applies to.
  final String field;

  /// Display label.
  final String label;

  /// Input type used to capture the filter value (see [FieldTypes]).
  final String type;

  /// How the value is matched (see [FilterOperators]).
  final String operator;

  /// Options for select-style filters.
  final List<OptionItem> options;

  /// Plugin / renderer specific extra configuration.
  final Map<String, Object?> config;

  const FilterDefinition({
    required this.field,
    required this.label,
    this.type = FieldTypes.text,
    this.operator = FilterOperators.contains,
    this.options = const [],
    this.config = const {},
  });

  @override
  List<Object?> get props => [field, label, type, operator, options, config];
}

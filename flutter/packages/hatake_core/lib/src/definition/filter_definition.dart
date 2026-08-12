import 'package:equatable/equatable.dart';

import 'field_types.dart';
import 'filter_operators.dart';
import 'option_item.dart';
import 'options_owner.dart';
import 'options_source.dart';

/// A single search filter (one input in the search area of a page).
class FilterDefinition extends Equatable implements OptionsOwner {
  /// The backing data key the filter applies to.
  @override
  final String field;

  /// Display label.
  final String label;

  /// Input type used to capture the filter value (see [FieldTypes]).
  final String type;

  /// How the value is matched (see [FilterOperators]).
  final String operator;

  /// Options for select-style filters.
  @override
  final List<OptionItem> options;

  /// Parent filter whose value narrows [options] (a static cascade). Same rule
  /// as on a form field, applied to the values currently typed in the search
  /// area instead of to a record.
  @override
  final String? optionsFrom;

  /// Where to fetch the options from, instead of listing them. Null = use
  /// [options].
  @override
  final OptionsSource? optionsSource;

  /// Plugin / renderer specific extra configuration.
  final Map<String, Object?> config;

  const FilterDefinition({
    required this.field,
    required this.label,
    this.type = FieldTypes.text,
    this.operator = FilterOperators.contains,
    this.options = const [],
    this.optionsFrom,
    this.optionsSource,
    this.config = const {},
  });

  @override
  List<Object?> get props => [
        field,
        label,
        type,
        operator,
        options,
        optionsFrom,
        optionsSource,
        config,
      ];
}

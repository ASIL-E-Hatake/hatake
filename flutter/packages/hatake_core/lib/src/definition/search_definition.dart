import 'package:equatable/equatable.dart';

import 'filter_definition.dart';
import 'layout_definition.dart';

/// The search area of a page: a set of filters plus their layout.
class SearchDefinition extends Equatable {
  final List<FilterDefinition> filters;

  final LayoutDefinition layout;

  const SearchDefinition({
    this.filters = const [],
    this.layout = LayoutDefinition.single,
  });

  @override
  List<Object?> get props => [filters, layout];
}

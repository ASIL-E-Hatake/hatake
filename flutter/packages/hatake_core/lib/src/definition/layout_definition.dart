import 'package:equatable/equatable.dart';

/// Describes how a group of fields/filters is arranged.
///
/// Renderers interpret [columns] as the number of items per row on wide
/// layouts, collapsing to a single column on narrow ones.
class LayoutDefinition extends Equatable {
  final int columns;

  const LayoutDefinition({this.columns = 1});

  static const LayoutDefinition single = LayoutDefinition();

  @override
  List<Object?> get props => [columns];
}

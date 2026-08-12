import 'package:equatable/equatable.dart';

import 'field_definition.dart';
import 'layout_definition.dart';

/// A titled group of fields within a form.
class SectionDefinition extends Equatable {
  /// Optional section heading.
  final String? title;

  final List<FieldDefinition> fields;

  final LayoutDefinition layout;

  /// Show the whole section only when the condition matches the current record
  /// (see `evaluateCondition`). Null = always visible.
  ///
  /// A hidden section's fields are not validated either — the same rule as a
  /// field hidden by its own `visibleWhen`.
  final Map<String, Object?>? visibleWhen;

  const SectionDefinition({
    this.title,
    this.fields = const [],
    this.layout = LayoutDefinition.single,
    this.visibleWhen,
  });

  @override
  List<Object?> get props => [title, fields, layout, visibleWhen];
}

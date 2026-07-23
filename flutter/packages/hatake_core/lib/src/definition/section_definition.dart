import 'package:equatable/equatable.dart';

import 'field_definition.dart';
import 'layout_definition.dart';

/// A titled group of fields within a form.
class SectionDefinition extends Equatable {
  /// Optional section heading.
  final String? title;

  final List<FieldDefinition> fields;

  final LayoutDefinition layout;

  const SectionDefinition({
    this.title,
    this.fields = const [],
    this.layout = LayoutDefinition.single,
  });

  @override
  List<Object?> get props => [title, fields, layout];
}

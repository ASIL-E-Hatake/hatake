import 'package:equatable/equatable.dart';

import 'field_definition.dart';
import 'section_definition.dart';

/// The form portion of a page (used for create / edit).
class FormDefinition extends Equatable {
  final List<SectionDefinition> sections;

  const FormDefinition({this.sections = const []});

  /// All fields across all sections, in declaration order.
  List<FieldDefinition> get fields =>
      [for (final section in sections) ...section.fields];

  @override
  List<Object?> get props => [sections];
}

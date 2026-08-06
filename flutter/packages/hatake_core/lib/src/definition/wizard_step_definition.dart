import 'package:equatable/equatable.dart';

import 'field_definition.dart';
import 'form_definition.dart';
import 'layout_definition.dart';
import 'section_definition.dart';

/// One step of a `wizard` page — a [SectionDefinition] with an [id] and a
/// heading. Only this step's [fields] are checked when the user advances.
class WizardStepDefinition extends Equatable {
  /// Stable step identifier.
  final String id;

  /// Step heading.
  final String title;

  /// Optional explanatory text shown under the heading.
  final String? description;

  /// Arrangement of this step's fields.
  final LayoutDefinition layout;

  /// Input fields belonging to this step.
  final List<FieldDefinition> fields;

  const WizardStepDefinition({
    required this.id,
    required this.title,
    this.description,
    this.layout = LayoutDefinition.single,
    this.fields = const [],
  });

  /// This step as a standalone form, so the ordinary [FormDefinition] machinery
  /// (validator, normalizer, form renderer) works on one step unchanged.
  FormDefinition get form => FormDefinition(
        sections: [SectionDefinition(fields: fields, layout: layout)],
      );

  @override
  List<Object?> get props => [id, title, description, layout, fields];
}

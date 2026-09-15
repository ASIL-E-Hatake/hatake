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

  /// Show this whole step only when the condition matches what has been entered
  /// so far (see `evaluateCondition`). Null = always shown.
  ///
  /// A hidden step is skipped by 次へ / 戻る **and** is not validated — the step
  /// becomes a section ([form]), so the "a hidden section is not validated" rule
  /// does the work. 判定を2つ持たない。
  final Map<String, Object?>? visibleWhen;

  const WizardStepDefinition({
    required this.id,
    required this.title,
    this.description,
    this.layout = LayoutDefinition.single,
    this.fields = const [],
    this.visibleWhen,
  });

  /// This step as a standalone form, so the ordinary [FormDefinition] machinery
  /// (validator, normalizer, form renderer) works on one step unchanged.
  FormDefinition get form => FormDefinition(
        sections: [
          SectionDefinition(
            fields: fields,
            layout: layout,
            visibleWhen: visibleWhen,
          ),
        ],
      );

  @override
  List<Object?> get props =>
      [id, title, description, layout, fields, visibleWhen];
}

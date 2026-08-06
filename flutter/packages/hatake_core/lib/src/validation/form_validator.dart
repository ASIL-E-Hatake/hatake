import '../definition/field_types.dart';
import '../definition/form_definition.dart';
import '../definition/section_definition.dart';
import '../definition/validator_definition.dart';
import '../definition/validator_types.dart';
import '../repository/repository.dart';
import 'validation_result.dart';
import 'validators.dart';

/// Validates a [DataRecord] against a [FormDefinition] using a
/// [ValidatorRegistry]. Reports at most one error per field.
///
/// Child rows of a `subTable` field are validated too: each row is checked
/// against the field's `rowFields`, and errors are reported with an indexed
/// path — `lines[0].qty`. Nested sub-tables recurse with the same convention.
///
/// A `subTable` with a `source` (repository-backed rows) is skipped entirely:
/// its rows live in another repository, not in this record, so validating them
/// here — including the field's own `required` — would be meaningless.
class FormValidator {
  final ValidatorRegistry registry;

  FormValidator([ValidatorRegistry? registry])
      : registry = registry ?? ValidatorRegistry();

  ValidationResult validate(FormDefinition form, DataRecord record) {
    final errors = <ValidationError>[];
    for (final field in form.fields) {
      // Repository-backed child rows are not part of this record.
      if (field.type == FieldTypes.subTable && field.source != null) continue;

      final value = record[field.field];
      final rules = <ValidatorDefinition>[
        if (field.required)
          const ValidatorDefinition(type: ValidatorTypes.required),
        ...field.validators,
      ];
      for (final rule in rules) {
        final message = registry.run(value, rule);
        if (message != null) {
          errors.add(
            ValidationError(field: field.field, message: rule.message ?? message),
          );
          break; // one error per field
        }
      }

      // Child rows (master-detail): validate each row against rowFields.
      if (field.type == FieldTypes.subTable && field.rowFields.isNotEmpty) {
        final rowForm =
            FormDefinition(sections: [SectionDefinition(fields: field.rowFields)]);
        var index = 0;
        for (final row in (value is Iterable ? value : const [])) {
          if (row is Map) {
            final rowErrors =
                validate(rowForm, row.cast<String, Object?>()).errors;
            for (final error in rowErrors) {
              errors.add(ValidationError(
                field: '${field.field}[$index].${error.field}',
                message: error.message,
              ));
            }
          }
          index++;
        }
      }
    }
    return ValidationResult(errors);
  }
}

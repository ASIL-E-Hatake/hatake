import '../definition/form_definition.dart';
import '../definition/validator_definition.dart';
import '../definition/validator_types.dart';
import '../repository/repository.dart';
import 'validation_result.dart';
import 'validators.dart';

/// Validates a [DataRecord] against a [FormDefinition] using a
/// [ValidatorRegistry]. Reports at most one error per field.
class FormValidator {
  final ValidatorRegistry registry;

  FormValidator([ValidatorRegistry? registry])
      : registry = registry ?? ValidatorRegistry();

  ValidationResult validate(FormDefinition form, DataRecord record) {
    final errors = <ValidationError>[];
    for (final field in form.fields) {
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
    }
    return ValidationResult(errors);
  }
}

import '../definition/form_definition.dart';
import '../repository/repository.dart';
import 'converter_registry.dart';

/// Applies each field's `normalize` converter chain to a record — run before
/// validation / persistence so input is cleaned consistently on any tier.
class FormNormalizer {
  final ConverterRegistry registry;

  FormNormalizer([ConverterRegistry? registry])
      : registry = registry ?? ConverterRegistry();

  /// Returns a copy of [record] with each field's `normalize` converters
  /// applied (in order). Fields absent from the record are left untouched.
  DataRecord normalize(FormDefinition form, DataRecord record) {
    final result = {...record};
    for (final field in form.fields) {
      if (field.normalize.isEmpty) continue;
      if (!result.containsKey(field.field)) continue;
      result[field.field] =
          registry.convertAll(field.normalize, result[field.field]);
    }
    return result;
  }
}

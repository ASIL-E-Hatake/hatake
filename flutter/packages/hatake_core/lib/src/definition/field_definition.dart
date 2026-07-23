import 'package:equatable/equatable.dart';

import 'field_types.dart';
import 'option_item.dart';
import 'validator_definition.dart';

/// A single input field within a form.
class FieldDefinition extends Equatable {
  /// The backing data key (matches keys in a record `Map`).
  final String field;

  /// Display label.
  final String label;

  /// Field type identifier (see [FieldTypes]). Open string, plugin-extensible.
  final String type;

  /// Whether the field is required. Sugar for a `required` validator; renderers
  /// may also use it to show a required marker.
  final bool required;

  /// Whether the field is read-only.
  final bool readOnly;

  /// Default value applied when creating a new record.
  final Object? defaultValue;

  /// Validation rules for this field.
  final List<ValidatorDefinition> validators;

  /// Options for select / radio / multiSelect field types.
  final List<OptionItem> options;

  /// Optional display formatter name (see `FormatterRegistry`). Options are
  /// read from [config].
  final String? format;

  /// Input converters/normalizers applied before validation/persistence
  /// (see `ConverterRegistry`), e.g. `[toHankaku, trim]`.
  final List<String> normalize;

  /// Plugin / renderer specific extra configuration. Kept open so field
  /// plugins can carry arbitrary settings without changing the model.
  final Map<String, Object?> config;

  const FieldDefinition({
    required this.field,
    required this.label,
    this.type = FieldTypes.text,
    this.required = false,
    this.readOnly = false,
    this.defaultValue,
    this.validators = const [],
    this.options = const [],
    this.format,
    this.normalize = const [],
    this.config = const {},
  });

  @override
  List<Object?> get props => [
        field,
        label,
        type,
        required,
        readOnly,
        defaultValue,
        validators,
        options,
        format,
        normalize,
        config,
      ];
}

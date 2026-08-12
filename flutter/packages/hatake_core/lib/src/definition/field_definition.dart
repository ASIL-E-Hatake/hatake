import 'package:equatable/equatable.dart';

import 'column_definition.dart';
import 'field_types.dart';
import 'option_item.dart';
import 'options_source.dart';
import 'sub_table_source.dart';
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

  /// Parent field whose value narrows [options] (a static cascade).
  ///
  /// The choices offered are those whose `when` equals the parent's current
  /// value, plus any option without a `when`. Null = every option is offered.
  final String? optionsFrom;

  /// Where to fetch the options from, instead of listing them (see
  /// [OptionsSource]). Null = use [options].
  final OptionsSource? optionsSource;

  /// Optional display formatter name (see `FormatterRegistry`). Options are
  /// read from [config].
  final String? format;

  /// Input converters/normalizers applied before validation/persistence
  /// (see `ConverterRegistry`), e.g. `[toHankaku, trim]`.
  final List<String> normalize;

  /// Plugin / renderer specific extra configuration. Kept open so field
  /// plugins can carry arbitrary settings without changing the model.
  final Map<String, Object?> config;

  /// Show this field only when the condition matches the current record
  /// (structured map, see `evaluateCondition`). Null = always visible.
  final Map<String, Object?>? visibleWhen;

  /// Enable this field only when the condition matches. Null = always enabled.
  final Map<String, Object?>? enabledWhen;

  /// Derive this field's value from the record (structured map, see
  /// `ComputedRegistry`). Computed fields are shown read-only.
  final Map<String, Object?>? computed;

  /// Roles allowed to see this field (see `isAllowed`). Empty = everyone.
  /// UI-level display gating only — not access enforcement.
  final List<String> roles;

  /// Child-row grid columns, for `type: subTable` (master-detail). The field's
  /// value is then a list of records, one per row. DSL key: `columns`.
  final List<ColumnDefinition> columns;

  /// Editor fields for one child row, for `type: subTable`. When empty the
  /// renderer derives inputs from [columns]. DSL key: `fields`.
  final List<FieldDefinition> rowFields;

  /// Where child rows come from, for `type: subTable`. Null (the default) keeps
  /// them embedded in the parent record; set it to page them from their own
  /// repository instead. DSL key: `source`.
  final SubTableSource? source;

  const FieldDefinition({
    required this.field,
    required this.label,
    this.type = FieldTypes.text,
    this.required = false,
    this.readOnly = false,
    this.defaultValue,
    this.validators = const [],
    this.options = const [],
    this.optionsFrom,
    this.optionsSource,
    this.format,
    this.normalize = const [],
    this.config = const {},
    this.visibleWhen,
    this.enabledWhen,
    this.computed,
    this.roles = const [],
    this.columns = const [],
    this.rowFields = const [],
    this.source,
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
        optionsFrom,
        optionsSource,
        format,
        normalize,
        config,
        visibleWhen,
        enabledWhen,
        computed,
        roles,
        columns,
        rowFields,
        source,
      ];
}

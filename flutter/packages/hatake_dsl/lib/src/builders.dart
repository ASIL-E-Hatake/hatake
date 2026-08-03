import 'package:hatake_core/hatake_core.dart';

/// Function-based builder DSL for hatake definitions.
///
/// A concise, type-safe alternative to writing YAML — every helper returns a
/// plain hatake_core definition, so the result is identical to the one parsed
/// from an equivalent YAML/JSON document.
///
/// ```dart
/// final page = crudPage(
///   id: 'customer_master',
///   title: '顧客マスタ',
///   repository: 'customerRepository',
///   table: table([
///     column('code', label: 'コード', sortable: true),
///   ]),
///   form: form([
///     section('基本情報', [
///       field('code', label: 'コード', required: true, validators: [maxLength(20)]),
///     ]),
///   ]),
/// );
/// ```

CrudPageDefinition crudPage({
  required String id,
  required String title,
  required String repository,
  String key = 'id',
  String dslVersion = kDslVersion,
  SearchDefinition? search,
  TableDefinition? table,
  FormDefinition? form,
  List<ActionDefinition> actions = const [],
}) {
  return CrudPageDefinition(
    id: id,
    title: title,
    repository: repository,
    keyField: key,
    dslVersion: dslVersion,
    search: search,
    table: table ?? const TableDefinition(),
    form: form ?? const FormDefinition(),
    actions: actions,
  );
}

SearchPageDefinition searchPage({
  required String id,
  required String title,
  required String repository,
  String key = 'id',
  String dslVersion = kDslVersion,
  SearchDefinition? search,
  TableDefinition? table,
  List<ActionDefinition> actions = const [],
}) {
  return SearchPageDefinition(
    id: id,
    title: title,
    repository: repository,
    keyField: key,
    dslVersion: dslVersion,
    search: search,
    table: table ?? const TableDefinition(),
    actions: actions,
  );
}

SearchDefinition search(List<FilterDefinition> filters, {int columns = 1}) {
  return SearchDefinition(
    filters: filters,
    layout: LayoutDefinition(columns: columns),
  );
}

FilterDefinition filter(
  String field, {
  required String label,
  String type = FieldTypes.text,
  String operator = FilterOperators.contains,
  List<OptionItem> options = const [],
  Map<String, Object?> config = const {},
}) {
  return FilterDefinition(
    field: field,
    label: label,
    type: type,
    operator: operator,
    options: options,
    config: config,
  );
}

TableDefinition table(
  List<ColumnDefinition> columns, {
  int pageSize = 50,
  bool paginated = true,
  List<String> rowActions = const [],
}) {
  return TableDefinition(
    columns: columns,
    pagination: PaginationDefinition(pageSize: pageSize, enabled: paginated),
    rowActions: rowActions,
  );
}

ColumnDefinition column(
  String field, {
  required String label,
  String type = ColumnTypes.text,
  double? width,
  bool sortable = false,
  String? format,
  Map<String, Object?> config = const {},
}) {
  return ColumnDefinition(
    field: field,
    label: label,
    type: type,
    width: width,
    sortable: sortable,
    format: format,
    config: config,
  );
}

FormDefinition form(List<SectionDefinition> sections) {
  return FormDefinition(sections: sections);
}

SectionDefinition section(
  String? title,
  List<FieldDefinition> fields, {
  int columns = 1,
}) {
  return SectionDefinition(
    title: title,
    fields: fields,
    layout: LayoutDefinition(columns: columns),
  );
}

FieldDefinition field(
  String field, {
  required String label,
  String type = FieldTypes.text,
  bool required = false,
  bool readOnly = false,
  Object? defaultValue,
  List<ValidatorDefinition> validators = const [],
  List<OptionItem> options = const [],
  String? format,
  List<String> normalize = const [],
  Map<String, Object?> config = const {},
  Map<String, Object?>? visibleWhen,
  Map<String, Object?>? enabledWhen,
  Map<String, Object?>? computed,
}) {
  return FieldDefinition(
    field: field,
    label: label,
    type: type,
    required: required,
    readOnly: readOnly,
    defaultValue: defaultValue,
    validators: validators,
    options: options,
    format: format,
    normalize: normalize,
    config: config,
    visibleWhen: visibleWhen,
    enabledWhen: enabledWhen,
    computed: computed,
  );
}

ActionDefinition action(
  String id, {
  required String type,
  required String label,
  String? plugin,
  Map<String, Object?> config = const {},
}) {
  return ActionDefinition(
    id: id,
    type: type,
    label: label,
    plugin: plugin,
    config: config,
  );
}

OptionItem option(Object? value, String label) {
  return OptionItem(value: value, label: label);
}

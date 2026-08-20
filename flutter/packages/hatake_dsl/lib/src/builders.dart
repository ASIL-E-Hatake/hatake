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

WizardPageDefinition wizardPage({
  required String id,
  required String title,
  required String repository,
  required List<WizardStepDefinition> steps,
  String key = 'id',
  String dslVersion = kDslVersion,
  List<ActionDefinition> actions = const [],
}) {
  return WizardPageDefinition(
    id: id,
    title: title,
    repository: repository,
    keyField: key,
    dslVersion: dslVersion,
    steps: steps,
    actions: actions,
  );
}

/// A dashboard: a grid of card queries. [repository] is only the default for
/// cards that declare none, so it is optional.
DashboardPageDefinition dashboardPage({
  required String id,
  required String title,
  required List<DashboardItemDefinition> items,
  String? repository,
  int columns = 2,
  String dslVersion = kDslVersion,
  SearchDefinition? search,
  List<ActionDefinition> actions = const [],
}) {
  return DashboardPageDefinition(
    id: id,
    title: title,
    repository: repository,
    dslVersion: dslVersion,
    layout: LayoutDefinition(columns: columns),
    search: search,
    items: items,
    actions: actions,
  );
}

/// One dashboard card: how to read, plus how to show.
DashboardItemDefinition item(
  String id, {
  required String title,
  String type = DashboardItemTypes.metric,
  String? repository,
  int span = 1,
  Map<String, Object?> filters = const {},
  int limit = 100,
  String? sortField,
  bool sortAscending = true,
  DashboardValueDefinition? value,
  String? format,
  Map<String, Object?> config = const {},
  List<ColumnDefinition> columns = const [],
  ChartDefinition? chart,
  String? action,
  List<String> roles = const [],
}) {
  return DashboardItemDefinition(
    id: id,
    title: title,
    type: type,
    repository: repository,
    span: span,
    filters: filters,
    limit: limit,
    sortField: sortField,
    sortAscending: sortAscending,
    value: value,
    format: format,
    config: config,
    columns: columns,
    chart: chart,
    action: action,
    roles: roles,
  );
}

/// A `metric` card's reduction. Defaults to counting rows.
DashboardValueDefinition metric({
  String aggregate = AggregateOps.count,
  String? field,
}) {
  return DashboardValueDefinition(aggregate: aggregate, field: field);
}

/// A `chart` card's plot. Without [aggregate] every row is one point.
ChartDefinition chart({
  required String labelField,
  String kind = ChartKinds.bar,
  String? valueField,
  String? aggregate,
}) {
  return ChartDefinition(
    kind: kind,
    labelField: labelField,
    valueField: valueField,
    aggregate: aggregate,
  );
}

/// One wizard step — the section shape plus an id and a heading.
WizardStepDefinition step(
  String id, {
  required String title,
  String? description,
  List<FieldDefinition> fields = const [],
  int columns = 1,
}) {
  return WizardStepDefinition(
    id: id,
    title: title,
    description: description,
    layout: LayoutDefinition(columns: columns),
    fields: fields,
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
  List<String> roles = const [],
}) {
  return ColumnDefinition(
    field: field,
    label: label,
    type: type,
    width: width,
    sortable: sortable,
    format: format,
    config: config,
    roles: roles,
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
  List<String> roles = const [],
  List<ColumnDefinition> columns = const [],
  List<FieldDefinition> rowFields = const [],
  SubTableSource? source,
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
    roles: roles,
    columns: columns,
    rowFields: rowFields,
    source: source,
  );
}

ActionDefinition action(
  String id, {
  required String type,
  required String label,
  String scope = ActionScopes.page,
  String? plugin,
  Map<String, Object?> config = const {},
  List<String> roles = const [],
}) {
  return ActionDefinition(
    id: id,
    type: type,
    label: label,
    scope: scope,
    plugin: plugin,
    config: config,
    roles: roles,
  );
}

OptionItem option(Object? value, String label) {
  return OptionItem(value: value, label: label);
}

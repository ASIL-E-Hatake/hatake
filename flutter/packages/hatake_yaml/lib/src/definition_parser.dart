import 'package:hatake_core/hatake_core.dart';

import 'map_readers.dart';
import 'parse_exception.dart';

/// Converts a normalized definition map into a [PageDefinition].
///
/// The map may be either the whole document (`{dsl_version, page: {...}}`) or
/// the page map directly. This is the single convergence point shared by the
/// YAML and JSON entry points.
PageDefinition parsePageMap(Map<String, Object?> root) {
  final dslVersion = root.optString('dsl_version');
  final page = root.optMap('page') ?? root;
  final type = page.reqString('type', at: 'page.type');

  switch (type) {
    case 'crud':
      return _parseCrud(page, dslVersion);
    case 'search':
      return _parseSearchPage(page, dslVersion);
    case 'master':
      return _parseMasterPage(page, dslVersion);
    case 'detail':
      return _parseDetailPage(page, dslVersion);
    case 'form':
      return _parseFormPage(page, dslVersion);
    case 'wizard':
      return _parseWizardPage(page, dslVersion);
    case 'dashboard':
      return _parseDashboardPage(page, dslVersion);
    case 'report':
      return _parseReportPage(page, dslVersion);
    default:
      throw DefinitionParseException(
        'Unsupported page type "$type" (supported: crud, search, master, '
        'detail, form, wizard, dashboard, report)',
        path: 'page.type',
      );
  }
}

FormPageDefinition _parseFormPage(Map<String, Object?> m, String? dslVersion) {
  return FormPageDefinition(
    id: m.reqString('id', at: 'page.id'),
    title: m.reqString('title', at: 'page.title'),
    dslVersion: dslVersion ?? kDslVersion,
    repository: m.reqString('repository', at: 'page.repository'),
    keyField: m.optString('key') ?? 'id',
    form: _parseForm(m.optMap('form')),
    actions: [
      for (var i = 0; i < m.optList('actions').length; i++)
        _parseAction(_asMap(m.optList('actions')[i], 'page.actions[$i]')),
    ],
  );
}

WizardPageDefinition _parseWizardPage(
  Map<String, Object?> m,
  String? dslVersion,
) {
  final steps = m.optList('steps');
  if (steps.isEmpty) {
    throw DefinitionParseException(
      'A wizard page needs at least one step',
      path: 'page.steps',
    );
  }
  return WizardPageDefinition(
    id: m.reqString('id', at: 'page.id'),
    title: m.reqString('title', at: 'page.title'),
    dslVersion: dslVersion ?? kDslVersion,
    repository: m.reqString('repository', at: 'page.repository'),
    keyField: m.optString('key') ?? 'id',
    steps: [
      for (var i = 0; i < steps.length; i++)
        _parseWizardStep(_asMap(steps[i], 'page.steps[$i]'), i),
    ],
    actions: [
      for (var i = 0; i < m.optList('actions').length; i++)
        _parseAction(_asMap(m.optList('actions')[i], 'page.actions[$i]')),
    ],
  );
}

/// A step reuses the section shape (`layout` / `fields`) plus an id and title.
WizardStepDefinition _parseWizardStep(Map<String, Object?> m, int index) {
  final fields = m.optList('fields');
  return WizardStepDefinition(
    id: m.reqString('id', at: 'page.steps[$index].id'),
    title: m.reqString('title', at: 'page.steps[$index].title'),
    description: m.optString('description'),
    layout: _parseLayout(m.optMap('layout')),
    fields: [
      for (var i = 0; i < fields.length; i++)
        _parseField(_asMap(fields[i], 'page.steps[$index].fields[$i]')),
    ],
  );
}

/// A report reuses `search` + `table` (conditions and detail columns) and adds
/// `report` for the printing structure.
ReportPageDefinition _parseReportPage(
  Map<String, Object?> m,
  String? dslVersion,
) {
  return ReportPageDefinition(
    id: m.reqString('id', at: 'page.id'),
    title: m.reqString('title', at: 'page.title'),
    dslVersion: dslVersion ?? kDslVersion,
    repository: m.reqString('repository', at: 'page.repository'),
    search: _parseSearch(m.optMap('search')),
    table: _parseTable(m.optMap('table')),
    report: _parseReport(m.optMap('report')),
    actions: [
      for (var i = 0; i < m.optList('actions').length; i++)
        _parseAction(_asMap(m.optList('actions')[i], 'page.actions[$i]')),
    ],
  );
}

ReportDefinition _parseReport(Map<String, Object?>? m) {
  if (m == null) return const ReportDefinition();
  final groups = m.optList('groupBy');
  final totals = m.optList('totals');
  final sort = m.optMap('sort');
  return ReportDefinition(
    paper: _parsePaper(m.optMap('paper')),
    rowsPerPage: m.optInt('rowsPerPage') ?? 40,
    limit: m.optInt('limit') ?? 1000,
    sortField: sort?.optString('field'),
    sortAscending: sort?.optBool('ascending', orElse: true) ?? true,
    groups: [
      for (var i = 0; i < groups.length; i++)
        _parseReportGroup(_asMap(groups[i], 'page.report.groupBy[$i]'), i),
    ],
    totals: [
      for (var i = 0; i < totals.length; i++)
        _parseReportTotal(_asMap(totals[i], 'page.report.totals[$i]'), i),
    ],
  );
}

PaperDefinition _parsePaper(Map<String, Object?>? m) {
  if (m == null) return const PaperDefinition();
  return PaperDefinition(
    size: m.optString('size') ?? PaperSizes.a4,
    orientation: m.optString('orientation') ?? Orientations.portrait,
  );
}

ReportGroup _parseReportGroup(Map<String, Object?> m, int index) {
  return ReportGroup(
    field: m.reqString('field', at: 'page.report.groupBy[$index].field'),
    label: m.reqString('label', at: 'page.report.groupBy[$index].label'),
    pageBreak: m.optBool('pageBreak'),
  );
}

ReportTotal _parseReportTotal(Map<String, Object?> m, int index) {
  return ReportTotal(
    field: m.reqString('field', at: 'page.report.totals[$index].field'),
    aggregate: m.optString('aggregate') ?? AggregateOps.sum,
  );
}

/// A dashboard is a grid of card queries. `repository` is optional here: it is
/// only the default for items that declare none.
DashboardPageDefinition _parseDashboardPage(
  Map<String, Object?> m,
  String? dslVersion,
) {
  final items = m.optList('items');
  if (items.isEmpty) {
    throw DefinitionParseException(
      'A dashboard page needs at least one item',
      path: 'page.items',
    );
  }
  return DashboardPageDefinition(
    id: m.reqString('id', at: 'page.id'),
    title: m.reqString('title', at: 'page.title'),
    dslVersion: dslVersion ?? kDslVersion,
    repository: m.optString('repository'),
    layout: _parseLayout(m.optMap('layout'), orElse: 2),
    search: _parseSearch(m.optMap('search')),
    items: [
      for (var i = 0; i < items.length; i++)
        _parseDashboardItem(_asMap(items[i], 'page.items[$i]'), i),
    ],
    actions: [
      for (var i = 0; i < m.optList('actions').length; i++)
        _parseAction(_asMap(m.optList('actions')[i], 'page.actions[$i]')),
    ],
  );
}

DashboardItemDefinition _parseDashboardItem(
  Map<String, Object?> m,
  int index,
) {
  final at = 'page.items[$index]';
  final sort = m.optMap('sort');
  return DashboardItemDefinition(
    id: m.reqString('id', at: '$at.id'),
    title: m.reqString('title', at: '$at.title'),
    type: m.optString('type') ?? DashboardItemTypes.metric,
    repository: m.optString('repository'),
    span: m.optInt('span') ?? 1,
    filters: m.optMap('filters') ?? const {},
    limit: m.optInt('limit') ?? 100,
    sortField: sort?.optString('field'),
    sortAscending: sort?.optBool('ascending', orElse: true) ?? true,
    value: _parseDashboardValue(m.optMap('value')),
    format: m.optString('format'),
    config: m.optMap('config') ?? const {},
    columns: [
      for (var i = 0; i < m.optList('columns').length; i++)
        _parseColumn(_asMap(m.optList('columns')[i], '$at.columns[$i]')),
    ],
    chart: _parseChart(m.optMap('chart'), at),
    action: m.optString('action'),
    roles: [for (final r in m.optList('roles')) r.toString()],
  );
}

DashboardValueDefinition? _parseDashboardValue(Map<String, Object?>? m) {
  if (m == null) return null;
  return DashboardValueDefinition(
    aggregate: m.optString('aggregate') ?? AggregateOps.count,
    field: m.optString('field'),
  );
}

ChartDefinition? _parseChart(Map<String, Object?>? m, String at) {
  if (m == null) return null;
  return ChartDefinition(
    kind: m.optString('kind') ?? ChartKinds.bar,
    labelField: m.reqString('labelField', at: '$at.chart.labelField'),
    valueField: m.optString('valueField'),
    aggregate: m.optString('aggregate'),
  );
}

MasterPageDefinition _parseMasterPage(
  Map<String, Object?> m,
  String? dslVersion,
) {
  return MasterPageDefinition(
    id: m.reqString('id', at: 'page.id'),
    title: m.reqString('title', at: 'page.title'),
    dslVersion: dslVersion ?? kDslVersion,
    repository: m.reqString('repository', at: 'page.repository'),
    keyField: m.optString('key') ?? 'id',
    search: _parseSearch(m.optMap('search')),
    table: _parseTable(m.optMap('table')),
    form: _parseForm(m.optMap('form')),
    actions: [
      for (var i = 0; i < m.optList('actions').length; i++)
        _parseAction(_asMap(m.optList('actions')[i], 'page.actions[$i]')),
    ],
  );
}

DetailPageDefinition _parseDetailPage(
  Map<String, Object?> m,
  String? dslVersion,
) {
  return DetailPageDefinition(
    id: m.reqString('id', at: 'page.id'),
    title: m.reqString('title', at: 'page.title'),
    dslVersion: dslVersion ?? kDslVersion,
    repository: m.reqString('repository', at: 'page.repository'),
    keyField: m.optString('key') ?? 'id',
    form: _parseForm(m.optMap('form')),
    actions: [
      for (var i = 0; i < m.optList('actions').length; i++)
        _parseAction(_asMap(m.optList('actions')[i], 'page.actions[$i]')),
    ],
  );
}

SearchPageDefinition _parseSearchPage(
  Map<String, Object?> m,
  String? dslVersion,
) {
  return SearchPageDefinition(
    id: m.reqString('id', at: 'page.id'),
    title: m.reqString('title', at: 'page.title'),
    dslVersion: dslVersion ?? kDslVersion,
    repository: m.reqString('repository', at: 'page.repository'),
    keyField: m.optString('key') ?? 'id',
    search: _parseSearch(m.optMap('search')),
    table: _parseTable(m.optMap('table')),
    actions: [
      for (var i = 0; i < m.optList('actions').length; i++)
        _parseAction(_asMap(m.optList('actions')[i], 'page.actions[$i]')),
    ],
  );
}

CrudPageDefinition _parseCrud(Map<String, Object?> m, String? dslVersion) {
  return CrudPageDefinition(
    id: m.reqString('id', at: 'page.id'),
    title: m.reqString('title', at: 'page.title'),
    dslVersion: dslVersion ?? kDslVersion,
    repository: m.reqString('repository', at: 'page.repository'),
    keyField: m.optString('key') ?? 'id',
    search: _parseSearch(m.optMap('search')),
    table: _parseTable(m.optMap('table')),
    form: _parseForm(m.optMap('form')),
    actions: [
      for (var i = 0; i < m.optList('actions').length; i++)
        _parseAction(_asMap(m.optList('actions')[i], 'page.actions[$i]')),
    ],
  );
}

SearchDefinition? _parseSearch(Map<String, Object?>? m) {
  if (m == null) return null;
  final filters = m.optList('filters');
  return SearchDefinition(
    layout: _parseLayout(m.optMap('layout')),
    filters: [
      for (var i = 0; i < filters.length; i++)
        _parseFilter(_asMap(filters[i], 'page.search.filters[$i]')),
    ],
  );
}

FilterDefinition _parseFilter(Map<String, Object?> m) {
  return FilterDefinition(
    field: m.reqString('field', at: 'filter.field'),
    label: m.reqString('label', at: 'filter.label'),
    type: m.optString('type') ?? FieldTypes.text,
    operator: m.optString('operator') ?? FilterOperators.contains,
    options: _parseOptions(m.optList('options')),
    optionsFrom: m.optString('optionsFrom'),
    optionsSource: _parseOptionsSource(m.optMap('optionsSource')),
    config: m.optMap('config') ?? const {},
  );
}

TableDefinition _parseTable(Map<String, Object?>? m) {
  if (m == null) return const TableDefinition();
  final columns = m.optList('columns');
  return TableDefinition(
    pagination: _parsePagination(m.optMap('pagination')),
    rowActions: [
      for (final a in m.optList('rowActions')) a.toString(),
    ],
    columns: [
      for (var i = 0; i < columns.length; i++)
        _parseColumn(_asMap(columns[i], 'page.table.columns[$i]')),
    ],
  );
}

ColumnDefinition _parseColumn(Map<String, Object?> m) {
  return ColumnDefinition(
    field: m.reqString('field', at: 'column.field'),
    label: m.reqString('label', at: 'column.label'),
    type: m.optString('type') ?? ColumnTypes.text,
    width: m.optDouble('width'),
    sortable: m.optBool('sortable'),
    format: m.optString('format'),
    config: m.optMap('config') ?? const {},
    roles: [for (final r in m.optList('roles')) r.toString()],
  );
}

PaginationDefinition _parsePagination(Map<String, Object?>? m) {
  if (m == null) return const PaginationDefinition();
  return PaginationDefinition(
    pageSize: m.optInt('pageSize') ?? 50,
    enabled: m.optBool('enabled', orElse: true),
  );
}

FormDefinition _parseForm(Map<String, Object?>? m) {
  if (m == null) return const FormDefinition();
  final sections = m.optList('sections');
  return FormDefinition(
    sections: [
      for (var i = 0; i < sections.length; i++)
        _parseSection(_asMap(sections[i], 'page.form.sections[$i]')),
    ],
  );
}

SectionDefinition _parseSection(Map<String, Object?> m) {
  final fields = m.optList('fields');
  return SectionDefinition(
    title: m.optString('title'),
    layout: _parseLayout(m.optMap('layout')),
    visibleWhen: m.optMap('visibleWhen'),
    fields: [
      for (var i = 0; i < fields.length; i++)
        _parseField(_asMap(fields[i], 'section.fields[$i]')),
    ],
  );
}

FieldDefinition _parseField(Map<String, Object?> m) {
  return FieldDefinition(
    field: m.reqString('field', at: 'field.field'),
    label: m.reqString('label', at: 'field.label'),
    type: m.optString('type') ?? FieldTypes.text,
    required: m.optBool('required'),
    requiredWhen: m.optMap('requiredWhen'),
    readOnly: m.optBool('readOnly'),
    readOnlyWhen: m.optMap('readOnlyWhen'),
    defaultValue: m['defaultValue'],
    validators: [
      for (var i = 0; i < m.optList('validators').length; i++)
        _parseValidator(
          _asMap(m.optList('validators')[i], 'field.validators[$i]'),
        ),
    ],
    options: _parseOptions(m.optList('options')),
    optionsFrom: m.optString('optionsFrom'),
    optionsSource: _parseOptionsSource(m.optMap('optionsSource')),
    format: m.optString('format'),
    normalize: [for (final n in m.optList('normalize')) n.toString()],
    config: m.optMap('config') ?? const {},
    visibleWhen: m.optMap('visibleWhen'),
    enabledWhen: m.optMap('enabledWhen'),
    computed: m.optMap('computed'),
    roles: [for (final r in m.optList('roles')) r.toString()],
    // Child-row grid (type: subTable). `columns` describes the grid, the
    // nested `fields` the row editor — both reuse the existing shapes.
    columns: [
      for (var i = 0; i < m.optList('columns').length; i++)
        _parseColumn(_asMap(m.optList('columns')[i], 'field.columns[$i]')),
    ],
    rowFields: [
      for (var i = 0; i < m.optList('fields').length; i++)
        _parseField(_asMap(m.optList('fields')[i], 'field.fields[$i]')),
    ],
    source: _parseSubTableSource(m.optMap('source')),
  );
}

/// Parses a `subTable`'s `source` (child-repository rows). Null when absent,
/// which keeps rows embedded in the parent record.
SubTableSource? _parseSubTableSource(Map<String, Object?>? m) {
  if (m == null) return null;
  return SubTableSource(
    repository: m.reqString('repository', at: 'field.source.repository'),
    parentKey: m.reqString('parentKey', at: 'field.source.parentKey'),
    keyField: m.optString('key') ?? 'id',
    pageSize: m.optInt('pageSize') ?? 20,
  );
}

ValidatorDefinition _parseValidator(Map<String, Object?> m) {
  final type = m.reqString('type', at: 'validator.type');
  return ValidatorDefinition(
    type: type,
    message: m.optString('message'),
    params: <String, Object?>{
      for (final e in m.entries)
        if (e.key != 'type' && e.key != 'message') e.key: e.value,
    },
  );
}

ActionDefinition _parseAction(Map<String, Object?> m) {
  return ActionDefinition(
    id: m.reqString('id', at: 'action.id'),
    type: m.reqString('type', at: 'action.type'),
    label: m.reqString('label', at: 'action.label'),
    plugin: m.optString('plugin'),
    confirm: _parseConfirm(m.optMap('confirm')),
    onSuccess: _parseActionSuccess(m.optMap('onSuccess')),
    // Lift top-level `page` / `params` (navigate actions) into config so the
    // ActionDefinition model stays unchanged.
    config: {
      ...?m.optMap('config'),
      if (m['page'] != null) 'page': m['page'],
      if (m['params'] != null) 'params': m['params'],
    },
    roles: [for (final r in m.optList('roles')) r.toString()],
  );
}

ConfirmDefinition? _parseConfirm(Map<String, Object?>? m) {
  if (m == null) return null;
  return ConfirmDefinition(
    title: m.optString('title'),
    message: m.reqString('message', at: 'action.confirm.message'),
    okLabel: m.optString('okLabel'),
    cancelLabel: m.optString('cancelLabel'),
    danger: m.optBool('danger'),
  );
}

ActionSuccessDefinition? _parseActionSuccess(Map<String, Object?>? m) {
  if (m == null) return null;
  return ActionSuccessDefinition(
    message: m.optString('message'),
    page: m.optString('page'),
    params: m.optMap('params') ?? const {},
  );
}

List<OptionItem> _parseOptions(List<Object?> raw) {
  return [
    for (var i = 0; i < raw.length; i++)
      _parseOption(_asMap(raw[i], 'options[$i]')),
  ];
}

OptionItem _parseOption(Map<String, Object?> m) {
  return OptionItem(
    value: m['value'],
    label: m.reqString('label', at: 'option.label'),
    when: m['when'],
  );
}

/// `optionsSource`（選択肢を Repository から引く）。
OptionsSource? _parseOptionsSource(Map<String, Object?>? m) {
  if (m == null) return null;
  return OptionsSource(
    repository: m.reqString('repository', at: 'optionsSource.repository'),
    value: m.optString('value') ?? 'code',
    label: m.optString('label') ?? 'name',
    parentKey: m.optString('parentKey'),
    limit: m.optInt('limit') ?? 200,
  );
}

LayoutDefinition _parseLayout(Map<String, Object?>? m, {int orElse = 1}) {
  if (m == null) return LayoutDefinition(columns: orElse);
  return LayoutDefinition(columns: m.optInt('columns') ?? orElse);
}

Map<String, Object?> _asMap(Object? node, String path) {
  if (node is Map<String, Object?>) return node;
  throw DefinitionParseException('Expected a mapping', path: path);
}

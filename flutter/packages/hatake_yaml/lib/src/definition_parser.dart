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
    default:
      throw DefinitionParseException(
        'Unsupported page type "$type" '
        '(supported: crud, search, master, detail, form)',
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
    readOnly: m.optBool('readOnly'),
    defaultValue: m['defaultValue'],
    validators: [
      for (var i = 0; i < m.optList('validators').length; i++)
        _parseValidator(
          _asMap(m.optList('validators')[i], 'field.validators[$i]'),
        ),
    ],
    options: _parseOptions(m.optList('options')),
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
  );
}

LayoutDefinition _parseLayout(Map<String, Object?>? m) {
  if (m == null) return LayoutDefinition.single;
  return LayoutDefinition(columns: m.optInt('columns') ?? 1);
}

Map<String, Object?> _asMap(Object? node, String path) {
  if (node is Map<String, Object?>) return node;
  throw DefinitionParseException('Expected a mapping', path: path);
}

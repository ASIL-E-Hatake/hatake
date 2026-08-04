import 'package:flutter/material.dart';
import 'package:hatake/hatake.dart';

part 'renderer/app_shell.dart';

/// Context handed to a custom [MaterialFieldBuilder] for a form field.
class MaterialFieldContext {
  final BuildContext buildContext;
  final FieldDefinition field;

  /// Current value of the field in the form draft.
  final Object? value;

  /// Call to update the field value in the form draft.
  final ValueChanged<Object?> onChanged;

  /// Current validation message for the field, or null.
  final String? errorText;

  const MaterialFieldContext({
    required this.buildContext,
    required this.field,
    required this.value,
    required this.onChanged,
    required this.errorText,
  });
}

/// Builds the input widget for a form field of a given type. Register these on
/// [MaterialRenderer] to add or override how field types render.
typedef MaterialFieldBuilder = Widget Function(MaterialFieldContext context);

/// A Material 3 [Renderer] for hatake pages.
///
/// Extend field-type support by passing [fieldBuilders] keyed by field type
/// (e.g. `{'color': (ctx) => ...}`); these take precedence over the built-ins.
class MaterialRenderer implements Renderer {
  final Map<String, MaterialFieldBuilder> fieldBuilders;

  /// Display formatters used for columns/fields with a `format`. Defaults to
  /// the built-in registry; pass a custom one to add/override formatters.
  final FormatterRegistry? formatters;

  const MaterialRenderer({this.fieldBuilders = const {}, this.formatters});

  @override
  Widget buildCrudPage(
    BuildContext context,
    CrudLike definition,
    CrudController controller,
  ) {
    return _MaterialCrudPage(
      definition: definition,
      controller: controller,
      fieldBuilders: fieldBuilders,
      formatters: formatters,
    );
  }

  @override
  Widget buildSearchPage(
    BuildContext context,
    SearchPageDefinition definition,
    ListController controller,
  ) {
    return _MaterialSearchPage(
      definition: definition,
      controller: controller,
      formatters: formatters,
    );
  }

  @override
  Widget buildDetailPage(
    BuildContext context,
    DetailPageDefinition definition,
    DetailController controller,
  ) {
    return _MaterialDetailPage(
      definition: definition,
      controller: controller,
      formatters: formatters ?? FormatterRegistry(),
    );
  }

  @override
  Widget buildFormPage(
    BuildContext context,
    FormPageDefinition definition,
    FormController controller,
  ) {
    return _MaterialFormPage(
      definition: definition,
      controller: controller,
      fieldBuilders: fieldBuilders,
    );
  }

  @override
  Widget buildApp(
    BuildContext context,
    AppDefinition definition,
    HatakeRouter router,
  ) {
    return _MaterialAppShell(app: definition, router: router);
  }
}

class _MaterialCrudPage extends StatefulWidget {
  final CrudLike definition;
  final CrudController controller;
  final Map<String, MaterialFieldBuilder> fieldBuilders;
  final FormatterRegistry? formatters;

  const _MaterialCrudPage({
    required this.definition,
    required this.controller,
    required this.fieldBuilders,
    required this.formatters,
  });

  @override
  State<_MaterialCrudPage> createState() => _MaterialCrudPageState();
}

class _MaterialCrudPageState extends State<_MaterialCrudPage> {
  final Map<String, TextEditingController> _textFilters = {};
  final Map<String, Object?> _selectFilters = {};
  late final FormatterRegistry _formatters =
      widget.formatters ?? FormatterRegistry();

  CrudLike get _def => widget.definition;
  CrudController get _controller => widget.controller;
  Set<String> get _roles => HatakeScope.of(context).roles;

  @override
  void initState() {
    super.initState();
    for (final filter in _def.search?.filters ?? const []) {
      if (filter.type == FieldTypes.select) {
        _selectFilters[filter.field] = null;
      } else {
        _textFilters[filter.field] = TextEditingController();
      }
    }
  }

  @override
  void dispose() {
    for (final controller in _textFilters.values) {
      controller.dispose();
    }
    super.dispose();
  }

  void _runSearch() {
    final filters = <String, Object?>{};
    _textFilters.forEach((field, controller) {
      final text = controller.text.trim();
      if (text.isNotEmpty) filters[field] = text;
    });
    _selectFilters.forEach((field, value) {
      if (value != null) filters[field] = value;
    });
    _controller.search(filters);
  }

  Future<void> _openForm() {
    return showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _FormDialog(
        definition: _def,
        controller: _controller,
        fieldBuilders: widget.fieldBuilders,
        roles: _roles,
      ),
    );
  }

  Future<void> _onAction(ActionDefinition action) async {
    switch (action.type) {
      case ActionTypes.create:
        _controller.startCreate();
        await _openForm();
      case ActionTypes.navigate:
        _navigateAction(context, action);
      case ActionTypes.plugin:
        final registry = HatakeScope.of(context).actions;
        final handler =
            action.plugin == null ? null : registry.resolve(action.plugin!);
        if (handler == null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('アクション "${action.id}" のハンドラが未登録です')),
          );
          return;
        }
        await handler(ActionContext(
          buildContext: context,
          controller: _controller,
          action: action,
        ));
      default:
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('アクション "${action.id}" は未実装です')),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(_def.title, style: theme.textTheme.headlineSmall),
              ),
              for (final action in _def.actions)
                if (isAllowed(action.roles, _roles)) ...[
                  FilledButton(
                    key: Key('hatake.action.${action.id}'),
                    onPressed: () => _onAction(action),
                    child: Text(action.label),
                  ),
                  const SizedBox(width: 8),
                ],
            ],
          ),
          const SizedBox(height: 12),
          if (_def.search != null) ...[
            _buildSearchArea(),
            const SizedBox(height: 12),
          ],
          Expanded(child: _buildBody()),
          const SizedBox(height: 8),
          _buildPagination(theme),
        ],
      ),
    );
  }

  Widget _buildSearchArea() {
    final search = _def.search!;
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        for (final filter in search.filters)
          SizedBox(width: 220, child: _buildFilterInput(filter)),
        FilledButton.icon(
          key: const Key('hatake.search'),
          onPressed: _runSearch,
          icon: const Icon(Icons.search),
          label: const Text('検索'),
        ),
      ],
    );
  }

  Widget _buildFilterInput(FilterDefinition filter) {
    if (filter.type == FieldTypes.select) {
      return DropdownButtonFormField<Object?>(
        key: Key('hatake.filter.${filter.field}'),
        initialValue: _selectFilters[filter.field],
        decoration: InputDecoration(
          labelText: filter.label,
          border: const OutlineInputBorder(),
          isDense: true,
        ),
        items: [
          const DropdownMenuItem<Object?>(value: null, child: Text('—')),
          for (final option in filter.options)
            DropdownMenuItem<Object?>(
              value: option.value,
              child: Text(option.label),
            ),
        ],
        onChanged: (value) =>
            setState(() => _selectFilters[filter.field] = value),
      );
    }
    return TextField(
      key: Key('hatake.filter.${filter.field}'),
      controller: _textFilters[filter.field],
      decoration: InputDecoration(
        labelText: filter.label,
        border: const OutlineInputBorder(),
        isDense: true,
      ),
      onSubmitted: (_) => _runSearch(),
    );
  }

  Widget _buildBody() {
    if (_controller.loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_controller.error != null) {
      return Center(
        child: Text(
          'エラー: ${_controller.error}',
          key: const Key('hatake.error'),
          style: TextStyle(color: Theme.of(context).colorScheme.error),
        ),
      );
    }
    if (_controller.items.isEmpty) {
      return const Center(
        child: Text('データがありません', key: Key('hatake.empty')),
      );
    }
    return _buildTable();
  }

  Widget _buildTable() {
    final columns =
        _def.table.columns.where((c) => isAllowed(c.roles, _roles)).toList();
    final rowActions = _def.table.rowActions;
    final hasRowActions = rowActions.contains(ActionTypes.edit) ||
        rowActions.contains(ActionTypes.delete);

    return SingleChildScrollView(
      scrollDirection: Axis.vertical,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          columns: [
            for (final column in columns)
              DataColumn(
                label: Text(column.label),
                onSort: column.sortable
                    ? (index, ascending) =>
                        _controller.sortBy(column.field, ascending: ascending)
                    : null,
              ),
            if (hasRowActions) const DataColumn(label: Text('')),
          ],
          rows: [
            for (final record in _controller.items)
              DataRow(
                cells: [
                  for (final column in columns)
                    DataCell(_buildCell(column, record[column.field])),
                  if (hasRowActions) DataCell(_buildRowActions(record)),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildCell(ColumnDefinition column, Object? value) {
    final text = column.format != null
        ? _formatters.format(column.format!, value, column.config)
        : value?.toString() ?? '';
    switch (column.type) {
      case ColumnTypes.badge:
        return Chip(
          label: Text(text),
          visualDensity: VisualDensity.compact,
        );
      case ColumnTypes.boolean:
        return Icon(value == true ? Icons.check : Icons.close, size: 18);
      default:
        return Text(text);
    }
  }

  Widget _buildRowActions(DataRecord record) {
    final key = record[_def.keyField];
    final rowActions = _def.table.rowActions;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (rowActions.contains(ActionTypes.edit))
          IconButton(
            key: Key('hatake.edit.$key'),
            icon: const Icon(Icons.edit_outlined),
            tooltip: '編集',
            onPressed: () {
              _controller.startEdit(record);
              _openForm();
            },
          ),
        if (rowActions.contains(ActionTypes.delete))
          IconButton(
            key: Key('hatake.delete.$key'),
            icon: const Icon(Icons.delete_outline),
            tooltip: '削除',
            onPressed: key == null ? null : () => _controller.deleteRecord(key),
          ),
      ],
    );
  }

  Widget _buildPagination(ThemeData theme) {
    final page = _controller.page;
    final pageCount = _controller.pageCount;
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        Text('全 ${_controller.totalCount} 件', style: theme.textTheme.bodySmall),
        const SizedBox(width: 16),
        IconButton(
          key: const Key('hatake.prev'),
          icon: const Icon(Icons.chevron_left),
          onPressed: page > 0 ? () => _controller.setPage(page - 1) : null,
        ),
        Text('${page + 1} / $pageCount'),
        IconButton(
          key: const Key('hatake.next'),
          icon: const Icon(Icons.chevron_right),
          onPressed:
              page < pageCount - 1 ? () => _controller.setPage(page + 1) : null,
        ),
      ],
    );
  }
}

/// The create/edit form, shown as a Material dialog.
/// Shared, reusable form body: renders a form's fields (same field types and
/// custom `fieldBuilders` as everywhere) and collects their current values.
/// Used by both the CRUD edit dialog and the standalone form page.
class _HatakeFormFields extends StatefulWidget {
  final FormDefinition form;
  final DataRecord initial;
  final ValidationResult validation;
  final Map<String, MaterialFieldBuilder> fieldBuilders;
  final Set<String> roles;

  const _HatakeFormFields({
    super.key,
    required this.form,
    required this.initial,
    required this.validation,
    required this.fieldBuilders,
    required this.roles,
  });

  @override
  State<_HatakeFormFields> createState() => _HatakeFormFieldsState();
}

class _HatakeFormFieldsState extends State<_HatakeFormFields> {
  final Map<String, TextEditingController> _text = {};
  final Map<String, Object?> _values = {};
  final ComputedRegistry _computeds = ComputedRegistry();

  bool _isTextField(String type) =>
      type == FieldTypes.text ||
      type == FieldTypes.textarea ||
      type == FieldTypes.number ||
      type == FieldTypes.time;

  @override
  void initState() {
    super.initState();
    _values.addAll(widget.initial);
    for (final field in widget.form.fields) {
      final initial = widget.initial[field.field];
      if (_isTextField(field.type)) {
        _text[field.field] =
            TextEditingController(text: initial?.toString() ?? '');
      } else {
        _values[field.field] = initial;
      }
    }
  }

  @override
  void dispose() {
    for (final controller in _text.values) {
      controller.dispose();
    }
    super.dispose();
  }

  /// Gathers the current field values into a record. Computed fields are
  /// derived from the gathered inputs (single pass, applied last).
  DataRecord collect() {
    final values = <String, Object?>{..._values};
    for (final field in widget.form.fields) {
      final controller = _text[field.field];
      if (controller == null) continue;
      final text = controller.text.trim();
      if (field.type == FieldTypes.number) {
        values[field.field] = text.isEmpty ? null : num.tryParse(text) ?? text;
      } else {
        values[field.field] = text;
      }
    }
    for (final field in widget.form.fields) {
      if (field.computed != null) {
        values[field.field] = _computeds.compute(field.computed, values);
      }
    }
    return values;
  }

  static String _formatDate(DateTime d) {
    String two(int v) => v.toString().padLeft(2, '0');
    return '${d.year}-${two(d.month)}-${two(d.day)}';
  }

  Future<void> _pickDate(FieldDefinition field) async {
    final current = DateTime.tryParse('${_values[field.field] ?? ''}');
    final picked = await showDatePicker(
      context: context,
      initialDate: current ?? DateTime(2026),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      setState(() => _values[field.field] = _formatDate(picked));
    }
  }

  @override
  Widget build(BuildContext context) {
    // Live record (inputs + computed) drives visibleWhen / enabledWhen.
    final record = collect();
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final section in widget.form.sections)
          ..._buildSection(section, record),
      ],
    );
  }

  List<Widget> _buildSection(SectionDefinition section, DataRecord record) {
    final visible = [
      for (final field in section.fields)
        if (isAllowed(field.roles, widget.roles) &&
            (field.visibleWhen == null ||
                evaluateCondition(field.visibleWhen, record)))
          field,
    ];
    if (visible.isEmpty) return const [];
    return [
      if (section.title != null && section.title!.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 4),
          child: Text(
            section.title!,
            style: Theme.of(context).textTheme.titleSmall,
          ),
        ),
      for (final field in visible) _buildField(field, record),
    ];
  }

  Widget _buildField(FieldDefinition field, DataRecord record) {
    // Computed fields are derived and shown read-only.
    if (field.computed != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: InputDecorator(
          decoration: InputDecoration(
            labelText: field.label,
            border: const OutlineInputBorder(),
          ),
          child: Text(
            '${record[field.field] ?? ''}',
            key: Key('hatake.form.${field.field}'),
          ),
        ),
      );
    }
    final errors = widget.validation.forField(field.field);
    final errorText = errors.isEmpty ? null : errors.first.message;
    final label = field.required ? '${field.label} *' : field.label;

    // A registered custom builder takes precedence over built-in field types.
    final custom = widget.fieldBuilders[field.type];
    if (custom != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: custom(MaterialFieldContext(
          buildContext: context,
          field: field,
          value: _values[field.field],
          errorText: errorText,
          onChanged: (value) => setState(() => _values[field.field] = value),
        )),
      );
    }

    final enabled = field.enabledWhen == null ||
        evaluateCondition(field.enabledWhen, record);
    final readOnly = field.readOnly || !enabled;

    Widget input;
    switch (field.type) {
      case FieldTypes.select:
        input = DropdownButtonFormField<Object?>(
          key: Key('hatake.form.${field.field}'),
          initialValue: _values[field.field],
          decoration: InputDecoration(
            labelText: label,
            border: const OutlineInputBorder(),
            errorText: errorText,
          ),
          items: [
            for (final option in field.options)
              DropdownMenuItem<Object?>(
                value: option.value,
                child: Text(option.label),
              ),
          ],
          onChanged: readOnly
              ? null
              : (value) => setState(() => _values[field.field] = value),
        );
      case FieldTypes.checkbox:
        input = CheckboxListTile(
          key: Key('hatake.form.${field.field}'),
          title: Text(label),
          subtitle: errorText == null
              ? null
              : Text(
                  errorText,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
          value: _values[field.field] == true,
          onChanged: readOnly
              ? null
              : (value) => setState(() => _values[field.field] = value),
        );
      case FieldTypes.radio:
        input = InputDecorator(
          decoration: InputDecoration(
            labelText: label,
            border: InputBorder.none,
            errorText: errorText,
          ),
          child: RadioGroup<Object?>(
            groupValue: _values[field.field],
            onChanged: (value) {
              if (readOnly) return;
              setState(() => _values[field.field] = value);
            },
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final option in field.options)
                  RadioListTile<Object?>(
                    key: Key('hatake.form.${field.field}.${option.value}'),
                    title: Text(option.label),
                    value: option.value,
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                  ),
              ],
            ),
          ),
        );
      case FieldTypes.multiSelect:
        final selected = (_values[field.field] as List?) ?? const [];
        input = InputDecorator(
          decoration: InputDecoration(
            labelText: label,
            border: const OutlineInputBorder(),
            errorText: errorText,
          ),
          child: Wrap(
            spacing: 8,
            children: [
              for (final option in field.options)
                FilterChip(
                  key: Key('hatake.form.${field.field}.${option.value}'),
                  label: Text(option.label),
                  selected: selected.contains(option.value),
                  onSelected: readOnly
                      ? null
                      : (on) => setState(() {
                            final next = [...selected];
                            if (on) {
                              next.add(option.value);
                            } else {
                              next.remove(option.value);
                            }
                            _values[field.field] = next;
                          }),
                ),
            ],
          ),
        );
      case FieldTypes.date:
      case FieldTypes.dateTime:
        input = InkWell(
          key: Key('hatake.form.${field.field}'),
          onTap: readOnly ? null : () => _pickDate(field),
          child: InputDecorator(
            decoration: InputDecoration(
              labelText: label,
              border: const OutlineInputBorder(),
              errorText: errorText,
              suffixIcon: const Icon(Icons.calendar_today),
            ),
            child: Text('${_values[field.field] ?? ''}'),
          ),
        );
      default:
        input = TextField(
          key: Key('hatake.form.${field.field}'),
          controller: _text[field.field],
          readOnly: readOnly,
          maxLines: field.type == FieldTypes.textarea ? 3 : 1,
          keyboardType:
              field.type == FieldTypes.number ? TextInputType.number : null,
          decoration: InputDecoration(
            labelText: label,
            border: const OutlineInputBorder(),
            errorText: errorText,
          ),
          // Rebuild so visibleWhen / enabledWhen / computed react to typing.
          onChanged: (_) => setState(() {}),
        );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: input,
    );
  }
}

/// The create/edit form shown as a dialog (used by CRUD/master pages).
class _FormDialog extends StatefulWidget {
  final CrudLike definition;
  final CrudController controller;
  final Map<String, MaterialFieldBuilder> fieldBuilders;
  final Set<String> roles;

  const _FormDialog({
    required this.definition,
    required this.controller,
    required this.fieldBuilders,
    required this.roles,
  });

  @override
  State<_FormDialog> createState() => _FormDialogState();
}

class _FormDialogState extends State<_FormDialog> {
  final GlobalKey<_HatakeFormFieldsState> _fields = GlobalKey();

  Future<void> _submit() async {
    final values = _fields.currentState!.collect();
    await widget.controller.submitForm(values);
    if (widget.controller.mode == CrudMode.list && mounted) {
      Navigator.of(context).pop();
    }
  }

  void _cancel() {
    widget.controller.cancelForm();
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final isCreate = controller.mode == CrudMode.create;
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        return AlertDialog(
          title: Text(isCreate ? '新規登録' : '編集'),
          content: SizedBox(
            width: 420,
            child: SingleChildScrollView(
              child: _HatakeFormFields(
                key: _fields,
                form: widget.definition.form,
                initial: controller.draft,
                validation: controller.validation,
                fieldBuilders: widget.fieldBuilders,
                roles: widget.roles,
              ),
            ),
          ),
          actions: [
            TextButton(
              key: const Key('hatake.form.cancel'),
              onPressed: controller.submitting ? null : _cancel,
              child: const Text('キャンセル'),
            ),
            FilledButton(
              key: const Key('hatake.form.save'),
              onPressed: controller.submitting ? null : _submit,
              child: controller.submitting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('保存'),
            ),
          ],
        );
      },
    );
  }
}

/// Read-only search/list page renderer.
class _MaterialSearchPage extends StatefulWidget {
  final SearchPageDefinition definition;
  final ListController controller;
  final FormatterRegistry? formatters;

  const _MaterialSearchPage({
    required this.definition,
    required this.controller,
    required this.formatters,
  });

  @override
  State<_MaterialSearchPage> createState() => _MaterialSearchPageState();
}

class _MaterialSearchPageState extends State<_MaterialSearchPage> {
  final Map<String, TextEditingController> _textFilters = {};
  final Map<String, Object?> _selectFilters = {};
  late final FormatterRegistry _formatters =
      widget.formatters ?? FormatterRegistry();

  SearchPageDefinition get _def => widget.definition;
  ListController get _controller => widget.controller;
  Set<String> get _roles => HatakeScope.of(context).roles;

  @override
  void initState() {
    super.initState();
    for (final filter in _def.search?.filters ?? const []) {
      if (filter.type == FieldTypes.select) {
        _selectFilters[filter.field] = null;
      } else {
        _textFilters[filter.field] = TextEditingController();
      }
    }
  }

  @override
  void dispose() {
    for (final controller in _textFilters.values) {
      controller.dispose();
    }
    super.dispose();
  }

  void _runSearch() {
    final filters = <String, Object?>{};
    _textFilters.forEach((field, controller) {
      final text = controller.text.trim();
      if (text.isNotEmpty) filters[field] = text;
    });
    _selectFilters.forEach((field, value) {
      if (value != null) filters[field] = value;
    });
    _controller.search(filters);
  }

  ActionDefinition? _actionById(String id) {
    for (final action in _def.actions) {
      if (action.id == id) return action;
    }
    return null;
  }

  Future<void> _runAction(ActionDefinition action, {DataRecord? record}) async {
    if (action.type == ActionTypes.navigate) {
      _navigateAction(context, action, record: record);
      return;
    }
    final registry = HatakeScope.of(context).actions;
    final handler =
        action.plugin == null ? null : registry.resolve(action.plugin!);
    if (handler == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('アクション "${action.id}" のハンドラが未登録です')),
      );
      return;
    }
    await handler(ActionContext(
      buildContext: context,
      controller: _controller,
      action: action,
      record: record,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final rowActionIds = _def.table.rowActions;
    final pageActions = _def.actions
        .where((a) => !rowActionIds.contains(a.id) && isAllowed(a.roles, _roles))
        .toList();

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(_def.title, style: theme.textTheme.headlineSmall),
              ),
              for (final action in pageActions) ...[
                FilledButton(
                  key: Key('hatake.action.${action.id}'),
                  onPressed: () => _runAction(action),
                  child: Text(action.label),
                ),
                const SizedBox(width: 8),
              ],
            ],
          ),
          const SizedBox(height: 12),
          if (_def.search != null) ...[
            _buildSearchArea(),
            const SizedBox(height: 12),
          ],
          Expanded(child: _buildBody(rowActionIds)),
          const SizedBox(height: 8),
          _buildPagination(theme),
        ],
      ),
    );
  }

  Widget _buildSearchArea() {
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        for (final filter in _def.search!.filters)
          SizedBox(width: 220, child: _buildFilterInput(filter)),
        FilledButton.icon(
          key: const Key('hatake.search'),
          onPressed: _runSearch,
          icon: const Icon(Icons.search),
          label: const Text('検索'),
        ),
      ],
    );
  }

  Widget _buildFilterInput(FilterDefinition filter) {
    if (filter.type == FieldTypes.select) {
      return DropdownButtonFormField<Object?>(
        key: Key('hatake.filter.${filter.field}'),
        initialValue: _selectFilters[filter.field],
        decoration: InputDecoration(
          labelText: filter.label,
          border: const OutlineInputBorder(),
          isDense: true,
        ),
        items: [
          const DropdownMenuItem<Object?>(value: null, child: Text('—')),
          for (final option in filter.options)
            DropdownMenuItem<Object?>(
              value: option.value,
              child: Text(option.label),
            ),
        ],
        onChanged: (value) =>
            setState(() => _selectFilters[filter.field] = value),
      );
    }
    return TextField(
      key: Key('hatake.filter.${filter.field}'),
      controller: _textFilters[filter.field],
      decoration: InputDecoration(
        labelText: filter.label,
        border: const OutlineInputBorder(),
        isDense: true,
      ),
      onSubmitted: (_) => _runSearch(),
    );
  }

  Widget _buildBody(List<String> rowActionIds) {
    if (_controller.loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_controller.error != null) {
      return Center(
        child: Text(
          'エラー: ${_controller.error}',
          key: const Key('hatake.error'),
          style: TextStyle(color: Theme.of(context).colorScheme.error),
        ),
      );
    }
    if (_controller.items.isEmpty) {
      return const Center(
        child: Text('データがありません', key: Key('hatake.empty')),
      );
    }

    final columns =
        _def.table.columns.where((c) => isAllowed(c.roles, _roles)).toList();
    final rowActions = rowActionIds
        .map(_actionById)
        .whereType<ActionDefinition>()
        .where((a) => isAllowed(a.roles, _roles))
        .toList();

    return SingleChildScrollView(
      scrollDirection: Axis.vertical,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          columns: [
            for (final column in columns)
              DataColumn(
                label: Text(column.label),
                onSort: column.sortable
                    ? (index, ascending) =>
                        _controller.sortBy(column.field, ascending: ascending)
                    : null,
              ),
            if (rowActions.isNotEmpty) const DataColumn(label: Text('')),
          ],
          rows: [
            for (final record in _controller.items)
              DataRow(
                cells: [
                  for (final column in columns)
                    DataCell(_buildCell(column, record[column.field])),
                  if (rowActions.isNotEmpty)
                    DataCell(Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        for (final action in rowActions)
                          TextButton(
                            key: Key(
                                'hatake.rowaction.${action.id}.${record[_def.keyField]}'),
                            onPressed: () =>
                                _runAction(action, record: record),
                            child: Text(action.label),
                          ),
                      ],
                    )),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildCell(ColumnDefinition column, Object? value) {
    final text = column.format != null
        ? _formatters.format(column.format!, value, column.config)
        : value?.toString() ?? '';
    switch (column.type) {
      case ColumnTypes.badge:
        return Chip(
          label: Text(text),
          visualDensity: VisualDensity.compact,
        );
      case ColumnTypes.boolean:
        return Icon(value == true ? Icons.check : Icons.close, size: 18);
      default:
        return Text(text);
    }
  }

  Widget _buildPagination(ThemeData theme) {
    final page = _controller.page;
    final pageCount = _controller.pageCount;
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        Text('全 ${_controller.totalCount} 件', style: theme.textTheme.bodySmall),
        const SizedBox(width: 16),
        IconButton(
          key: const Key('hatake.prev'),
          icon: const Icon(Icons.chevron_left),
          onPressed: page > 0 ? () => _controller.setPage(page - 1) : null,
        ),
        Text('${page + 1} / $pageCount'),
        IconButton(
          key: const Key('hatake.next'),
          icon: const Icon(Icons.chevron_right),
          onPressed:
              page < pageCount - 1 ? () => _controller.setPage(page + 1) : null,
        ),
      ],
    );
  }
}

/// Read-only single-record detail page renderer.
class _MaterialDetailPage extends StatelessWidget {
  final DetailPageDefinition definition;
  final DetailController controller;
  final FormatterRegistry formatters;

  const _MaterialDetailPage({
    required this.definition,
    required this.controller,
    required this.formatters,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child:
                    Text(definition.title, style: theme.textTheme.headlineSmall),
              ),
              for (final action in definition.actions)
                if (isAllowed(action.roles, HatakeScope.of(context).roles)) ...[
                  FilledButton(
                    key: Key('hatake.action.${action.id}'),
                    onPressed: () => _runAction(context, action),
                    child: Text(action.label),
                  ),
                  const SizedBox(width: 8),
                ],
            ],
          ),
          const SizedBox(height: 12),
          Expanded(child: SingleChildScrollView(child: _buildBody(context))),
        ],
      ),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (controller.loading) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: CircularProgressIndicator(),
        ),
      );
    }
    if (controller.error != null) {
      return Center(
        child: Text(
          'エラー: ${controller.error}',
          key: const Key('hatake.error'),
          style: TextStyle(color: Theme.of(context).colorScheme.error),
        ),
      );
    }
    final record = controller.record;
    if (record == null) {
      return const Center(child: Text('データがありません', key: Key('hatake.empty')));
    }
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final section in definition.form.sections) ...[
          if (section.title != null && section.title!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 12, bottom: 4),
              child: Text(section.title!, style: theme.textTheme.titleSmall),
            ),
          for (final field in section.fields)
            if (isAllowed(field.roles, HatakeScope.of(context).roles))
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 160,
                    child: Text(
                      field.label,
                      style: theme.textTheme.bodyMedium
                          ?.copyWith(color: theme.colorScheme.outline),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      _display(field, record[field.field]),
                      key: Key('hatake.detail.${field.field}'),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ],
    );
  }

  String _display(FieldDefinition field, Object? value) {
    if (field.format != null) {
      return formatters.format(field.format!, value, field.config);
    }
    return value?.toString() ?? '';
  }

  Future<void> _runAction(BuildContext context, ActionDefinition action) async {
    if (action.type == ActionTypes.navigate) {
      _navigateAction(context, action, record: controller.record);
      return;
    }
    final registry = HatakeScope.of(context).actions;
    final handler =
        action.plugin == null ? null : registry.resolve(action.plugin!);
    if (handler == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('アクション "${action.id}" のハンドラが未登録です')),
      );
      return;
    }
    await handler(ActionContext(
      buildContext: context,
      controller: controller,
      action: action,
      record: controller.record,
    ));
  }
}

/// Standalone create/edit form page renderer (inline form, no dialog).
class _MaterialFormPage extends StatefulWidget {
  final FormPageDefinition definition;
  final FormController controller;
  final Map<String, MaterialFieldBuilder> fieldBuilders;

  const _MaterialFormPage({
    required this.definition,
    required this.controller,
    required this.fieldBuilders,
  });

  @override
  State<_MaterialFormPage> createState() => _MaterialFormPageState();
}

class _MaterialFormPageState extends State<_MaterialFormPage> {
  final GlobalKey<_HatakeFormFieldsState> _fields = GlobalKey();

  Future<void> _submit() async {
    final values = _fields.currentState!.collect();
    final saved = await widget.controller.submit(values);
    if (saved != null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('保存しました')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.definition.title, style: theme.textTheme.headlineSmall),
          const SizedBox(height: 12),
          Expanded(
            child: controller.loading
                ? const Center(child: CircularProgressIndicator())
                : SingleChildScrollView(
                    child: _HatakeFormFields(
                      key: _fields,
                      form: widget.definition.form,
                      initial: controller.draft,
                      validation: controller.validation,
                      fieldBuilders: widget.fieldBuilders,
                      roles: HatakeScope.of(context).roles,
                    ),
                  ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              FilledButton(
                key: const Key('hatake.form.save'),
                onPressed:
                    controller.loading || controller.submitting ? null : _submit,
                child: controller.submitting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('保存'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

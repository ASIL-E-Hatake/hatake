part of '../material_renderer.dart';

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
  late final FormatterRegistry _formatters =
      widget.formatters ?? FormatterRegistry();

  /// 一括実行のために選んだ行（`scope: selection` のボタンが在るときだけ使う）。
  final _selection = _RowSelection();

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onRowsChanged);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onRowsChanged);
    super.dispose();
  }

  /// 行が入れ替わったら選択を捨てる（画面に無い行へ実行できてしまうのを防ぐ）。
  void _onRowsChanged() {
    if (_selection.syncRows(widget.controller.items) && mounted) {
      setState(() {});
    }
  }

  CrudLike get _def => widget.definition;
  CrudController get _controller => widget.controller;
  Set<String> get _roles => HatakeScope.of(context).roles;

  Future<void> _openForm() {
    return showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _FormDialog(
        definition: _def,
        controller: _controller,
        fieldBuilders: widget.fieldBuilders,
        roles: _roles,
        formatters: _formatters,
        validators: HatakeScope.of(context).validators,
        computeds: HatakeScope.of(context).computeds,
        subTables: HatakeScope.of(context).subTableController,
        repositories: HatakeScope.of(context).repositories,
      ),
    );
  }

  /// One dispatcher for every page kind (see `_runPageAction`), so `confirm` /
  /// `onSuccess` behave the same wherever the action sits.
  Future<void> _onAction(ActionDefinition action) async {
    final selected = action.scope == ActionScopes.selection
        ? _selection.pick(_controller.items, _def.keyField)
        : const <DataRecord>[];
    final ran = await _runPageAction(
      context,
      action,
      _controller,
      records: selected,
      onExport: _export,
      onCreate: () {
        _controller.startCreate();
        return _openForm();
      },
    );
    // 実行できたら選択を解く（同じ行に二度実行するのは、まず事故）。
    if (ran && selected.isNotEmpty && mounted) {
      setState(_selection.clear);
    }
  }

  /// Re-query so the CSV holds the whole result, not just the page shown.
  Future<bool> _export(BuildContext context, ActionDefinition action) {
    return _runExportAction(
      context,
      action,
      columns: _def.table.columns,
      rows: _controller.fetchForExport,
      formatters: _formatters,
      fallbackName: _def.title,
    );
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
                  if (action.scope == ActionScopes.selection)
                    _bulkButton(
                      action: action,
                      count: _selection
                          .pick(_controller.items, _def.keyField)
                          .length,
                      onPressed: () => _onAction(action),
                      roles: _roles,
                    )
                  else
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
            _SearchArea(search: _def.search!, onSearch: _controller.search),
            const SizedBox(height: 12),
          ],
          Expanded(child: _buildBody()),
          const SizedBox(height: 8),
          _buildPagination(theme),
        ],
      ),
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
    final selectable = _hasSelectionAction(_def.actions, _roles);

    return SingleChildScrollView(
      scrollDirection: Axis.vertical,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          // 表が選択可能になるのは、選んだ行に対して実行するボタンが在るときだけ。
          showCheckboxColumn: selectable,
          columns: [
            for (final column in columns)
              DataColumn(
                label: _sizedColumn(column, Text(column.label)),
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
                selected: selectable && _selection.has(record[_def.keyField]),
                onSelectChanged: !selectable
                    ? null
                    : (value) => setState(() => _selection.toggle(
                          record[_def.keyField],
                          selected: value ?? false,
                          rows: _controller.items,
                        )),
                cells: [
                  for (final column in columns)
                    DataCell(_sizedColumn(
                        column, _buildCell(column, record[column.field]))),
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

  /// Deletes a row, asking first.
  ///
  /// **A delete always asks**, even when the definition says nothing: it is the
  /// one action that cannot be undone. Declaring `confirm` on a `delete` action
  /// replaces the wording; `onSuccess` adds a message or a move afterwards.
  Future<void> _delete(Object key, DataRecord record) async {
    final declared = _declaredAction(_def.actions, ActionTypes.delete);
    if (!await _confirmAction(context, declared?.confirm, destructive: true)) {
      return;
    }
    if (!mounted) return;
    await _controller.deleteRecord(key);
    if (!mounted) return;
    final failure = _controller.error;
    if (failure != null) {
      // 消せなかった理由は画面にも出るが、業務の言葉で言えるなら定義側が言う
      // （「受注が残っているので削除できません」）。
      if (declared?.onError != null) {
        _showActionFailure(context, declared!, error: failure);
      }
      return;
    }
    _afterActionSuccess(context, declared?.onSuccess, record: record);
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
            onPressed: key == null ? null : () => _delete(key, record),
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

/// The create/edit form shown as a dialog (used by CRUD/master pages).
class _FormDialog extends StatefulWidget {
  final CrudLike definition;
  final CrudController controller;
  final Map<String, MaterialFieldBuilder> fieldBuilders;
  final Set<String> roles;
  final FormatterRegistry formatters;
  final ValidatorRegistry validators;
  final ComputedRegistry computeds;
  final SubTableControllerFactory subTables;

  /// 選択肢を Repository から引く項目（`optionsSource`）のため。ダイアログは
  /// HatakeScope の外なので、開く側から渡してもらう。
  final RepositoryRegistry repositories;

  const _FormDialog({
    required this.definition,
    required this.controller,
    required this.fieldBuilders,
    required this.roles,
    required this.formatters,
    required this.validators,
    required this.computeds,
    required this.subTables,
    required this.repositories,
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
                formatters: widget.formatters,
                validators: widget.validators,
                computeds: widget.computeds,
                subTables: widget.subTables,
                repositories: widget.repositories,
                // 条件式の `{ mode: create }` / `{ mode: edit }` 用。検証と同じ
                // ものを使う（ズレると「見えているのに検証されない項目」になる）。
                mode: controller.formMode,
                // Child rows need the parent key; null while creating.
                recordKey: isCreate
                    ? null
                    : controller.draft[widget.definition.keyField],
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
